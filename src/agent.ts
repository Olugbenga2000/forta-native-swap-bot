import {
  Finding,
  Initialize,
  HandleTransaction,
  TransactionEvent,
  getEthersProvider,
  ethers
} from "forta-agent";
import BigNumber from "bignumber.js";
import { getInternalTxsWithValueToMsgSender, pushOrCreateData } from "./utils";
import { AddressRecord } from "./swap";



const ERC20_TRANSFER_EVENT = "event Transfer(address indexed from, address indexed to, uint256 value)";
const LOW_TRANSACTION_COUNT_THRESHOLD = 100;
let totalNativeSwaps = 0;

export const provideBotHandler = (
  erc20TransferEvent: string,
  provider: ethers.providers.JsonRpcProvider,
  lowTxCount: number
): HandleTransaction =>
  async (txEvent: TransactionEvent): Promise<Finding[]> => {
    const findings: Finding[] = [];
    const { from: msgSender, hash, timestamp, blockNumber } = txEvent;

    // check the transaction logs for erc20 transfer events where token sender is msg.sender
    const erc20TransferEventsFromMsgSender = txEvent.filterLog(erc20TransferEvent).filter(
      (log => log.args.from === msgSender));
    if (!erc20TransferEventsFromMsgSender) return findings;

    const internalTxs = await getInternalTxsWithValueToMsgSender(hash, msgSender);
    if (!internalTxs) return findings;
    totalNativeSwaps++;
    const nonce = await provider.getTransactionCount(msgSender, blockNumber);
    // Check if msg.sender's address is new
    if (nonce > LOW_TRANSACTION_COUNT_THRESHOLD) return findings;
    // todo: replace any with type declarations
    const totalEthReceived: BigNumber = internalTxs.reduce(((acc: BigNumber, tx) => acc.plus(tx.value)), 0);
    pushOrCreateData(
      totalEthReceived,
      msgSender,
      blockNumber,
      timestamp,
      erc20TransferEventsFromMsgSender
    );


    return findings;
  };


export default {
  handleTransaction: provideBotHandler(
    ERC20_TRANSFER_EVENT,
    getEthersProvider(),
    LOW_TRANSACTION_COUNT_THRESHOLD),
  BigNumber

};
