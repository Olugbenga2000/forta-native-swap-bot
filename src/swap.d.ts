import BigNumber from "./agent";

interface Erc20TransferData {
    address: string,
    amount: BigNumber
}

interface TxSwapData {
    blockNumber: number,
    blockTimestamp: number,
    tokensSwapped: [Erc20TransferData]
}

interface UserSwapData {
    totalEthReceived: BigNumber,
    tokenSwapData: [TxSwapData]
}

export const AddressRecord = new Map<string, UserSwapData>();