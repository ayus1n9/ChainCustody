require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { AMOY_RPC_URL, PRIVATE_KEY } = process.env;

// Only add the Polygon Amoy testnet if a (throwaway) test wallet key is provided.
const networks = {};
if (PRIVATE_KEY) {
  networks.amoy = {
    url: AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
    chainId: 80002,
    accounts: [PRIVATE_KEY],
  };
}

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  networks,
  gasReporter: { enabled: process.env.REPORT_GAS === "true" },
};
