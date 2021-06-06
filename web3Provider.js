const Web3 = require('web3');
const config = require('./config');
let web3 = new Web3(new Web3.providers.HttpProvider(config.network.ETH));

module.exports = web3;