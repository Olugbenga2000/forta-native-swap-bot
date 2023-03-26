# Native Swaps Forta Detection Bot

## Description

This bot detects if an address with low nonce swaps several ERC-20 tokens to a large 
amount of native token over multiple transactions within a limited interval of time 
using decentralized exchanges. 


## Supported Chains

- Ethereum
- Polygon
- Arbitrum
- Optimism
- Avalanche
- Fantom
- BNBChain


## Alerts

- UNUSUAL-NATIVE-SWAPS
  - Fired when an address swaps ERC-20 tokens to a large amount of native token using decentralized exchanges
  - Severity is always set to "Unknown" 
  - Type is always set to "Suspicious"
  - Metadata contains the following fields: 
    - `attackerAddress`: address of the attacker
    - `amountOfETHReceived`: total amount of native token received by the attacker from the native swaps .
    - `totalSwapCount`: total number of native swaps by the attacker from which the finding was emitted.
    - `swapStartBlock`: the block number of the first swap by the attacker.
    - `swapStartBlockTimestamp`: the block timestamp of the first swap by the attacker.
    - `swapEndBlock`: the block number of the last swap by the attacker.
    - `swapEndBlockTimestamp`: the block timestamp of the last swap by the attacker.
    - `swapTokensAddressesAndAmounts`: the tokens addresses and amounts swapped by the attacker
       (only swaps from which the finding was generated)
    - `anomalyScore`: calculated by the number of native swaps resulting in a finding divided by the total
       number of native swaps
  - Label:
    - `entity`: The attacker's address
    - `entityType`: The type of the entity, always set to "Address"
    - `label`: The type of the label, always set to "Attacker"
    - `confidence`: The confidence level of the address being an attacker, always set to "0.3"

## Thresholds
  - `LOW_NONCE_THRESHOLD` : Refers to the maximum transaction count (nonce) for an address to be considered  new. Any address with nonce higher than this value won't be considered for a finding. The default value is 150 and can be adjusted by setting the `LOW_NONCE_THRESHOLD` in `src/constants` file, L3.

  - `MAX_MINUTES_BETWEEN_SWAPS` : Refers to the maximum time interval(minutes) between swaps to be considered concurrent. If there is a new native swap by an address with a time difference(in minutes) greater than this value, compared to the last native swap by the same address, then the previous swap(s) are deleted and only this new swap is considered for a finding. The default value is 30 and can be adjusted by setting the `MAX_MINUTES_BETWEEN_SWAPS` in `src/constants` file, L5.

  - `MINIMUM_SWAP_COUNT` : This refers to the minimum number of concurrent native swaps an address must make
  for it to be considered for a finding. Any number of native swaps by an address below this value won't emit a finding even if all other conditions are fullfilled. The default value is 2 and can be adjusted by setting the `MINIMUM_SWAP_COUNT` in `src/constants` file, L1.

  - `MIN_ETH_THRESHOLD`: This refers to the minimum number of native currency that must be received by an address across multiple concurrent native swaps to emit a finding. The default value is 30 and can be adjusted by setting the `MIN_ETH_THRESHOLD` in `src/constants` file, L4.

## Test Data

The bot behaviour can be verified with the following transactions:
### PEAK DEFI HACK
npm run tx  [0x799e0960d5051ba6d11eeccb2804cac026b1beffcab61194ad41a8020eec1e36],[0xcf7d42d06ee67f68b78439b9dc52f27f89d54448e8593de0d422300d043834b7],[0xba4c2dcacda4cad0a4c5725f3d2a2e35633fd02820025cd536af37123cda083a],[0x2f40c4167ca44eeb3c519fb3d19d488a58005f0393930bd6014b918353de8ca8],[0x5983334753be11dd7267b0e6b7fa87c11a0dd3c7886790c4a01780f031192e1b]

### RABBY.IO HACK
npm run tx [0xddffcfd4a7d85d701f9e3485f88b3966bb589507706b76bc293460ba96bc2ef4],[0x20c7d62953253a0c7718322ede8aec763a74176330898e35797914f81f920379]

for alerts to be raised for these test data, the various thresholds should be set to their default values.