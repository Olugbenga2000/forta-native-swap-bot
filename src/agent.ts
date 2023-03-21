import {
  Finding,
  Initialize,
  HandleTransaction,
  TransactionEvent,
} from "forta-agent";

export const ERC20_TRANSFER_EVENT =
  "event Transfer(address indexed from, address indexed to, uint256 value)";

  export const provideBotHandler = (erc20TransferEvent: string): HandleTransaction =>
    async (txEvent: TransactionEvent): Promise<Finding[]> => {
  const findings: Finding[] = [];

  // check the transaction logs for erc20 transfer events
  const tetherTransferEvents = txEvent.filterLog(
    erc20TransferEvent,
  );
  if(!tetherTransferEvents) return findings
  let msgSender = txEvent.from, txHash = txEvent.hash;
  getInternalTxsWithValueTomsgSender(txHash, msgSender)

  tetherTransferEvents.forEach((transferEvent) => {
    // extract transfer event arguments
    const { to, from, value } = transferEvent.args;

    // if more than 10,000 Tether were transferred, report it
  });

  return findings;
};


export default {
  handleTransaction: provideBotHandler(ERC20_TRANSFER_EVENT),
  
};
