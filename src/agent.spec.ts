import { FindingType, FindingSeverity, Finding, HandleTransaction, ethers, EntityType, Label } from "forta-agent";
import { createChecksumAddress } from "forta-agent-tools/lib/utils";
import { TestTransactionEvent } from "forta-agent-tools/lib/test";
import BigNumber from "bignumber.js";
import { provideBotHandler, totalNativeSwaps, provideInitialize } from "./agent";
import {toBn} from "./utils";
import { createMetadata } from "./finding";
import { UserSwapData, AddressRecord } from "./swap";
import { ERC20_TRANSFER_EVENT as MOCK_ERC20_TRANSFER_EVENT, WETH_WITHDRAWAL_EVENT } from "./constants";
import NetworkManager from "./network";
BigNumber.set({ DECIMAL_PLACES: 18 });

const lowerC = (address: string) => address.toLowerCase();
const parseEther = (ether: string) => ethers.utils.parseEther(ether);

const MOCK_MINIMUM_SWAP_COUNT = 3;
const MOCK_ERC20_APPROVAL_EVENT = "event Approval(address indexed owner, address indexed spender, uint256 value)";
const MOCK_LOW_TRANSACTION_COUNT_THRESHOLD = 150;
const MOCK_WETH_ADDRESS = createChecksumAddress("0xC02");
let mockUnusualNativeSwaps = 0;

const ADDRESSES = {
  address1: createChecksumAddress("0xd4582"),
  address2: createChecksumAddress("0x9C17"),
  attacker: createChecksumAddress("0xb8652"),
  contractAddr: createChecksumAddress("0x3852A"),
  router1: createChecksumAddress("0x72A"),
  router2: createChecksumAddress("0x0A4")
};

const mockCreateNewFinding = (sender: string, addrRecord: UserSwapData): Finding => {
  mockUnusualNativeSwaps++;
  const adScore = mockUnusualNativeSwaps / totalNativeSwaps;
  return Finding.fromObject({
    name: "Unusual Native Swaps",
    description: `Unusual native swap behavior by ${sender} has been detected`,
    alertId: "UNUSUAL-NATIVE-SWAPS",
    severity: FindingSeverity.Medium,
    type: FindingType.Suspicious,
    protocol: "Forta",
    metadata: createMetadata(sender, addrRecord, adScore),
    labels: [
      Label.fromObject({
        entity: sender,
        entityType: EntityType.Address,
        label: "Attacker",
        confidence: 0.3,
        remove: false,
      }),
    ],
  });
};

const MOCK_ERC20_IFACE = new ethers.utils.Interface([
  MOCK_ERC20_TRANSFER_EVENT, 
  MOCK_ERC20_APPROVAL_EVENT, 
  WETH_WITHDRAWAL_EVENT
]);

const createTransferEvent = (from: string, to: string, value: string, contractAddr = ADDRESSES.contractAddr): 
[ethers.utils.EventFragment, string, any[]] => [
  MOCK_ERC20_IFACE.getEvent("Transfer"),
  contractAddr,
  [from, to, value],
];

const createWithdrawalEvent = (src: string, wad: ethers.BigNumber): [ethers.utils.EventFragment, string, any[]] => [
  MOCK_ERC20_IFACE.getEvent("Withdrawal"),
  MOCK_WETH_ADDRESS,
  [src, wad]
]

