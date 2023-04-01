import { Finding, Initialize, HandleTransaction, TransactionEvent, getEthersProvider, ethers } from "forta-agent";
import BigNumber from "bignumber.js";
import { createOrUpdateData, toBn, toCs, deleteRedundantData } from "./utils";
import { AddressRecord } from "./swap";
import { createNewFinding } from "./finding";
import { MINIMUM_SWAP_COUNT, ERC20_TRANSFER_EVENT, LOW_NONCE_THRESHOLD } from "./constants";
import NetworkManager, { NETWORK_MAP } from "./network";

const networkManager = new NetworkManager();
export let totalNativeSwaps = 0;
let unusualNativeSwaps = 0;

export const initialize = (provider: ethers.providers.Provider) => async () => {
  const { chainId } = await provider.getNetwork();
  networkManager.setNetwork(chainId);
};

export const provideBotHandler = (
  erc20TransferEvent: string,
  provider: ethers.providers.JsonRpcProvider,
  lowTxCount: number,
  swapCountThreshold: number,
  network: NetworkManager
): HandleTransaction => async (txEvent: TransactionEvent): Promise<Finding[]> => {
  const findings: Finding[] = [];
  const { from, hash, timestamp, blockNumber } = txEvent;
  // remove redundant data from the AddressRecord Map and get latest price from chainlink oracle every 10000 blocks
  if (blockNumber % 10000 === 0) {
    deleteRedundantData(timestamp);
    await network.getLatestPriceFeed(provider);
  }
  const msgSender = toCs(from);
  // check the transaction logs for erc20 transfer events where token sender is msg.sender
  const erc20TransferEventsFromMsgSender = txEvent
    .filterLog(erc20TransferEvent)
    .filter(log => log.args.from === msgSender && log.args.to !== ethers.constants.AddressZero);
  if (!erc20TransferEventsFromMsgSender.length) return findings;
  // Compare account balance at previous block to balance at current block to determine if a swap occured
  const previousBalance = toBn((await provider.getBalance(msgSender, blockNumber - 1)).toString());
  const currentBalance = toBn((await provider.getBalance(msgSender, blockNumber)).toString());
  const ethBalanceDiff = currentBalance.minus(previousBalance);
  if (ethBalanceDiff.lte(0)) return findings;
  totalNativeSwaps++;
  const nonce = await provider.getTransactionCount(msgSender, blockNumber);
  // Check if msg.sender's address is new
  if (nonce > lowTxCount) return findings;
  createOrUpdateData(ethBalanceDiff, hash, msgSender, blockNumber, timestamp, erc20TransferEventsFromMsgSender);
  const addressRecord = AddressRecord.get(msgSender);
  /**
   * create a finding if total eth received by the sender is greater than the threshold AND if
   * the number of swaps is greater than the swap count threshold (Attackers typically swap multiple tokens
   * when laundering stolen funds)
   */
  const minNativeThreshold = toBn(ethers.utils.parseEther(network.minNativeThreshold).toString());
  if (
    addressRecord?.totalEthReceived.gte(minNativeThreshold) &&
    addressRecord.tokenSwapData.length >= swapCountThreshold
  ) {
    unusualNativeSwaps++;
    let adScore = unusualNativeSwaps / totalNativeSwaps;
    findings.push(createNewFinding(msgSender, addressRecord, adScore));
  }

  return findings;
};

export default {
  initialize: initialize(getEthersProvider()),
  handleTransaction: provideBotHandler(
    ERC20_TRANSFER_EVENT,
    getEthersProvider(),
    LOW_NONCE_THRESHOLD,
    MINIMUM_SWAP_COUNT,
    networkManager
  ),
};
