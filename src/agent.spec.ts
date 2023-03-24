import { FindingType, FindingSeverity, Finding, HandleTransaction, ethers, EntityType, Label } from "forta-agent";
import { createAddress, createChecksumAddress } from "forta-agent-tools/lib/utils";
import { TestTransactionEvent } from "forta-agent-tools/lib/test";
import BigNumber from "bignumber.js";
import axios from "axios";
import { provideBotHandler,totalNativeSwaps, unusualNativeSwaps } from "./agent";
import { toBn, toCs } from "./utils";
import { createMetadata } from "./finding";
import { UserSwapData } from "./swap";

BigNumber.set({ DECIMAL_PLACES: 18 });

const MOCK_MINIMUM_SWAP_COUNT = 2;
const MOCK_ERC20_TRANSFER_EVENT = "event Transfer(address indexed from, address indexed to, uint256 value)";
const MOCK_ERC20_APPROVAL_EVENT = "event Approval(address indexed owner, address indexed spender, uint256 value)";
const MOCK_LOW_TRANSACTION_COUNT_THRESHOLD = 150;
const MOCK_MAX_ETH_THRESHOLD = toBn(ethers.utils.parseEther("30").toString());
let mockTotalNativeSwaps = 0;
let mockUnusualNativeSwaps = 0;

const ADDRESSES = {
    address1: createChecksumAddress("0xd4582"),
    address2: createChecksumAddress("0x9C17"),
    attacker: createChecksumAddress("0xb8652"),
    contractAddr: createChecksumAddress("0x3852A"),
}

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

const MOCK_ERC20_IFACE = new ethers.utils.Interface([MOCK_ERC20_TRANSFER_EVENT, MOCK_ERC20_APPROVAL_EVENT]);
const createTransferEvent = (
    from: string,
    to: string,
    value: string
): [ethers.utils.EventFragment, string, any[]] => [
        MOCK_ERC20_IFACE.getEvent("Transfer"),
        ADDRESSES.contractAddr,
        [from, to, value],
    ];

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("unusual native swaps bot tests", () => {
    const mockProvider = {
        getTransactionCount: jest.fn()
    }
    let handleTransaction: HandleTransaction;

    beforeEach(() => {
        mockProvider.getTransactionCount.mockReset();
        mockedAxios.get.mockReset()
        handleTransaction = provideBotHandler(
            MOCK_ERC20_TRANSFER_EVENT,
            mockProvider as unknown as ethers.providers.JsonRpcProvider,
            MOCK_LOW_TRANSACTION_COUNT_THRESHOLD,
            MOCK_MINIMUM_SWAP_COUNT,
            MOCK_MAX_ETH_THRESHOLD
        );
    });

    describe("no finding cases", () => {
        it("should return an empty finding when there's no event in the transaction log", async() => {
            const txEvent  = new TestTransactionEvent()
            .setFrom(ADDRESSES.address1);
            expect(await handleTransaction(txEvent)).toStrictEqual([]);
            expect(axios.get).toHaveBeenCalledTimes(0);
        });

        it("should return an empty finding when there are other events apart from transfer event in the tx log", async() => {
            const txEvent  = new TestTransactionEvent()
            .setFrom(ADDRESSES.address1)
            .addEventLog(MOCK_ERC20_IFACE.getEvent("Approval"), ADDRESSES.contractAddr,
            [ADDRESSES.address1, ADDRESSES.address2, "100000"]);

            expect(await handleTransaction(txEvent)).toStrictEqual([]);
            expect(axios.get).toHaveBeenCalledTimes(0);
        });

        it("should return an empty finding when there's a transfer event where the msgSender is not equal to token sender", async() => {
            const txEvent  = new TestTransactionEvent()
            .setFrom(ADDRESSES.attacker)
            .addEventLog(...createTransferEvent(ADDRESSES.address1, ADDRESSES.address2, "10000000"));

            expect(await handleTransaction(txEvent)).toStrictEqual([]);
            expect(axios.get).toHaveBeenCalledTimes(0);
        });

        it("should return an empty finding when there's a token transfer from msgSender but no corresponding ether transfer", async() => {
            const txEvent  = new TestTransactionEvent()
            .setFrom(ADDRESSES.attacker)
            .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "10000000"));
            const response = {data : { status: '0', message: 'No transactions found', result: []}};
            mockedAxios.get.mockResolvedValueOnce(response);
            expect(await handleTransaction(txEvent)).toStrictEqual([]);
            expect(axios.get).toHaveBeenCalledTimes(1);
            expect(totalNativeSwaps).toStrictEqual(0);
            expect(mockProvider.getTransactionCount).toHaveBeenCalledTimes(0)
        });

        it("should return an empty finding when there's ether transfer but not to msgSender", async() => {
            const txEvent  = new TestTransactionEvent()
            .setFrom(ADDRESSES.attacker)
            .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "10000000"));
            const response = {data : { status: '1', message: 'OK', result: [
                {from: ADDRESSES.address2, to: ADDRESSES.contractAddr, value: "95745666"},
                {from: ADDRESSES.address1, to: ADDRESSES.address2, value: "754433300"},
        ]}};
            mockedAxios.get.mockResolvedValueOnce(response);
            expect(await handleTransaction(txEvent)).toStrictEqual([]);
            expect(axios.get).toHaveBeenCalledTimes(1);
            expect(totalNativeSwaps).toStrictEqual(0);
            expect(mockProvider.getTransactionCount).toHaveBeenCalledTimes(0)
        });

        it("should return an empty finding when the msgSender isn't a new address (has high nonce)", async() => {
            const txEvent  = new TestTransactionEvent()
            .setFrom(ADDRESSES.attacker)
            .setBlock(19995400)
            .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "10000000"));
            const response = {data : { status: '1', message: 'OK', result: [
                {from: ADDRESSES.address1, to: ADDRESSES.address2, value: "95745600"},
                {from: ADDRESSES.address2, to: ADDRESSES.attacker, value: "95745600"}
        ]}};
            mockedAxios.get.mockResolvedValueOnce(response);
            mockProvider.getTransactionCount.mockResolvedValueOnce(75);
            expect(await handleTransaction(txEvent)).toStrictEqual([]);
            expect(axios.get).toHaveBeenCalledTimes(1);
            expect(totalNativeSwaps).toStrictEqual(1);
            expect(mockProvider.getTransactionCount).toHaveBeenCalledTimes(1);
            expect(mockProvider.getTransactionCount).toHaveBeenCalledWith(ADDRESSES.attacker, 19995400);

        });
    })

})
