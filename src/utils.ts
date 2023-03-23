import dotenv from "dotenv";
import axios from "axios";
import BigNumber from "bignumber.js";
import { LogDescription, ethers } from "forta-agent";
import { AddressRecord, Erc20TransferData, TxSwapData, UserSwapData} from "./swap";
import { BigNumberish } from "ethers";
BigNumber.set({ DECIMAL_PLACES: 18 });
dotenv.config();
const { KEY } = process.env;
const internalTxsURL = "https://api.etherscan.io/api?module=account&action=txlistinternal&txhash="
const MAX_TIMESTAMP = 30 * 60; // maximum time between concurrent swaps. 

const toBn = (ethersBn: BigNumberish) => new BigNumber(ethersBn.toString());
const toCs = (address: string) => ethers.utils.getAddress(address);

const getInternalTxsWithValueToMsgSender = async (hash: string, msgSender: string): Promise<any[]> => {
    const url = `${internalTxsURL}${hash}&apikey=${KEY}`;
    try {
        const {data} = await axios.get(url);
        if (data.status !== '1') {
            console.log(`etherscan api response: ${data.message} (internal)`);
            return [];
        }
        const {result} = data
        return result.filter(((result: any) => toCs(result.to) === msgSender && result.value > 0));
    }
    catch (error) {
        console.log(`Error; ${error}`);
        return []
    }
}

const pushOrCreateData = (
    txEthReceived: BigNumber,
    msgSender: string,
    blockNumber: number,
    blockTimestamp: number,
    erc20TransferEventsFromMsgSender: LogDescription[]
) => {
    const tokensSwapped = erc20TransferEventsFromMsgSender.map((log): Erc20TransferData => ({
        address: log.address,
        amount: toBn(log.args.value)
    }));
    const txSwapData: TxSwapData = {
        blockNumber,
        blockTimestamp,
        tokensSwapped
    };
    AddressRecord.has(msgSender)
        ? pushDataToRecord(msgSender, txEthReceived, txSwapData)
        : createNewRecord(msgSender, txEthReceived, txSwapData);
}
const pushDataToRecord = (msgSender: string, txEthReceived: BigNumber, txSwapData: TxSwapData) => {
    const addrRecord = AddressRecord.get(msgSender) as UserSwapData;
    //check if the last swap recorded is recent
    if(addrRecord.tokenSwapData[addrRecord.tokenSwapData.length - 1].blockTimestamp + MAX_TIMESTAMP
     >= txSwapData.blockTimestamp) {
        addrRecord.totalEthReceived = addrRecord.totalEthReceived.plus(txEthReceived);
        addrRecord.tokenSwapData.push(txSwapData);
     } else {   // last recorded swap isn't recent, delete previous record and start new one
        AddressRecord.delete(msgSender);
        createNewRecord(msgSender, txEthReceived, txSwapData);
     }
}

const createNewRecord = (msgSender: string, txEthReceived: BigNumber, txSwapData: TxSwapData) => {
    AddressRecord.set(msgSender, { totalEthReceived: txEthReceived, tokenSwapData: [txSwapData] })
}

const deleteRedundantData = (timestamp: number) => {
    for (let key of AddressRecord.keys()){
        let keyTokenSwapData = AddressRecord.get(key)?.tokenSwapData as TxSwapData[];
    //check if the last swap recorded for each key is outdated and can be deleted
    if (keyTokenSwapData[keyTokenSwapData.length - 1].blockTimestamp + MAX_TIMESTAMP < timestamp) 
        AddressRecord.delete(key);
}
}


export {
    getInternalTxsWithValueToMsgSender,
    pushOrCreateData,
    toBn,
    deleteRedundantData,
    toCs
}