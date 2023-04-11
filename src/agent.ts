import { Finding, HandleTransaction, TransactionEvent, getEthersProvider, ethers } from "forta-agent";
import { createOrUpdateData, toBn, toCs, deleteRedundantData} from "./utils";
import { AddressRecord } from "./swap";
import { createNewFinding } from "./finding";
import { MINIMUM_SWAP_COUNT, ERC20_TRANSFER_EVENT, LOW_NONCE_THRESHOLD, WETH_WITHDRAWAL_EVENT} from "./constants";
import NetworkManager from "./network";

const networkManager = new NetworkManager();
export let totalNativeSwaps = 0;
let unusualNativeSwaps = 0;
let prevClearTimestamp = 0;
let chainId: number;

export const initialize = (provider: ethers.providers.Provider) => async () => {
  chainId = (await provider.getNetwork()).chainId;
  networkManager.setNetwork(chainId);
};

export const provideBotHandler = (
  erc20TransferEvent: string,
  provider: ethers.providers.JsonRpcProvider,
  lowTxCount: number,
  swapCountThreshold: number,
  network: NetworkManager,
  wethWithdrawalEvent: string
): HandleTransaction => async (txEvent: TransactionEvent): Promise<Finding[]> => {
  const findings: Finding[] = [];
  const { from, hash, timestamp, blockNumber } = txEvent;

  // remove redundant data from the AddressRecord Map and get latest price from chainlink oracle every 10000 blocks
  if (blockNumber % 10000 === 0 && timestamp !== prevClearTimestamp) {
    prevClearTimestamp = timestamp;
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
  // Check for withdrawals from the wrapped native token to determine if a native swap occurred
  let wethWithdrawals;
  if (chainId === 42161 || chainId === 250) 
  wethWithdrawals = erc20TransferEvents.filter(log => log.address === network.wNative && log.args.to === ethers.constants.AddressZero)
  else
  wethWithdrawals = txEvent.filterLog(wethWithdrawalEvent, network.wNative);
  if (!wethWithdrawals.length) return findings;
  totalNativeSwaps++;
  const ethWithdrawn = wethWithdrawals.reduce((acc, log) => toBn(log.args.wad).plus(acc), toBn(0));
  

  // Check if msg.sender's address is new
  const nonce = await provider.getTransactionCount(msgSender);
  if (nonce > lowTxCount) return findings;
  createOrUpdateData(ethWithdrawn, hash, msgSender, blockNumber, timestamp, erc20TransferEventsFromMsgSender);
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
    WETH_WITHDRAWAL_EVENT
  ),
};
