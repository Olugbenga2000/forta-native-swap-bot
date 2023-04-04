import NetworkManager, { NETWORK_MAP } from "./network";

const TEST_CHAIN_IDS: number[] = [1, 137, 42161, 10, 43114, 250, 56];
describe("NetworkManager Test Suite", () => {
  describe("tests for setNetwork function call", () => {
    it("should correctly return native usd aggregator and min native threshold for each network", async () => {
      for (let testChainId of TEST_CHAIN_IDS) {
        const networkManager = new NetworkManager();
        const {
          nativeUsdAggregator: mappedNativeUsdAggregator,
          minNativeThreshold: mappedMinNativeThreshold,
        } = NETWORK_MAP[testChainId];
        networkManager.setNetwork(testChainId);
        expect(networkManager.nativeUsdAggregator).toStrictEqual(mappedNativeUsdAggregator);
        expect(networkManager.minNativeThreshold).toStrictEqual(mappedMinNativeThreshold);
      }
    });

    it("should throw error when running bot on an unsupported network", async () => {
      const networkManager = new NetworkManager();
      expect(() => {
        // 73 is an unsupported networkId
        networkManager.setNetwork(73);
      }).toThrow(new Error("Network not supported"));
    });
  });
});
