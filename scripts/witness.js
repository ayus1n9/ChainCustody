#!/usr/bin/env node
require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const CUSTODY_RPC = process.env.RPC_URL || "http://127.0.0.1:8545";
const WITNESS_RPC = process.env.WITNESS_RPC || process.env.RPC_URL || "http://127.0.0.1:8545";
const WITNESS_K = parseInt(process.env.WITNESS_K || "16", 10);
const POLL_INTERVAL_MS = parseInt(process.env.WITNESS_POLL_INTERVAL || "3000", 10);
const CHAIN_TAG = process.env.CHAIN_TAG
  ? (process.env.CHAIN_TAG.startsWith("0x") ? process.env.CHAIN_TAG : ethers.id(process.env.CHAIN_TAG))
  : ethers.id("chaincustody-main");

// Default local Hardhat account #1 private key if not set
const DEFAULT_WITNESS_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const WITNESS_PRIVATE_KEY = process.env.WITNESS_PRIVATE_KEY || DEFAULT_WITNESS_KEY;

const CHECKPOINT_WITNESS_ABI = [
  "function setWitness(address w, bool allowed) external",
  "function checkpoint(bytes32 chainTag, uint64 height, bytes32 blockHash) external",
  "function matches(bytes32 chainTag, uint64 height, bytes32 blockHash) external view returns (bool)",
  "function latestHeight(bytes32 chainTag) external view returns (uint64)",
  "function anchored(bytes32 chainTag, uint64 height) external view returns (bytes32)",
  "function isWitness(address) external view returns (bool)",
  "function owner() external view returns (address)",
  "event Checkpointed(bytes32 indexed chainTag, uint64 indexed height, bytes32 blockHash, address indexed witness)"
];

function getWitnessContractAddress() {
  if (process.env.WITNESS_CONTRACT_ADDRESS) {
    return process.env.WITNESS_CONTRACT_ADDRESS;
  }
  const depPath = path.join(__dirname, "..", "deployments", "checkpoint_witness.json");
  if (fs.existsSync(depPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(depPath, "utf8"));
      if (data.address) return data.address;
    } catch (e) {}
  }
  return null;
}

async function getOrDeployWitnessContract(witnessWallet, witnessRpcProvider) {
  const existingAddr = getWitnessContractAddress();
  if (existingAddr) {
    return new ethers.Contract(existingAddr, CHECKPOINT_WITNESS_ABI, witnessWallet);
  }

  // Load compiled artifact
  const artPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    "CheckpointWitness.sol",
    "CheckpointWitness.json"
  );
  if (!fs.existsSync(artPath)) {
    throw new Error("CheckpointWitness artifact not found. Please compile contracts first.");
  }
  const art = JSON.parse(fs.readFileSync(artPath, "utf8"));
  const factory = new ethers.ContractFactory(art.abi, art.bytecode, witnessWallet);
  console.log("[WITNESS] Deploying CheckpointWitness contract...");
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const deployedAddr = await contract.getAddress();
  console.log(`[WITNESS] CheckpointWitness deployed at: ${deployedAddr}`);

  // Authorize witness
  const isWit = await contract.isWitness(witnessWallet.address);
  if (!isWit) {
    const tx = await contract.setWitness(witnessWallet.address, true);
    await tx.wait();
    console.log(`[WITNESS] Registered ${witnessWallet.address} as authorized witness`);
  }

  // Save to deployments
  const depDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(depDir)) fs.mkdirSync(depDir, { recursive: true });
  fs.writeFileSync(
    path.join(depDir, "checkpoint_witness.json"),
    JSON.stringify({ address: deployedAddr, chainTag: CHAIN_TAG, deployedAt: new Date().toISOString() }, null, 2)
  );

  return contract;
}

async function pollAndCheckpoint(custodyProvider, witnessContract, options = {}) {
  const k = options.k || WITNESS_K;
  const tag = options.chainTag || CHAIN_TAG;

  const currentHeight = await custodyProvider.getBlockNumber();
  const latestCheckpointed = Number(await witnessContract.latestHeight(tag));

  let targetHeight = 0;
  if (latestCheckpointed === 0) {
    if (currentHeight >= 1) {
      targetHeight = currentHeight - (currentHeight % k) || 1;
    }
  } else if (currentHeight >= latestCheckpointed + k) {
    targetHeight = latestCheckpointed + k;
  }

  if (targetHeight > 0 && targetHeight <= currentHeight && targetHeight > latestCheckpointed) {
    const block = await custodyProvider.getBlock(targetHeight);
    if (!block || !block.hash) {
      return { checkpointed: false, reason: "Block hash unavailable" };
    }

    const tx = await witnessContract.checkpoint(tag, targetHeight, block.hash);
    const receipt = await tx.wait();
    return {
      checkpointed: true,
      height: targetHeight,
      blockHash: block.hash,
      txHash: receipt.hash
    };
  }

  return {
    checkpointed: false,
    currentHeight,
    latestCheckpointed
  };
}

