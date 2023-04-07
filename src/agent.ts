import { Finding, HandleTransaction, TransactionEvent, getEthersProvider, ethers } from "forta-agent";
import { createOrUpdateData, toBn, toCs, deleteRedundantData, addTxToQueue } from "./utils";
import { AddressRecord } from "./swap";
import { createNewFinding } from "./finding";
import { MINIMUM_SWAP_COUNT, ERC20_TRANSFER_EVENT, LOW_NONCE_THRESHOLD, BLOCK_DELAY } from "./constants";
import NetworkManager from "./network";

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
  network: NetworkManager,
  blockDelay: number
): HandleTransaction => async (txEvent: TransactionEvent): Promise<Finding[]> => {
  const findings: Finding[] = [];
  let txEventOrUndefined = addTxToQueue(txEvent, blockDelay);
  if (!txEventOrUndefined) return findings;
  txEvent = txEventOrUndefined;
  const { from, hash, timestamp, blockNumber } = txEvent;
  // remove redundant data from the AddressRecord Map and get latest price from chainlink oracle every 10000 blocks
  if (blockNumber % 10000 === 0) {
    deleteRedundantData(timestamp);
    await network.getLatestPriceFeed(provider);
  }
  const msgSender = toCs(from);
  // filter the transaction logs for erc20 transfer events
  const erc20TransferEvents = txEvent.filterLog(erc20TransferEvent);
  // get events where token sender is msg.sender and no direct / indirect(liquidity removal)token burn
  const erc20TransferEventsFromMsgSender = erc20TransferEvents
    .filter(log => log.args.from === msgSender && log.args.to !== ethers.constants.AddressZero)
    .filter(log => {
      for (let transferEvent of erc20TransferEvents) {
        if (
          transferEvent.args.to === ethers.constants.AddressZero &&
          log.address === transferEvent.address &&
          log.args.to === transferEvent.args.from &&
          log.args.value.eq(transferEvent.args.value)
        )
          return false;
      }
      return true;
    });
  if (!erc20TransferEventsFromMsgSender.length) return findings;
  // Compare account balance at previous block to balance at current block to determine if a swap occured
  const [previousBalance, currentBalance, nonce] = await Promise.all([
    provider.getBalance(msgSender, blockNumber - 1),
    provider.getBalance(msgSender, blockNumber),
    provider.getTransactionCount(msgSender, blockNumber),
  ]);
  const ethBalanceDiff = toBn(currentBalance.toString()).minus(toBn(previousBalance.toString()));
  if (ethBalanceDiff.lte(0)) return findings;
  totalNativeSwaps++;
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
    networkManager,
    BLOCK_DELAY
  ),
};
