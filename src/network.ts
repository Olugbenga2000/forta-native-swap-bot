import { ethers } from "forta-agent";
import { AGGREGATORV3_ABI, MIN_DOLLAR_THRESHOLD } from "./constants";
import { toBn } from "./utils";

export interface NetworkData {
    nativeUsdAggregator: string;
    minNativeThreshold: string;
  }
  
  let MAINNET_DATA: NetworkData = {
    nativeUsdAggregator:  "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    minNativeThreshold: "30",
  };
  
  let POLYGON_MAINNET_DATA: NetworkData = {
    nativeUsdAggregator: "0xAB594600376Ec9fD91F8e885dADF0CE036862dE0",
    minNativeThreshold: "49139",
  };
  
  let ARBITRUM_MAINNET_DATA: NetworkData = {
    nativeUsdAggregator: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612",
    minNativeThreshold: "30"
  };
  
  let OPTIMISM_MAINNET_DATA: NetworkData = {
    nativeUsdAggregator: "0x13e3Ee699D1909E989722E753853AE30b17e08c5",
    minNativeThreshold: "30"
  };
  
  let AVALANCHE_DATA: NetworkData = {
    nativeUsdAggregator: "0x0A77230d17318075983913bC2145DB16C7366156",
    minNativeThreshold: "3096"
  };
  
  let FANTOM_DATA: NetworkData = {
    nativeUsdAggregator: "0xf4766552D15AE4d256Ad41B6cf2933482B0680dc",
    minNativeThreshold: "115045",
  };
  
  const BNBCHAIN_DATA: NetworkData = {
    nativeUsdAggregator: "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE",
    minNativeThreshold: "173",
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
  
    constructor() {
      this.nativeUsdAggregator = "";
      this.minNativeThreshold = "";
    }
  
    public setNetwork(chainId: number) {
      try {
        const { nativeUsdAggregator, minNativeThreshold } = NETWORK_MAP[chainId];
        this.nativeUsdAggregator = nativeUsdAggregator;
        this.minNativeThreshold = minNativeThreshold;
      } catch {
        throw new Error("Network not supported");
      }
    }

    public async updateThreshold(chainId: number, provider: ethers.providers.Provider){
        const aggregatorContract  = new ethers.Contract(this.nativeUsdAggregator, AGGREGATORV3_ABI, provider);
        try {
            const [roundData, decimals] = await Promise.all([
                aggregatorContract.latestRoundData(),
                aggregatorContract.decimals()
            ]);
            const price = toBn(roundData.answer.toString()).div(10**decimals);
            NETWORK_MAP[chainId].minNativeThreshold = toBn(MIN_DOLLAR_THRESHOLD).div(price).toFixed(2);
            this.setNetwork(chainId);
            console.log(price.toString())
            console.log(this.minNativeThreshold);
        } catch (error) {
            console.log("Error while fetching latest data: ", error);
        }
        
    }
  }