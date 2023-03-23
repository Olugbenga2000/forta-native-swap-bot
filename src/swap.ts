import BigNumber from "bignumber.js";

interface Erc20TransferData {
    address: string,
    amount: BigNumber
}

interface TxSwapData {
    blockNumber: number,
    blockTimestamp: number,
    tokensSwapped: Erc20TransferData[]
}

interface UserSwapData {
    totalEthReceived: BigNumber,
    tokenSwapData: TxSwapData[]
}

const AddressRecord = new Map<string, UserSwapData>();


interface InternalTx {
    value: BigNumber,
    to: string
}

export {
    Erc20TransferData,
    TxSwapData,
    UserSwapData,
    AddressRecord,
    InternalTx
}