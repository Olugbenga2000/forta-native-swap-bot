export const MINIMUM_SWAP_COUNT = 2;
export const ERC20_TRANSFER_EVENT = "event Transfer(address indexed from, address indexed to, uint256 value)";
export const LOW_NONCE_THRESHOLD = 150;
export const MIN_DOLLAR_THRESHOLD = 55000;
export const MAX_MINUTES_BETWEEN_SWAPS = 30;
export const AGGREGATORV3_ABI = [
  "function latestRoundData()external view returns (uint80 roundId,int256 answer,uint256 startedAt,uint256 updatedAt,uint80 answeredInRound)",
  "function decimals() external view returns (uint8)",
];
export const BLOCK_DELAY = 10;
