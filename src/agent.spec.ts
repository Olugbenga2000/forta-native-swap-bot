import { FindingType, FindingSeverity, Finding, HandleTransaction, ethers, EntityType, Label } from "forta-agent";
import { createChecksumAddress } from "forta-agent-tools/lib/utils";
import { TestTransactionEvent } from "forta-agent-tools/lib/test";
import BigNumber from "bignumber.js";
import axios from "axios";
import { provideBotHandler } from "./agent";
import { toBn } from "./utils";
import { createMetadata } from "./finding";
import { UserSwapData, AddressRecord } from "./swap";
BigNumber.set({ DECIMAL_PLACES: 18 });

const lowerC = (address: string) => address.toLowerCase();
const parseEther = (ether: string) => ethers.utils.parseEther(ether).toString();

const MOCK_MINIMUM_SWAP_COUNT = 3;
const MOCK_ERC20_TRANSFER_EVENT = "event Transfer(address indexed from, address indexed to, uint256 value)";
const MOCK_ERC20_APPROVAL_EVENT = "event Approval(address indexed owner, address indexed spender, uint256 value)";
const MOCK_LOW_TRANSACTION_COUNT_THRESHOLD = 150;
const MOCK_MIN_ETH_THRESHOLD = toBn(parseEther("30"));
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
        mockedAxios.get.mockReset();
        AddressRecord.clear()
        handleTransaction = provideBotHandler(
            MOCK_ERC20_TRANSFER_EVENT,
            mockProvider as unknown as ethers.providers.JsonRpcProvider,
            MOCK_LOW_TRANSACTION_COUNT_THRESHOLD,
            MOCK_MINIMUM_SWAP_COUNT,
            MOCK_MIN_ETH_THRESHOLD
        );
    });

    describe("no finding cases", () => {
        it("should return an empty finding when there's no event in the transaction log", async () => {
            const txEvent = new TestTransactionEvent()
                .setFrom(ADDRESSES.address1);
            expect(await handleTransaction(txEvent)).toStrictEqual([]);
            expect(axios.get).toHaveBeenCalledTimes(0);
        });

        it("should return an empty finding when there are other events apart from transfer event in the tx log", async () => {
            const txEvent = new TestTransactionEvent()
                .setFrom(ADDRESSES.address1)
                .addEventLog(MOCK_ERC20_IFACE.getEvent("Approval"), ADDRESSES.contractAddr,
                    [ADDRESSES.address1, ADDRESSES.address2, "100000"]);

            expect(await handleTransaction(txEvent)).toStrictEqual([]);
            expect(axios.get).toHaveBeenCalledTimes(0);
        });

        it("should return an empty finding when there's a transfer event where the msgSender is not equal to token sender", async () => {
            const txEvent = new TestTransactionEvent()
                .setFrom(lowerC(ADDRESSES.attacker))
                .addEventLog(...createTransferEvent(ADDRESSES.address1, ADDRESSES.address2, "10000000"));

            expect(await handleTransaction(txEvent)).toStrictEqual([]);
            expect(axios.get).toHaveBeenCalledTimes(0);
        });

        it("should return an empty finding when there's a token transfer from msgSender but no corresponding ether transfer", async () => {
            const txEvent = new TestTransactionEvent()
                .setFrom(lowerC(ADDRESSES.attacker))
                .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "10000000"));
            const response = { data: { status: '0', message: 'No transactions found', result: [] } };
            mockedAxios.get.mockResolvedValueOnce(response);
            expect(await handleTransaction(txEvent)).toStrictEqual([]);
            expect(axios.get).toHaveBeenCalledTimes(1);
            expect(mockProvider.getTransactionCount).toHaveBeenCalledTimes(0)
        });

        it("should return an empty finding when there's ether transfer but not to msgSender", async () => {
            const txEvent = new TestTransactionEvent()
                .setFrom(lowerC(ADDRESSES.attacker))
                .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "10000000"));
            const response = {
                data: {
                    status: '1', message: 'OK', result: [
                        { from: lowerC(ADDRESSES.address2), to: lowerC(ADDRESSES.contractAddr), value: "95745666" },
                        { from: lowerC(ADDRESSES.address1), to: lowerC(ADDRESSES.address2), value: "754433300" },
                    ]
                }
            };
            mockedAxios.get.mockResolvedValueOnce(response);
            expect(await handleTransaction(txEvent)).toStrictEqual([]);
            expect(axios.get).toHaveBeenCalledTimes(1);
            expect(mockProvider.getTransactionCount).toHaveBeenCalledTimes(0)
        });

        it("should return an empty finding when the msgSender isn't a new address (has high nonce)", async () => {
            const txEvent = new TestTransactionEvent()
                .setFrom(lowerC(ADDRESSES.attacker))
                .setBlock(19995400)
                .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "10000000"));
            const response = {
                data: {
                    status: '1', message: 'OK', result: [
                        { from: lowerC(ADDRESSES.address1), to: lowerC(ADDRESSES.address2), value: "95745600" },
                        { from: lowerC(ADDRESSES.address2), to: lowerC(ADDRESSES.attacker), value: "95745600" }
                    ]
                }
            };
            mockedAxios.get.mockResolvedValueOnce(response);
            mockProvider.getTransactionCount.mockResolvedValueOnce(175);
            expect(await handleTransaction(txEvent)).toStrictEqual([]);
            expect(axios.get).toHaveBeenCalledTimes(1);
            expect(mockProvider.getTransactionCount).toHaveBeenCalledTimes(1);
            expect(mockProvider.getTransactionCount).toHaveBeenCalledWith(ADDRESSES.attacker, 19995400);
            expect(AddressRecord.has(ADDRESSES.attacker)).toStrictEqual(false);

        });

        it("should return an empty finding when the num of swaps is lesser than swap threshold", async () => {
            const txEvent1 = new TestTransactionEvent()
                .setFrom(lowerC(ADDRESSES.attacker))
                .setBlock(19995400)
                .setTimestamp(19180075)
                .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "10000000"));

            const response1 = {
                data: {
                    status: '1', message: 'OK', result: [
                        { from: lowerC(ADDRESSES.address1), to: lowerC(ADDRESSES.address2), value: "95745600" },
                        { from: lowerC(ADDRESSES.address2), to: lowerC(ADDRESSES.attacker), value: parseEther("17") }
                    ]
                }
            };

            const txEvent2 = new TestTransactionEvent()
                .setFrom(lowerC(ADDRESSES.attacker))
                .setBlock(19995450)
                .setTimestamp(19181800)
                .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "30000874"));

            const response2 = {
                data: {
                    status: '1', message: 'OK', result: [
                        { from: lowerC(ADDRESSES.address1), to: lowerC(ADDRESSES.address2), value: "957456" },
                        { from: lowerC(ADDRESSES.address2), to: lowerC(ADDRESSES.attacker), value: parseEther("15") }
                    ]
                }
            };
            mockedAxios.get.mockResolvedValueOnce(response1).mockResolvedValueOnce(response2);
            mockProvider.getTransactionCount.mockResolvedValueOnce(75).mockResolvedValueOnce(101);
           
           
            expect(await handleTransaction(txEvent1)).toStrictEqual([]);
            expect(await handleTransaction(txEvent2)).toStrictEqual([]);
            expect(axios.get).toHaveBeenCalledTimes(2);
            expect(mockProvider.getTransactionCount).toHaveBeenCalledTimes(2);
            expect(mockProvider.getTransactionCount).toHaveBeenCalledWith(ADDRESSES.attacker, 19995400);
            expect(mockProvider.getTransactionCount).toHaveBeenCalledWith(ADDRESSES.attacker, 19995450);
            expect(AddressRecord.get(ADDRESSES.attacker)?.totalEthReceived).toStrictEqual(toBn(parseEther("32")));
            expect(AddressRecord.get(ADDRESSES.attacker)?.tokenSwapData.length).toStrictEqual(2);

        });

        it("should return an empty finding when there are multiple swaps that aren't all immediate", async () => {
            const txEvent1 = new TestTransactionEvent()
                .setFrom(lowerC(ADDRESSES.attacker))
                .setBlock(19995400)
                .setTimestamp(19180075)
                .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "10000000"));

            const response1 = {
                data: {
                    status: '1', message: 'OK', result: [
                        { from: lowerC(ADDRESSES.address1), to: lowerC(ADDRESSES.address2), value: "95745600" },
                        { from: lowerC(ADDRESSES.address2), to: lowerC(ADDRESSES.attacker), value: parseEther("17") }
                    ]
                }
            };

            const txEvent2 = new TestTransactionEvent()
                .setFrom(lowerC(ADDRESSES.attacker))
                .setBlock(19995450)
                .setTimestamp(19181800)
                .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "30000874"));

            const response2 = {
                data: {
                    status: '1', message: 'OK', result: [
                        { from: lowerC(ADDRESSES.address1), to: lowerC(ADDRESSES.address2), value: "957456" },
                        { from: lowerC(ADDRESSES.address2), to: lowerC(ADDRESSES.attacker), value: parseEther("15") }
                    ]
                }
            };
            
            const txEvent3 = new TestTransactionEvent()
                .setFrom(lowerC(ADDRESSES.attacker))
                .setBlock(19995480)
                .setTimestamp(19183700)   // timestamp interval more than MAX_TIMESTAMP
                .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "45008764"));

            const response3 = {
                data: {
                    status: '1', message: 'OK', result: [
                        { from: lowerC(ADDRESSES.address1), to: lowerC(ADDRESSES.address2), value: "959356" },
                        { from: lowerC(ADDRESSES.address2), to: lowerC(ADDRESSES.attacker), value: parseEther("25")}
                    ]
                }
            };
            mockedAxios.get.mockResolvedValueOnce(response1).mockResolvedValueOnce(response2).mockResolvedValueOnce(response3);
            mockProvider.getTransactionCount.mockResolvedValueOnce(75).mockResolvedValueOnce(101).mockResolvedValueOnce(145);
           
           
            expect(await handleTransaction(txEvent1)).toStrictEqual([]);
            expect(await handleTransaction(txEvent2)).toStrictEqual([]);
            expect(AddressRecord.get(ADDRESSES.attacker)?.totalEthReceived).toStrictEqual(toBn(parseEther("32")));
            expect(AddressRecord.get(ADDRESSES.attacker)?.tokenSwapData.length).toStrictEqual(2);
            expect(await handleTransaction(txEvent3)).toStrictEqual([]);
            expect(axios.get).toHaveBeenCalledTimes(3);
            expect(mockProvider.getTransactionCount).toHaveBeenCalledTimes(3);
            expect(mockProvider.getTransactionCount).toHaveBeenCalledWith(ADDRESSES.attacker, 19995400);
            expect(mockProvider.getTransactionCount).toHaveBeenCalledWith(ADDRESSES.attacker, 19995450);
            expect(mockProvider.getTransactionCount).toHaveBeenCalledWith(ADDRESSES.attacker, 19995480);
            expect(AddressRecord.get(ADDRESSES.attacker)?.totalEthReceived).toStrictEqual(toBn(parseEther("25")));
            expect(AddressRecord.get(ADDRESSES.attacker)?.tokenSwapData.length).toStrictEqual(1);

        });

        it("should return an empty finding when total eth received is lesser than Min eth threshold ", async () => {
            const txEvent1 = new TestTransactionEvent()
                .setFrom(lowerC(ADDRESSES.attacker))
                .setBlock(19995400)
                .setTimestamp(19180075)
                .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "10000000"));

            const response1 = {
                data: {
                    status: '1', message: 'OK', result: [
                        { from: lowerC(ADDRESSES.address1), to: lowerC(ADDRESSES.address2), value: "95745600" },
                        { from: lowerC(ADDRESSES.address2), to: lowerC(ADDRESSES.attacker), value: parseEther("10") }
                    ]
                }
            };

            const txEvent2 = new TestTransactionEvent()
                .setFrom(lowerC(ADDRESSES.attacker))
                .setBlock(19995450)
                .setTimestamp(19181800)
                .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "30000874"));

            const response2 = {
                data: {
                    status: '1', message: 'OK', result: [
                        { from: lowerC(ADDRESSES.address1), to: lowerC(ADDRESSES.address2), value: "957456" },
                        { from: lowerC(ADDRESSES.address2), to: lowerC(ADDRESSES.attacker), value: parseEther("11") }
                    ]
                }
            };
            
            const txEvent3 = new TestTransactionEvent()
                .setFrom(lowerC(ADDRESSES.attacker))
                .setBlock(19995490)
                .setTimestamp(19182700)
                .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "45008764"));

            // total eth received from the 3 txs is lesser than the minimum eth required for a finding
            const response3 = {
                data: {
                    status: '1', message: 'OK', result: [
                        { from: lowerC(ADDRESSES.address1), to: lowerC(ADDRESSES.address2), value: "959356" },
                        { from: lowerC(ADDRESSES.address2), to: lowerC(ADDRESSES.attacker), value: parseEther("5")}
                    ]
                }
            };
            mockedAxios.get.mockResolvedValueOnce(response1).mockResolvedValueOnce(response2).mockResolvedValueOnce(response3);
            mockProvider.getTransactionCount.mockResolvedValueOnce(75).mockResolvedValueOnce(101).mockResolvedValueOnce(145);
           
           
            expect(await handleTransaction(txEvent1)).toStrictEqual([]);
            expect(await handleTransaction(txEvent2)).toStrictEqual([]);
            expect(await handleTransaction(txEvent3)).toStrictEqual([]);
            expect(axios.get).toHaveBeenCalledTimes(3);
            expect(mockProvider.getTransactionCount).toHaveBeenCalledTimes(3);
            expect(mockProvider.getTransactionCount).toHaveBeenCalledWith(ADDRESSES.attacker, 19995400);
            expect(mockProvider.getTransactionCount).toHaveBeenCalledWith(ADDRESSES.attacker, 19995450);
            expect(mockProvider.getTransactionCount).toHaveBeenCalledWith(ADDRESSES.attacker, 19995490);
            expect(AddressRecord.get(ADDRESSES.attacker)?.totalEthReceived).toStrictEqual(toBn(parseEther("26")));
            expect(AddressRecord.get(ADDRESSES.attacker)?.tokenSwapData.length).toStrictEqual(3);

        });

        it("should clear redudant data at every 10000th block", async () => {
            const txEvent1 = new TestTransactionEvent()
                .setFrom(lowerC(ADDRESSES.attacker))
                .setBlock(19989790)
                .setTimestamp(19185075)
                .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "10000000"));

            const response1 = {
                data: {
                    status: '1', message: 'OK', result: [
                        { from: lowerC(ADDRESSES.address1), to: lowerC(ADDRESSES.address2), value: "95745600" },
                        { from: lowerC(ADDRESSES.address2), to: lowerC(ADDRESSES.attacker), value: parseEther("10") }
                    ]
                }
            };

            const txEvent2 = new TestTransactionEvent()
                .setFrom(lowerC(ADDRESSES.address2))
                .setBlock(19989870)
                .setTimestamp(19186500)
                .addEventLog(...createTransferEvent(ADDRESSES.address2, ADDRESSES.address1, "30000874"));

            const response2 = {
                data: {
                    status: '1', message: 'OK', result: [
                        { from: lowerC(ADDRESSES.address1), to: lowerC(ADDRESSES.address2), value: parseEther("5.5") },
                    ]
                }
            };
            
            const txEvent3 = new TestTransactionEvent()
                .setFrom(lowerC(ADDRESSES.contractAddr))
                .setBlock(19989950)
                .setTimestamp(19189050)
                .addEventLog(...createTransferEvent(ADDRESSES.contractAddr, ADDRESSES.address2, "45008764"));

            const response3 = {
                data: {
                    status: '1', message: 'OK', result: [
                        { from: lowerC(ADDRESSES.address2), to: lowerC(ADDRESSES.contractAddr), value: parseEther("3")}
                    ]
                }
            };
            const txEvent4 = new TestTransactionEvent()
                .setFrom(lowerC(ADDRESSES.address1))
                .setBlock(19990000)
                .setTimestamp(19190100)
                .addEventLog(...createTransferEvent(ADDRESSES.address1, ADDRESSES.address2, "45008764"));

            const response4 = {
                data: {
                    status: '1', message: 'OK', result: [
                        { from: lowerC(ADDRESSES.address2), to: lowerC(ADDRESSES.address1), value: parseEther("10.8")}
                    ]
                }
            };
            mockedAxios.get.mockResolvedValueOnce(response1).mockResolvedValueOnce(response2)
            .mockResolvedValueOnce(response3).mockResolvedValueOnce(response4);
            mockProvider.getTransactionCount.mockResolvedValueOnce(75).mockResolvedValueOnce(101)
            .mockResolvedValueOnce(125).mockResolvedValueOnce(148);
           
           
            expect(await handleTransaction(txEvent1)).toStrictEqual([]);
            expect(await handleTransaction(txEvent2)).toStrictEqual([]);
            expect(await handleTransaction(txEvent3)).toStrictEqual([]);
            expect(AddressRecord.size).toStrictEqual(3);
            expect(AddressRecord.get(ADDRESSES.attacker)?.totalEthReceived).toStrictEqual(toBn(parseEther("10")));
            expect(AddressRecord.get(ADDRESSES.attacker)?.tokenSwapData.length).toStrictEqual(1);
            expect(AddressRecord.get(ADDRESSES.address2)?.totalEthReceived).toStrictEqual(toBn(parseEther("5.5")));
            expect(AddressRecord.get(ADDRESSES.address2)?.tokenSwapData.length).toStrictEqual(1);
            expect(AddressRecord.get(ADDRESSES.contractAddr)?.totalEthReceived).toStrictEqual(toBn(parseEther("3")));
            expect(AddressRecord.get(ADDRESSES.contractAddr)?.tokenSwapData.length).toStrictEqual(1);
            expect(await handleTransaction(txEvent4)).toStrictEqual([]);
            expect(AddressRecord.size).toStrictEqual(2);
            expect(AddressRecord.has(ADDRESSES.attacker)).toStrictEqual(false)
            expect(AddressRecord.has(ADDRESSES.address2)).toStrictEqual(false)
            expect(AddressRecord.get(ADDRESSES.contractAddr)?.totalEthReceived).toStrictEqual(toBn(parseEther("3")));
            expect(AddressRecord.get(ADDRESSES.contractAddr)?.tokenSwapData.length).toStrictEqual(1);
            expect(AddressRecord.get(ADDRESSES.address1)?.totalEthReceived).toStrictEqual(toBn(parseEther("10.8")));
            expect(AddressRecord.get(ADDRESSES.address1)?.tokenSwapData.length).toStrictEqual(1);
            expect(axios.get).toHaveBeenCalledTimes(4);
            expect(mockProvider.getTransactionCount).toHaveBeenCalledTimes(4);
            expect(mockProvider.getTransactionCount).toHaveBeenCalledWith(ADDRESSES.attacker, 19989790);
            expect(mockProvider.getTransactionCount).toHaveBeenCalledWith(ADDRESSES.address2, 19989870);
            expect(mockProvider.getTransactionCount).toHaveBeenCalledWith(ADDRESSES.contractAddr, 19989950);
            expect(mockProvider.getTransactionCount).toHaveBeenCalledWith(ADDRESSES.address1, 19990000);
            

        });
    })

})
