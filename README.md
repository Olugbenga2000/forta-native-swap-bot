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

- RAKE-TOKEN-CONTRACT-1
  - Fired when a token takes significant percentage fee on Uniswap Router and transfers it to an EOA
  - Severity is always set to "low" 
  - Type is always set to "info"
  - Metadata contains the following fields: 
    - rakeTokenAddress: address of the rake scam token
    - pairAddress: address of the created uniswap tokens pair
    - from: address of the user initiating the swap transaction on Uniswap
    - totalAmountTransferred: total amount of scam tokens transferred to Uniswap Router contract
    - actualAmountReceived: amount received by the user executing the swap following the deduction of swap fee
    - rakedFee: total fee taken by scam token contract
    - rakedFeePercentage: percentage of the fee raked in by the scam token contract
    - anomalyScore: total finding count divided by total unique rake token addresses detected
    - attackerRakeTokenDeployer: address of the rake token contract deployer
    - rakeTokenDeployTxHash: transaction hash of the deployed rake token contract
    - rakeFeeRecipient: address to which the rake fee is transferred
    - ethTransferredToRakeFeeRecipient: ETH value transferred to rake fee recipient

## Test Data

The bot behaviour can be verified with the following transactions:
- [0x300e0afc3b94b77b7310ad632a2377bafd017ff8078470f73dfb01f4917b5379](https://etherscan.io/tx/0x300e0afc3b94b77b7310ad632a2377bafd017ff8078470f73dfb01f4917b5379) - 
`Ethereum Mainnet - swapExactTokensForEthSupportingFeeOnTransferTokens`
  > Raked Fee Percentage - 5%



- [0x4ca490a9e8a84765dbffe7b56a04818be4947ab280b498104b166f12c2e312c5](https://etherscan.io/tx/0x4ca490a9e8a84765dbffe7b56a04818be4947ab280b498104b166f12c2e312c5) -
`Ethereum Mainnet - swapExactETHForTokensSupportingFeeOnTransferTokens`
  > Raked Fee Percentage -  5%



- [0xcde33f74ec5704351da105e153e7012a6303815e6c82acab12bdf016e7da15c1](https://etherscan.io/tx/0xcde33f74ec5704351da105e153e7012a6303815e6c82acab12bdf016e7da15c1) -
`Ethereum Mainnet - swapExactTokensForTokensSupportingFeeOnTransferTokens`
  > Raked Fee Percentage -  5.75%


- This bot's default THRESHOLD_PERCENTAGEAGE is 3 and this can be changed by modifying the `THRESHOLD_PERCENTAGEAGE` variable in `src/constants.ts` - [L24](https://github.com/sprtd/rake-scam-token-forta-detection-bot/blob/main/src/constants.ts#L24)
