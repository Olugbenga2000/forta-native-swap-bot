# Native Swaps Forta Detection Bot

## Description

This bot detects attackers swapping ERC tokens to native tokens using decentralized exchanges


## Supported Chains

- Ethereum
- Polygon
- Arbitrum
- Optimism
- Avalanche
- Fantom
- BNBChain


## Alerts

Describe each of the type of alerts fired by this agent

- UNUSUAL-NATIVE-SWAPS-BOT-1
  - Fired when an attacker swaps ERC tokens to native tokens using decentralized exchanges
  - Severity is always set to "Unknown" 
  - Type is always set to "Suspicious"
  - Metadata contains the following fields: 
    - attackerAddress: address of the attacker
    - amountOfSwappedToken: amount of ERC token swapped
    - amountOfETHReceived: amount of ETH received from swap
    - attackerNonce: total number of attacker transactions
    - 

## Test Data

The bot behaviour can be verified with the following transactions:
PEAK DEFI HACK
npm run sequence "15899279, 15899306, 15899329, 15899345, 15899373"
npm run tx  0x799e0960d5051ba6d11eeccb2804cac026b1beffcab61194ad41a8020eec1e36,0xcf7d42d06ee67f68b78439b9dc52f27f89d54448e8593de0d422300d043834b7,0xba4c2dcacda4cad0a4c5725f3d2a2e35633fd02820025cd536af37123cda083a,0x2f40c4167ca44eeb3c519fb3d19d488a58005f0393930bd6014b918353de8ca8,0x5983334753be11dd7267b0e6b7fa87c11a0dd3c7886790c4a01780f031192e1b

RABBY.IO
npm run tx 0xddffcfd4a7d85d701f9e3485f88b3966bb589507706b76bc293460ba96bc2ef4,0x20c7d62953253a0c7718322ede8aec763a74176330898e35797914f81f920379