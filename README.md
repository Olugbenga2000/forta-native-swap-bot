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

- NATIVE-SWAPS-CONTRACT-1
  - Fired when an attacker swaps ERC tokens to native tokens using decentralized exchanges
  - Severity is always set to "low" 
  - Type is always set to "info"
  - Metadata contains the following fields: 
    - attackerAddress: address of the attacker
    - amountOfSwappedToken: amount of ERC token swapped
    - amountOfETHReceived: amount of ETH received from swap
    - attackerNonce: total number of attacker transactions
    - 

## Test Data

The bot behaviour can be verified with the following transactions:
