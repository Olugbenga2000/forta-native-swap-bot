import { Finding, FindingSeverity, FindingType } from "forta-agent";
import { UserSwapData } from "./swap";

export const createNewFinding = (sender: string, addrRecord: UserSwapData): Finding =>
    Finding.fromObject({
        name: "Native Swaps Forta Detection Bot",
        description: `Unusual native swap behavior by ${sender} has been detected`,
        alertId: "UNUSUAL-NATIVE-SWAPS",
        severity: FindingSeverity.Unknown,
        type: FindingType.Suspicious,
        protocol: "GitcoinForta",
        metadata,
    })
