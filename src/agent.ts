import { Finding, Initialize, HandleTransaction, TransactionEvent, getEthersProvider, ethers } from "forta-agent";
import BigNumber from "bignumber.js";
import { getInternalTxsWithValueToMsgSender, createOrUpdateData, toBn, toCs, deleteRedundantData } from "./utils";
import { AddressRecord } from "./swap";
import { createNewFinding } from "./finding";
import { MINIMUM_SWAP_COUNT, ERC20_TRANSFER_EVENT, LOW_NONCE_THRESHOLD, MIN_ETH_THRESHOLD } from "./constants";

export let totalNativeSwaps = 0;
let unusualNativeSwaps = 0;

export const provideBotHandler = (
  erc20TransferEvent: string,
  provider: ethers.providers.JsonRpcProvider,
  lowTxCount: number,
  swapCountThreshold: number,
  minEthThreshold: BigNumber
): HandleTransaction => async (txEvent: TransactionEvent): Promise<Finding[]> => {
  const findings: Finding[] = [];
  const { from, hash, timestamp, blockNumber } = txEvent;

  // remove redundant data from the AddressRecord Map every 10000 blocks
  if (blockNumber % 10000 === 0) deleteRedundantData(timestamp);

  const msgSender = toCs(from);

  // check the transaction logs for erc20 transfer events where token sender is msg.sender
  const erc20TransferEventsFromMsgSender = txEvent
    .filterLog(erc20TransferEvent)
    .filter(log => log.args.from === msgSender && log.args.to !== ethers.constants.AddressZero);
  if (!erc20TransferEventsFromMsgSender.length) return findings;
  // we get the transaction traces to check if the sender received eth
  const internalTxs = await getInternalTxsWithValueToMsgSender(hash, msgSender);
  if (!internalTxs.length) return findings;
  totalNativeSwaps++;
  const nonce = await provider.getTransactionCount(msgSender, blockNumber);
  // Check if msg.sender's address is new
  if (nonce > lowTxCount) return findings;
  const totalEthReceived: BigNumber = internalTxs.reduce((acc: BigNumber, tx) => acc.plus(tx.value), toBn(0));
  createOrUpdateData(totalEthReceived, hash, msgSender, blockNumber, timestamp, erc20TransferEventsFromMsgSender);
  const addressRecord = AddressRecord.get(msgSender);
  /**
   * create a finding if total eth received by the sender is greater than the threshold AND if
   * the number of swaps is greater than the swap count threshold (Attackers typically swap multiple tokens
   * when laundering stolen funds)
   */

  if (
    addressRecord?.totalEthReceived.gte(minEthThreshold) &&
    addressRecord.tokenSwapData.length >= swapCountThreshold
  ) {
    unusualNativeSwaps++;
    let adScore = unusualNativeSwaps / totalNativeSwaps;
    findings.push(createNewFinding(msgSender, addressRecord, adScore));
  }

  return findings;
};

export default {
  handleTransaction: provideBotHandler(
    ERC20_TRANSFER_EVENT,
    getEthersProvider(),
    LOW_NONCE_THRESHOLD,
    MINIMUM_SWAP_COUNT,
    toBn(ethers.utils.parseEther(MIN_ETH_THRESHOLD.toString()).toString())
  ),
};
