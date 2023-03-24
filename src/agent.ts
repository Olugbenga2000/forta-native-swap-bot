import {
  Finding,
  Initialize,
  HandleTransaction,
  TransactionEvent,
  getEthersProvider,
  ethers
} from "forta-agent";
import BigNumber from "bignumber.js";
import { getInternalTxsWithValueToMsgSender, pushOrCreateData, toBn, toCs, deleteRedundantData } from "./utils";
import { AddressRecord } from "./swap";
import { createNewFinding } from "./finding"


const MINIMUM_SWAP_COUNT = 2
const ERC20_TRANSFER_EVENT = "event Transfer(address indexed from, address indexed to, uint256 value)";
const LOW_TRANSACTION_COUNT_THRESHOLD = 150;
const MAX_ETH_THRESHOLD = toBn(ethers.utils.parseEther("30").toString());
export let totalNativeSwaps = 0;
export let unusualNativeSwaps = 0;

export const provideBotHandler = (
  erc20TransferEvent: string,
  provider: ethers.providers.JsonRpcProvider,
  lowTxCount: number,
  swapCountThreshold: number,
  maxEthThreshold: BigNumber
): HandleTransaction =>
  async (txEvent: TransactionEvent): Promise<Finding[]> => {
    const findings: Finding[] = [];
    const { from, hash, timestamp, blockNumber } = txEvent;
    const msgSender = toCs(from);

    // check the transaction logs for erc20 transfer events where token sender is msg.sender
    const erc20TransferEventsFromMsgSender = txEvent.filterLog(erc20TransferEvent).filter(
      (log => log.args.from === msgSender));
    if (!erc20TransferEventsFromMsgSender.length) return findings;
    // we get the transaction traces to check if the sender received eth 
    const internalTxs = await getInternalTxsWithValueToMsgSender(hash, msgSender);
    if (!internalTxs.length) return findings;
    totalNativeSwaps++;
    const nonce = await provider.getTransactionCount(msgSender, blockNumber);
    // Check if msg.sender's address is new
    if (nonce > lowTxCount) return findings;
    const totalEthReceived: BigNumber = internalTxs.reduce(((acc: BigNumber, tx) => acc.plus(tx.value)), toBn(0));
    pushOrCreateData(
      totalEthReceived,
      msgSender,
      blockNumber,
      timestamp,
      erc20TransferEventsFromMsgSender
    );
    const addressRecord = AddressRecord.get(msgSender);
    /**
     * create a finding if total eth received by the sender is greater than the threshold AND if
     * the number of swaps is greater than the swap count threshold (Attackers typically swap multiple tokens 
     * when laundering stolen funds)
      */

    if (addressRecord?.totalEthReceived.gte(maxEthThreshold) &&
      addressRecord.tokenSwapData.length >= swapCountThreshold) {
      unusualNativeSwaps++;
      let adScore = unusualNativeSwaps / totalNativeSwaps;
      findings.push(createNewFinding(msgSender, addressRecord, adScore));
    }
    // remove redundant data from the AddressRecord Map every 10000 blocks
    if (blockNumber % 10000 === 0) deleteRedundantData(timestamp);
    return findings;
  };


export default {
  handleTransaction: provideBotHandler(
    ERC20_TRANSFER_EVENT,
    getEthersProvider(),
    LOW_TRANSACTION_COUNT_THRESHOLD,
    MINIMUM_SWAP_COUNT,
    MAX_ETH_THRESHOLD, 
  )
};
