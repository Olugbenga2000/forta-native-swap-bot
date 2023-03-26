import { ethers, Finding, FindingSeverity, FindingType, Label, EntityType } from "forta-agent";
import { UserSwapData } from "./swap";
import {Erc20TransferData} from "./swap"

export const createMetadata = (sender: string, addrRecord: UserSwapData, adScore: number): {
    [key: string]: string;
} => {
    let totalSwapCount = addrRecord.tokenSwapData.length;
    const initialValue: Erc20TransferData[] = [];
    const swapTokensAddressesAndAmount = addrRecord.tokenSwapData.reduce(((acc1, data) =>    
        [ ...acc1, ...data.tokensSwapped.reduce(((acc, transferData) =>[...acc, transferData]), 
        initialValue)]
    ) ,initialValue)
    return {
        attackerAddress: sender,
        totalEthReceived: ethers.utils.formatEther(addrRecord.totalEthReceived.toString()),
        totalSwapCount: totalSwapCount.toString(),
        swapStartBlock: addrRecord.tokenSwapData[0].blockNumber.toString(),
        swapStartBlockTimestamp: addrRecord.tokenSwapData[0].blockTimestamp.toString(),
        swapEndBlock: addrRecord.tokenSwapData[totalSwapCount - 1].blockNumber.toString(),
        swapEndBlockTimestamp: addrRecord.tokenSwapData[totalSwapCount - 1].blockTimestamp.toString(),
        swapTokensAddressesAndAmounts: JSON.stringify(swapTokensAddressesAndAmount),
        anomalyScore: adScore.toString()
    };
};

export const createNewFinding = (sender: string, addrRecord: UserSwapData, adScore: number): Finding =>
    Finding.fromObject({
        name: "Unusual Native Swaps Forta Detection Bot",
        description: `Unusual native swap behavior by ${sender} has been detected`,
        alertId: "UNUSUAL-NATIVE-SWAPS",
        severity: FindingSeverity.Unknown,
        type: FindingType.Suspicious,
        protocol: "Forta",
        metadata: createMetadata(sender, addrRecord, adScore),
        labels: [
            Label.fromObject({
              entity: sender,
              entityType: EntityType.Address,
              label: "Attacker",
              confidence: 0.3,
              remove: false
            })]
    });


