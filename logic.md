### Source of ERC Token

##### Detect large native token swap
<!-- - check emitted transfer events in a block
- check emitted transfer events within a block where the `value` arg is greater than a particular threshold
- check the `to` args of this transfer event (mark this as suspected attacker address) -->


- check the emitted transfer events where `value` exceeds a particular threshold ($20,000) after using chainlink priceFeed
- if this value exceeds the threshold, mark the recipient EOA and token address (suspected attacker)
- check attacker address transactions for transfers involving the detected token address
- check transfers to suspected attacker from contract address if the token was transferred from a contract address
- check the balance of the contract 100 blocks before current block
