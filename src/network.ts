import { ethers } from "forta-agent";
import { AGGREGATORV3_ABI, MIN_DOLLAR_THRESHOLD } from "./constants";
import { toBn } from "./utils";

export interface NetworkData {
  nativeUsdAggregator: string;
  minNativeThreshold: string;
  wNative: string
}

let MAINNET_DATA: NetworkData = {
  nativeUsdAggregator: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", // ETH/USD
  minNativeThreshold: "30",
  wNative: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" // Wrapped Ether (WETH)
};

let POLYGON_MAINNET_DATA: NetworkData = {
  nativeUsdAggregator: "0xAB594600376Ec9fD91F8e885dADF0CE036862dE0", //MATIC/USD
  minNativeThreshold: "49139",
  wNative: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // WMATIC Token
};

let ARBITRUM_MAINNET_DATA: NetworkData = {
  nativeUsdAggregator: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612", // ETH/USD
  minNativeThreshold: "30",
  wNative: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" // Wrapped Ether
};

let OPTIMISM_MAINNET_DATA: NetworkData = {
  nativeUsdAggregator: "0x13e3Ee699D1909E989722E753853AE30b17e08c5", // ETH/USD
  minNativeThreshold: "30",
  wNative: "0x4200000000000000000000000000000000000006" // Wrapped Ether
};

let AVALANCHE_DATA: NetworkData = {
  nativeUsdAggregator: "0x0A77230d17318075983913bC2145DB16C7366156", // AVAX/USD
  minNativeThreshold: "3096",
  wNative: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7"   // Wrapped AVAX
};

let FANTOM_DATA: NetworkData = {
  nativeUsdAggregator: "0xf4766552D15AE4d256Ad41B6cf2933482B0680dc", // FTM/USD
  minNativeThreshold: "115045",
  wNative: "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83"  //  Wrapped Fantom Token
};

const BNBCHAIN_DATA: NetworkData = {
  nativeUsdAggregator: "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE", // BNB/USD
  minNativeThreshold: "173",
  wNative: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"  //WBNB Token
};

export const NETWORK_MAP: Record<number, NetworkData> = {
  1: MAINNET_DATA,
  137: POLYGON_MAINNET_DATA,
  42161: ARBITRUM_MAINNET_DATA,
  10: OPTIMISM_MAINNET_DATA,
  43114: AVALANCHE_DATA,
  250: FANTOM_DATA,
  56: BNBCHAIN_DATA,
};

export default class NetworkManager implements NetworkData {
  public nativeUsdAggregator: string;
  public minNativeThreshold: string;
  public wNative: string;

  constructor() {
    this.nativeUsdAggregator = "";
    this.minNativeThreshold = "";
    this.wNative = "";
  }

  public setNetwork(chainId: number) {
    try {
      const { nativeUsdAggregator, minNativeThreshold, wNative } = NETWORK_MAP[chainId];
      this.nativeUsdAggregator = nativeUsdAggregator;
      this.minNativeThreshold = minNativeThreshold;
      this.wNative = wNative;
    } catch {
      throw new Error("Network not supported");
    }
  }

  public async getLatestPriceFeed(provider: ethers.providers.Provider) {
    const { chainId } = await provider.getNetwork();
    const aggregatorContract = new ethers.Contract(this.nativeUsdAggregator, AGGREGATORV3_ABI, provider);
    try {
      const [roundData, decimals] = await Promise.all([
        aggregatorContract.latestRoundData(),
        aggregatorContract.decimals(),
      ]);
      const price = toBn(roundData.answer.toString()).div(10 ** decimals);
      NETWORK_MAP[chainId].minNativeThreshold = toBn(MIN_DOLLAR_THRESHOLD)
        .div(price)
        .toFixed(2);
      this.setNetwork(chainId);
      console.log("fetched new price from chainlink - ", price.toString())
    } catch (error) {
      console.log("Error while fetching latest data: ", error);
    }
  }
}
