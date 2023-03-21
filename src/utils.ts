import dotenv from "dotenv";
import axios from "axios";
import BigNumber from "bignumber.js";
import { LogDescription } from "forta-agent";
import { AddressRecord } from "./swap";
dotenv.config();
const { KEY } = process.env;
const internalTxsURL = "https://api.etherscan.io/api?module=account&action=txlistinternal&txhash="

const getInternalTxsWithValueToMsgSender = async (hash: string, msgSender: string): Promise<any[]> => {
    const url = `${internalTxsURL}${hash}&apikey=${KEY}`;
    try {
        const response = await axios.get(url);
        if (response.status !== 1) {
            console.log(`api error occured while getting internal transactions; ${response.data.message}`);
            return [];
        }
        return response.data.result.filter(((result: any) => result.to === msgSender && result.value > 0));
    }
    catch (error) {
        console.log(`Error; ${error}`);
        return []
    }
}

const pushOrCreateData = (
    totalEthReceived: BigNumber, 
    msgSender: string, 
    blockNumber: number,
    timestamp: number, 
    erc20TransferEventsFromMsgSender: LogDescription[]
    ) => {
        AddressRecord.has(msgSender)
}


export {
    getInternalTxsWithValueToMsgSender,
    pushOrCreateData
}