describe("Unusual Native Swaps Bot Test Suite", () => {
  const mockProvider = {
    getTransactionCount: jest.fn(),
    getNetwork: jest.fn()
  };
  const mockNetworkManager: NetworkManager = {
    minNativeThreshold: "30",
    nativeUsdAggregator: createChecksumAddress("0x12"),
    wNative: MOCK_WETH_ADDRESS,
    setNetwork: jest.fn(),
    getLatestPriceFeed: jest.fn(),
  };
  let handleTransaction: HandleTransaction;
  let initialize:() => Promise<void>;

  beforeEach(async() => {
    mockProvider.getTransactionCount.mockReset();
    mockProvider.getNetwork.mockReset();
    AddressRecord.clear();
    initialize = provideInitialize(mockProvider as unknown as ethers.providers.Provider);
    handleTransaction = provideBotHandler(
      (mockProvider as unknown) as ethers.providers.JsonRpcProvider,
      MOCK_LOW_TRANSACTION_COUNT_THRESHOLD,
      MOCK_MINIMUM_SWAP_COUNT,
      mockNetworkManager
    );
  });

  describe("no finding cases", () => {
    it("should return an empty finding when there's no event in the transaction log", async () => {
      const txEvent = new TestTransactionEvent().setFrom(ADDRESSES.address1);
      expect(await handleTransaction(txEvent)).toStrictEqual([]);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledTimes(0);
    });

    it("should return an empty finding when there are other events apart from transfer event in the tx log", async () => {
      const txEvent = new TestTransactionEvent()
        .setFrom(ADDRESSES.address1)
        .addEventLog(MOCK_ERC20_IFACE.getEvent("Approval"), ADDRESSES.contractAddr, [
          ADDRESSES.address1,
          ADDRESSES.address2,
          "100000",
        ]);

      expect(await handleTransaction(txEvent)).toStrictEqual([]);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledTimes(0);
    });

    it("should return an empty finding when there's a transfer event where the msgSender is not equal to token sender", async () => {
      const txEvent = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .addEventLog(...createTransferEvent(ADDRESSES.address1, ADDRESSES.address2, "10000000"));

      expect(await handleTransaction(txEvent)).toStrictEqual([]);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledTimes(0);
    });

    it("should return an empty finding when the transfer event is to address(0)", async () => {
      const txEvent1 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ethers.constants.AddressZero, "10000000"));

      const txEvent2 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ethers.constants.AddressZero, "19700000"));

      expect(await handleTransaction(txEvent1)).toStrictEqual([]);
      expect(await handleTransaction(txEvent2)).toStrictEqual([]);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledTimes(0);
    });

    it("should return an empty finding when the transfer event is an indirect burn (e.g liquidity removal)", async () => {
      const addressZero = ethers.constants.AddressZero;
      const txEvent1 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995400)
        .setTimestamp(19180075)
        .setHash("0x12347")
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "10000000"))
        .addEventLog(...createTransferEvent(ADDRESSES.address2, addressZero, "10000000"));

      const txEvent2 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995450)
        .setTimestamp(19181800)
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "30000874"))
        .addEventLog(...createTransferEvent(ADDRESSES.address2, addressZero, "30000874"));

      const txEvent3 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995490)
        .setTimestamp(19182700)
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "45008764"))
        .addEventLog(...createTransferEvent(ADDRESSES.address2, addressZero, "45008764"));

      expect(await handleTransaction(txEvent1)).toStrictEqual([]);
      expect(await handleTransaction(txEvent2)).toStrictEqual([]);
      expect(await handleTransaction(txEvent3)).toStrictEqual([]);
      expect(AddressRecord.has(ADDRESSES.attacker)).toStrictEqual(false);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledTimes(0);
    });

    it("should return an empty finding when there's a token transfer from msgSender but no corresponding ether transfer", async () => {
      const txEvent = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "10000000"));
      expect(await handleTransaction(txEvent)).toStrictEqual([]);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledTimes(0);
    });

    it("should return an empty finding when the msgSender isn't a new address (has high nonce)", async () => {
      const txEvent = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995400)
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "10000000"))
        .addEventLog(...createWithdrawalEvent(ADDRESSES.router1, parseEther("7")));
      mockProvider.getTransactionCount.mockResolvedValueOnce(175);
      expect(await handleTransaction(txEvent)).toStrictEqual([]);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledTimes(1);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledWith(ADDRESSES.attacker);
      expect(AddressRecord.has(ADDRESSES.attacker)).toStrictEqual(false);
    });

    it("should return an empty finding when the num of swaps is lesser than swap threshold", async () => {
      const txEvent1 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995400)
        .setTimestamp(19180075)
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "10000000"))
        .addEventLog(...createWithdrawalEvent(ADDRESSES.router1, parseEther("17")));

      const txEvent2 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995450)
        .setTimestamp(19181800)
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "30000874"))
        .addEventLog(...createWithdrawalEvent(ADDRESSES.router2, parseEther("15")));

      mockProvider.getTransactionCount.mockResolvedValueOnce(75).mockResolvedValueOnce(101);

      expect(await handleTransaction(txEvent1)).toStrictEqual([]);
      expect(await handleTransaction(txEvent2)).toStrictEqual([]);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledTimes(2);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledWith(ADDRESSES.attacker);
      expect(AddressRecord.get(ADDRESSES.attacker)?.totalEthReceived).toStrictEqual(toBn(parseEther("32")));
      expect(AddressRecord.get(ADDRESSES.attacker)?.tokenSwapData.length).toStrictEqual(2);
    });

    it("should return an empty finding when there are multiple swaps that aren't all immediate", async () => {
      const txEvent1 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995400)
        .setTimestamp(19180075)
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "10000000"))
        .addEventLog(...createWithdrawalEvent(ADDRESSES.router1, parseEther("17")));

      const txEvent2 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995450)
        .setTimestamp(19181800)
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "30000874"))
        .addEventLog(...createWithdrawalEvent(ADDRESSES.router1, parseEther("15")));

      const txEvent3 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995480)
        .setTimestamp(19183700) // timestamp interval more than MAX_TIMESTAMP
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "45008764"))
        .addEventLog(...createWithdrawalEvent(ADDRESSES.router2, parseEther("25")));

      mockProvider.getTransactionCount
        .mockResolvedValueOnce(75)
        .mockResolvedValueOnce(101)
        .mockResolvedValueOnce(145);

      expect(await handleTransaction(txEvent1)).toStrictEqual([]);
      expect(await handleTransaction(txEvent2)).toStrictEqual([]);
      expect(AddressRecord.get(ADDRESSES.attacker)?.totalEthReceived).toStrictEqual(toBn(parseEther("32")));
      expect(AddressRecord.get(ADDRESSES.attacker)?.tokenSwapData.length).toStrictEqual(2);
      expect(await handleTransaction(txEvent3)).toStrictEqual([]);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledTimes(3);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledWith(ADDRESSES.attacker);
      expect(AddressRecord.get(ADDRESSES.attacker)?.totalEthReceived).toStrictEqual(toBn(parseEther("25")));
      expect(AddressRecord.get(ADDRESSES.attacker)?.tokenSwapData.length).toStrictEqual(1);
    });

    it("should return empty findings when total eth received is lesser than Min eth threshold ", async () => {
      const txEvent1 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995400)
        .setTimestamp(19180075)
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "10000000"))
        .addEventLog(...createWithdrawalEvent(ADDRESSES.router1, parseEther("10")));

      const txEvent2 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995450)
        .setTimestamp(19181800)
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "30000874"))
        .addEventLog(...createWithdrawalEvent(ADDRESSES.router2, parseEther("11")));

      const txEvent3 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995490)
        .setTimestamp(19182700)
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "45008764"))
        .addEventLog(...createWithdrawalEvent(ADDRESSES.router1, parseEther("5")));
      mockProvider.getTransactionCount
        .mockResolvedValueOnce(75)
        .mockResolvedValueOnce(101)
        .mockResolvedValueOnce(145);

      expect(await handleTransaction(txEvent1)).toStrictEqual([]);
      expect(await handleTransaction(txEvent2)).toStrictEqual([]);
      expect(await handleTransaction(txEvent3)).toStrictEqual([]);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledTimes(3);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledWith(ADDRESSES.attacker);
      expect(AddressRecord.get(ADDRESSES.attacker)?.totalEthReceived).toStrictEqual(toBn(parseEther("26")));
      expect(AddressRecord.get(ADDRESSES.attacker)?.tokenSwapData.length).toStrictEqual(3);
    });

    it("should return empty findings for other chains when there are fantom/arbitrum native withdrawal", async () => {
      const txEvent1 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995400)
        .setTimestamp(19180075)
        .setHash("0x12347")
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "10000000"))
        .addEventLog(...createTransferEvent(ADDRESSES.router1, ethers.constants.AddressZero, 
          parseEther("15").toString(), MOCK_WETH_ADDRESS));

      const txEvent2 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995450)
        .setTimestamp(19181800)
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "30000874"))
        .addEventLog(...createTransferEvent(ADDRESSES.router2, ethers.constants.AddressZero, 
          parseEther("20").toString(), MOCK_WETH_ADDRESS))

      const txEvent3 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995490)
        .setTimestamp(19182700)
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "45008764"))
        .addEventLog(...createTransferEvent(ADDRESSES.router1, ethers.constants.AddressZero, 
          parseEther("5").toString(), MOCK_WETH_ADDRESS));
      mockProvider.getNetwork.mockResolvedValueOnce({chainId: 1});  // Mainnet chain id
      await initialize();
      expect(await handleTransaction(txEvent1)).toStrictEqual([]);
      expect(await handleTransaction(txEvent2)).toStrictEqual([]);
      expect(await handleTransaction(txEvent3)).toStrictEqual([]);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledTimes(0);
      expect(mockProvider.getNetwork).toHaveBeenCalledTimes(1);
      expect(AddressRecord.has(ADDRESSES.attacker)).toStrictEqual(false);
    });

    it("should return empty findings for fantom/arbitrum when there are other chains native withdrawal", async () => {
      const txEvent1 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995400)
        .setTimestamp(19180075)
        .setHash("0x12347")
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "10000000"))
        .addEventLog(...createWithdrawalEvent(ADDRESSES.router1, parseEther("20")));


      const txEvent2 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995450)
        .setTimestamp(19181800)
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "30000874"))
        .addEventLog(...createWithdrawalEvent(ADDRESSES.router1, parseEther("25")));


      const txEvent3 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995490)
        .setTimestamp(19182700)
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "45008764"))
        .addEventLog(...createWithdrawalEvent(ADDRESSES.router1, parseEther("10")));

      mockProvider.getNetwork.mockResolvedValueOnce({chainId: 250});  // Fantom chain id
      await initialize();
      expect(await handleTransaction(txEvent1)).toStrictEqual([]);
      expect(await handleTransaction(txEvent2)).toStrictEqual([]);
      expect(await handleTransaction(txEvent3)).toStrictEqual([]);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledTimes(0);
      expect(mockProvider.getNetwork).toHaveBeenCalledTimes(1);
      expect(AddressRecord.has(ADDRESSES.attacker)).toStrictEqual(false);
    });

    it("should clear redudant data at every 10000th block", async () => {
      const txEvent1 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19989790)
        .setTimestamp(19185075)
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "10000000"))
        .addEventLog(...createWithdrawalEvent(ADDRESSES.router1, parseEther("10")));

      const txEvent2 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.address2))
        .setBlock(19989870)
        .setTimestamp(19186500)
        .addEventLog(...createTransferEvent(ADDRESSES.address2, ADDRESSES.address1, "30000874"))
        .addEventLog(...createWithdrawalEvent(ADDRESSES.router2, parseEther("5.5")));

      const txEvent3 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.contractAddr))
        .setBlock(19989950)
        .setTimestamp(19189050)
        .addEventLog(...createTransferEvent(ADDRESSES.contractAddr, ADDRESSES.address2, "45008764"))
        .addEventLog(...createWithdrawalEvent(ADDRESSES.router2, parseEther("3")));

      const txEvent4 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.address1))
        .setBlock(19990000)
        .setTimestamp(19190100)
        .addEventLog(...createTransferEvent(ADDRESSES.address1, ADDRESSES.address2, "45008764"))
        .addEventLog(...createWithdrawalEvent(ADDRESSES.router1, parseEther("10.8")));
      mockProvider.getTransactionCount
        .mockResolvedValueOnce(75)
        .mockResolvedValueOnce(101)
        .mockResolvedValueOnce(125)
        .mockResolvedValueOnce(148);
      mockProvider.getNetwork.mockResolvedValueOnce({chainId: 1});  // Mainnet chain id
      await initialize();

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
      expect(AddressRecord.has(ADDRESSES.attacker)).toStrictEqual(false);
      expect(AddressRecord.has(ADDRESSES.address2)).toStrictEqual(false);
      expect(AddressRecord.get(ADDRESSES.contractAddr)?.totalEthReceived).toStrictEqual(toBn(parseEther("3")));
      expect(AddressRecord.get(ADDRESSES.contractAddr)?.tokenSwapData.length).toStrictEqual(1);
      expect(AddressRecord.get(ADDRESSES.address1)?.totalEthReceived).toStrictEqual(toBn(parseEther("10.8")));
      expect(AddressRecord.get(ADDRESSES.address1)?.tokenSwapData.length).toStrictEqual(1);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledTimes(4);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledWith(ADDRESSES.attacker);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledWith(ADDRESSES.address2);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledWith(ADDRESSES.contractAddr);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledWith(ADDRESSES.address1);
    });
  });

  describe("tests for cases that returns findings ", () => {
    it("should return finding when the eth and swaps thresholds are reached", async () => {
      const txEvent1 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995400)
        .setTimestamp(19180075)
        .setHash("0x12347")
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "10000000"))
        .addEventLog(...createWithdrawalEvent(ADDRESSES.router1, parseEther("15")));

      const txEvent2 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995450)
        .setTimestamp(19181800)
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "30000874"))
        .addEventLog(...createWithdrawalEvent(ADDRESSES.router2, parseEther("10")));

      const txEvent3 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995490)
        .setTimestamp(19182700)
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "45008764"))
        .addEventLog(...createWithdrawalEvent(ADDRESSES.router1, parseEther("5")));

      const [prevBal1, currentBal1] = [parseEther("1"), parseEther("16")];
      const [prevBal2, currentBal2] = [parseEther("10"), parseEther("20")];
      const [prevBal3, currentBal3] = [parseEther("5"), parseEther("10")];

      mockProvider.getTransactionCount
        .mockResolvedValueOnce(20)
        .mockResolvedValueOnce(45)
        .mockResolvedValueOnce(67);

      expect(await handleTransaction(txEvent1)).toStrictEqual([]);
      expect(await handleTransaction(txEvent2)).toStrictEqual([]);
      const finding = await handleTransaction(txEvent3);
      const addrRecord = AddressRecord.get(ADDRESSES.attacker) as UserSwapData;
      expect(finding).toStrictEqual([mockCreateNewFinding(ADDRESSES.attacker, addrRecord)]);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledTimes(3);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledWith(ADDRESSES.attacker);
      expect(addrRecord.totalEthReceived).toStrictEqual(toBn(parseEther("30")));
      expect(addrRecord.tokenSwapData.length).toStrictEqual(3);
    });

    it("should return multiple findings when the eth and swaps thresholds are reached for multiple concurrent swaps", async () => {
      const txEvent1 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995400)
        .setTimestamp(19180075)
        .setHash("0x12347")
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "10000000"))
        .addEventLog(...createWithdrawalEvent(ADDRESSES.router1, parseEther("15")));

      const txEvent2 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995450)
        .setTimestamp(19181800)
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "30000874"))
        .addEventLog(...createWithdrawalEvent(ADDRESSES.router1, parseEther("20")));

      const txEvent3 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995490)
        .setTimestamp(19182700)
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "45008764"))
        .addEventLog(...createWithdrawalEvent(ADDRESSES.router2, parseEther("5")));

      const txEvent4 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995590)
        .setTimestamp(19183100)
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "9878764"))
        .addEventLog(...createWithdrawalEvent(ADDRESSES.router2, parseEther("8")));
      mockProvider.getTransactionCount
        .mockResolvedValueOnce(20)
        .mockResolvedValueOnce(45)
        .mockResolvedValueOnce(67)
        .mockResolvedValueOnce(120);

      expect(await handleTransaction(txEvent1)).toStrictEqual([]);
      expect(await handleTransaction(txEvent2)).toStrictEqual([]);
      let finding = await handleTransaction(txEvent3);
      let addrRecord = AddressRecord.get(ADDRESSES.attacker) as UserSwapData;
      expect(finding).toStrictEqual([mockCreateNewFinding(ADDRESSES.attacker, addrRecord)]);
      finding = await handleTransaction(txEvent4);
      addrRecord = AddressRecord.get(ADDRESSES.attacker) as UserSwapData;
      expect(finding).toStrictEqual([mockCreateNewFinding(ADDRESSES.attacker, addrRecord)]);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledTimes(4);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledWith(ADDRESSES.attacker);
      expect(addrRecord.totalEthReceived).toStrictEqual(toBn(parseEther("48")));
      expect(addrRecord.tokenSwapData.length).toStrictEqual(4);
    });

    it("should return correct findings for Arbitrum chain", async () => {
      const txEvent1 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995400)
        .setTimestamp(19180075)
        .setHash("0x12347")
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "10000000"))
        .addEventLog(...createTransferEvent(ADDRESSES.router1, ethers.constants.AddressZero, 
          parseEther("15").toString(), MOCK_WETH_ADDRESS));

      const txEvent2 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995450)
        .setTimestamp(19181800)
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "30000874"))
        .addEventLog(...createTransferEvent(ADDRESSES.router2, ethers.constants.AddressZero, 
          parseEther("20").toString(), MOCK_WETH_ADDRESS))

      const txEvent3 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995490)
        .setTimestamp(19182700)
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "45008764"))
        .addEventLog(...createTransferEvent(ADDRESSES.router1, ethers.constants.AddressZero, 
          parseEther("5").toString(), MOCK_WETH_ADDRESS))

      const txEvent4 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995590)
        .setTimestamp(19183100)
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "9878764"))
        .addEventLog(...createTransferEvent(ADDRESSES.router2, ethers.constants.AddressZero, 
          parseEther("8").toString(), MOCK_WETH_ADDRESS))
      mockProvider.getTransactionCount
        .mockResolvedValueOnce(20)
        .mockResolvedValueOnce(45)
        .mockResolvedValueOnce(67)
        .mockResolvedValueOnce(120);
      mockProvider.getNetwork.mockResolvedValueOnce({chainId: 42161})   // Arbitrum chain id
      const initialize = provideInitialize(mockProvider as unknown as ethers.providers.Provider);
      await initialize();
      expect(await handleTransaction(txEvent1)).toStrictEqual([]);
      expect(await handleTransaction(txEvent2)).toStrictEqual([]);
      let finding = await handleTransaction(txEvent3);
      let addrRecord = AddressRecord.get(ADDRESSES.attacker) as UserSwapData;
      expect(finding).toStrictEqual([mockCreateNewFinding(ADDRESSES.attacker, addrRecord)]);
      finding = await handleTransaction(txEvent4);
      addrRecord = AddressRecord.get(ADDRESSES.attacker) as UserSwapData;
      expect(finding).toStrictEqual([mockCreateNewFinding(ADDRESSES.attacker, addrRecord)]);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledTimes(4);
      expect(mockProvider.getNetwork).toHaveBeenCalledTimes(1);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledWith(ADDRESSES.attacker);
      expect(addrRecord.totalEthReceived).toStrictEqual(toBn(parseEther("48")));
      expect(addrRecord.tokenSwapData.length).toStrictEqual(4);
    });

    it("should return correct findings for Fantom chain", async () => {
      const txEvent1 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995400)
        .setTimestamp(19180075)
        .setHash("0x12347")
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "10000000"))
        .addEventLog(...createTransferEvent(ADDRESSES.router1, ethers.constants.AddressZero, 
          parseEther("15").toString(), MOCK_WETH_ADDRESS));

      const txEvent2 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995450)
        .setTimestamp(19181800)
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "30000874"))
        .addEventLog(...createTransferEvent(ADDRESSES.router2, ethers.constants.AddressZero, 
          parseEther("20").toString(), MOCK_WETH_ADDRESS))

      const txEvent3 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995490)
        .setTimestamp(19182700)
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "45008764"))
        .addEventLog(...createTransferEvent(ADDRESSES.router1, ethers.constants.AddressZero, 
          parseEther("5").toString(), MOCK_WETH_ADDRESS))

      const txEvent4 = new TestTransactionEvent()
        .setFrom(lowerC(ADDRESSES.attacker))
        .setBlock(19995590)
        .setTimestamp(19183100)
        .addEventLog(...createTransferEvent(ADDRESSES.attacker, ADDRESSES.address2, "9878764"))
        .addEventLog(...createTransferEvent(ADDRESSES.router2, ethers.constants.AddressZero, 
          parseEther("8").toString(), MOCK_WETH_ADDRESS))
      mockProvider.getTransactionCount
        .mockResolvedValueOnce(20)
        .mockResolvedValueOnce(45)
        .mockResolvedValueOnce(67)
        .mockResolvedValueOnce(120);
      mockProvider.getNetwork.mockResolvedValueOnce({chainId: 250})   // Arbitrum chain id
      const initialize = provideInitialize(mockProvider as unknown as ethers.providers.Provider);
      await initialize();
      expect(await handleTransaction(txEvent1)).toStrictEqual([]);
      expect(await handleTransaction(txEvent2)).toStrictEqual([]);
      let finding = await handleTransaction(txEvent3);
      let addrRecord = AddressRecord.get(ADDRESSES.attacker) as UserSwapData;
      expect(finding).toStrictEqual([mockCreateNewFinding(ADDRESSES.attacker, addrRecord)]);
      finding = await handleTransaction(txEvent4);
      addrRecord = AddressRecord.get(ADDRESSES.attacker) as UserSwapData;
      expect(finding).toStrictEqual([mockCreateNewFinding(ADDRESSES.attacker, addrRecord)]);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledTimes(4);
      expect(mockProvider.getNetwork).toHaveBeenCalledTimes(1);
      expect(mockProvider.getTransactionCount).toHaveBeenCalledWith(ADDRESSES.attacker);
      expect(addrRecord.totalEthReceived).toStrictEqual(toBn(parseEther("48")));
      expect(addrRecord.tokenSwapData.length).toStrictEqual(4);
    });
  });
});