async function verifyWitnessStatus(custodyProvider, witnessContractInstance, options = {}) {
  const k = options.k || WITNESS_K;
  const tag = options.chainTag || CHAIN_TAG;

  let contract = witnessContractInstance;
  if (!contract) {
    const addr = getWitnessContractAddress();
    if (!addr) {
      return { available: false, verified: false, statusText: "Witness contract not configured" };
    }
    const witnessProvider = new ethers.JsonRpcProvider(WITNESS_RPC);
    contract = new ethers.Contract(addr, CHECKPOINT_WITNESS_ABI, witnessProvider);
  }

  try {
    const currentHeight = await custodyProvider.getBlockNumber();
    const latestHeight = Number(await contract.latestHeight(tag));

    if (latestHeight === 0) {
      return {
        available: true,
        verified: false,
        latestHeight: 0,
        custodyHeight: currentHeight,
        statusText: "Witness: Unverified (no checkpoints yet)"
      };
    }

    const anchoredHash = await contract.anchored(tag, latestHeight);
    const custodyBlock = await custodyProvider.getBlock(latestHeight);

    if (!custodyBlock || !custodyBlock.hash) {
      return {
        available: true,
        verified: false,
        latestHeight,
        custodyHeight: currentHeight,
        statusText: "Witness: Unverified (block not found)"
      };
    }

    const isMatch = await contract.matches(tag, latestHeight, custodyBlock.hash);
    const behind = currentHeight - latestHeight;
    const isFresh = behind <= (2 * k);

    return {
      available: true,
      verified: isMatch && isFresh,
      matches: isMatch,
      latestHeight,
      custodyHeight: currentHeight,
      behindBlocks: behind,
      blockHash: custodyBlock.hash,
      anchoredHash,
      statusText: isMatch
        ? (isFresh ? `Verified (block #${latestHeight})` : `Unverified (${behind} blocks behind)`)
        : `Unverified (hash mismatch at block #${latestHeight}!)`
    };
  } catch (err) {
    return {
      available: false,
      verified: false,
      error: err.message,
      statusText: `Witness: Unverified (${err.message})`
    };
  }
}

async function startDaemon() {
  console.log(`\n======================================================`);
  console.log(`ChainCustody Checkpoint Witness Service`);
  console.log(`    Custody RPC : ${CUSTODY_RPC}`);
  console.log(`    Witness RPC : ${WITNESS_RPC}`);
  console.log(`    Frequency K : every ${WITNESS_K} blocks`);
  console.log(`    Chain Tag   : ${CHAIN_TAG.slice(0, 16)}...`);
  console.log(`======================================================\n`);

  const custodyProvider = new ethers.JsonRpcProvider(CUSTODY_RPC);
  const witnessProvider = new ethers.JsonRpcProvider(WITNESS_RPC);
  const witnessWallet = new ethers.Wallet(WITNESS_PRIVATE_KEY, witnessProvider);

  const witnessContract = await getOrDeployWitnessContract(witnessWallet, witnessProvider);

  console.log(`[WITNESS] Witness address: ${witnessWallet.address}`);
  console.log(`[WITNESS] Polling every ${POLL_INTERVAL_MS}ms...\n`);

  let running = true;
  process.on("SIGINT", () => {
    console.log("\n[WITNESS] Shutting down witness daemon...");
    running = false;
    process.exit(0);
  });

  while (running) {
    try {
      const res = await pollAndCheckpoint(custodyProvider, witnessContract);
      if (res.checkpointed) {
        console.log(`[WITNESS] [CHECKPOINT] Checkpointed Block #${res.height} (${res.blockHash.slice(0, 14)}...) Tx: ${res.txHash}`);
      }
    } catch (err) {
      console.error(`[WITNESS] Error in polling loop:`, err.message);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

if (require.main === module) {
  startDaemon().catch((err) => {
    console.error("[WITNESS] Fatal error:", err);
    process.exit(1);
  });
}

module.exports = {
  CHECKPOINT_WITNESS_ABI,
  pollAndCheckpoint,
  verifyWitnessStatus,
  getWitnessContractAddress,
  getOrDeployWitnessContract,
  CHAIN_TAG,
  WITNESS_K
};
