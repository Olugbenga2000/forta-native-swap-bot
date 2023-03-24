import { FindingType, FindingSeverity, Finding, HandleTransaction, ethers, EntityType, Label } from "forta-agent";
import { createAddress, createChecksumAddress } from "forta-agent-tools/lib/utils";
import { TestTransactionEvent } from "forta-agent-tools/lib/test";
import BigNumber from "bignumber.js";
import axios from "axios";
import { provideBotHandler } from "./agent";
import { toBn, toCs } from "./utils";
import { createMetadata } from "./finding";
import { UserSwapData } from "./swap";

BigNumber.set({ DECIMAL_PLACES: 18 });

const MOCK_MINIMUM_SWAP_COUNT = 2;
const MOCK_ERC20_TRANSFER_EVENT = "event Transfer(address indexed from, address indexed to, uint256 value)";
const MOCK_LOW_TRANSACTION_COUNT_THRESHOLD = 150;
const MOCK_MAX_ETH_THRESHOLD = toBn(ethers.utils.parseEther("30").toString());
let mockTotalNativeSwaps = 0;
let mockUnusualNativeSwaps = 0;

const mockCreateNewFinding = (sender: string, addrRecord: UserSwapData, adScore: number): Finding =>
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

const MOCK_ERC20_IFACE = new ethers.utils.Interface(MOCK_ERC20_TRANSFER_EVENT);
const createTransferEvent = (
    emittingAddress: string,
    from: string,
    to: string,
    value: string
): [ethers.utils.EventFragment, string, any[]] => [
        MOCK_ERC20_IFACE.getEvent("Transfer"),
        emittingAddress,
        [from, to, value],
    ];

jest.mock("axios");

describe("unusual native swaps bot tests", () => {
    const mockProvider = {
        getTransactionCount: jest.fn()
    }
    let handleTransaction: HandleTransaction;

    beforeEach(() => {
        mockProvider.getTransactionCount.mockReset();
        handleTransaction = provideBotHandler(
            MOCK_ERC20_TRANSFER_EVENT,
            mockProvider as unknown as ethers.providers.JsonRpcProvider,
            MOCK_LOW_TRANSACTION_COUNT_THRESHOLD,
            MOCK_MINIMUM_SWAP_COUNT,
            MOCK_MAX_ETH_THRESHOLD
        );
    });

    describe("no finding cases", () => {

    })

})
