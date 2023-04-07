import BigNumber from "bignumber.js";
import { LogDescription, ethers, TransactionEvent } from "forta-agent";
import { AddressRecord, Erc20TransferData, TxSwapData, UserSwapData } from "./swap";
import { BigNumberish } from "ethers";
import { MAX_MINUTES_BETWEEN_SWAPS } from "./constants";
BigNumber.set({ DECIMAL_PLACES: 18 });
const MAX_TIMESTAMP = MAX_MINUTES_BETWEEN_SWAPS * 60; // maximum time between concurrent swaps.
const txQueue: TransactionEvent[] = [];
let currentBlockNum = 0;
let numOfBlocks = 0;

const toBn = (ethersBn: BigNumberish) => new BigNumber(ethersBn.toString());
const toCs = (address: string) => ethers.utils.getAddress(address);

const addTxToQueue = (txEvent: TransactionEvent, blockDelay: number): TransactionEvent | undefined => {
  txQueue.push(txEvent);
  if (numOfBlocks >= blockDelay) return txQueue.shift();
  const { blockNumber } = txEvent;
  if (blockNumber !== currentBlockNum) {
    numOfBlocks++;
    currentBlockNum = blockNumber;
  }
};

const createOrUpdateData = (
  txEthReceived: BigNumber,
  txHash: string,
  msgSender: string,
  blockNumber: number,
  blockTimestamp: number,
  erc20TransferEventsFromMsgSender: LogDescription[]
) => {
  const tokensSwapped = erc20TransferEventsFromMsgSender.map(
    (log): Erc20TransferData => ({
      address: log.address,
      amount: toBn(log.args.value),
      txHash,
    })
  );
  const txSwapData: TxSwapData = {
    blockNumber,
    blockTimestamp,
    tokensSwapped,
  };
  AddressRecord.has(msgSender)
    ? pushDataToRecord(msgSender, txEthReceived, txSwapData)
    : createNewRecord(msgSender, txEthReceived, txSwapData);
};
const pushDataToRecord = (msgSender: string, txEthReceived: BigNumber, txSwapData: TxSwapData) => {
  const addrRecord = AddressRecord.get(msgSender) as UserSwapData;
  //check if the last swap recorded is recent
  if (
    addrRecord.tokenSwapData[addrRecord.tokenSwapData.length - 1].blockTimestamp + MAX_TIMESTAMP >=
    txSwapData.blockTimestamp
  ) {
    addrRecord.totalEthReceived = addrRecord.totalEthReceived.plus(txEthReceived);
    addrRecord.tokenSwapData.push(txSwapData);
  } else {
    // last recorded swap isn't recent, delete previous record and start new one
    AddressRecord.delete(msgSender);
    createNewRecord(msgSender, txEthReceived, txSwapData);
  }
};

const createNewRecord = (msgSender: string, txEthReceived: BigNumber, txSwapData: TxSwapData) => {
  AddressRecord.set(msgSender, { totalEthReceived: txEthReceived, tokenSwapData: [txSwapData] });
};

const deleteRedundantData = (timestamp: number) => {
  for (let key of AddressRecord.keys()) {
    let keyTokenSwapData = AddressRecord.get(key)?.tokenSwapData as TxSwapData[];
    //check if the last swap recorded for each key is outdated and can be deleted
    if (keyTokenSwapData[keyTokenSwapData.length - 1].blockTimestamp + MAX_TIMESTAMP < timestamp)
      AddressRecord.delete(key);
  }
};

export { createOrUpdateData, toBn, deleteRedundantData, toCs, addTxToQueue, txQueue, numOfBlocks, currentBlockNum };
