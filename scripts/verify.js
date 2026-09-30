/**
 * Standalone Forensic CLI Verification Utility
 * Usage: npx hardhat run scripts/verify.js [--file <path>] [--id <number>]
 * Or: npm run verify -- <path> <id>
 */
const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ANSI color helpers
const B = "\x1b[1m", R = "\x1b[0m", G = "\x1b[32m", RD = "\x1b[31m", CY = "\x1b[36m", Y = "\x1b[33m", D = "\x1b[2m";

function sha256(buf) {
  return "0x" + crypto.createHash("sha256").update(buf).digest("hex");
}

async function main() {
  const args = process.argv.slice(2);
  let filePath = process.env.FILE || "sample/evidence_report.txt";
  let evidenceId = process.env.ID ? parseInt(process.env.ID, 10) : 1;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file" && args[i + 1]) filePath = args[++i];
    else if (args[i] === "--id" && args[i + 1]) evidenceId = parseInt(args[++i], 10);
    else if (!args[i].startsWith("--")) {
      if (fs.existsSync(args[i])) filePath = args[i];
      else if (!isNaN(parseInt(args[i], 10))) evidenceId = parseInt(args[i], 10);
    }
  }

  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`${RD}[ERROR]${R} File not found: ${resolvedPath}`);
    process.exit(1);
  }

  const fileBytes = fs.readFileSync(resolvedPath);
  const computedHash = sha256(fileBytes);

  console.log(`\n${B}${CY}======================================================================${R}`);
  console.log(`${B}         CHAINCUSTODY: FORENSIC INTEGRITY VERIFICATION REPORT         ${R}`);
  console.log(`${B}${CY}======================================================================${R}`);
  console.log(`  Target File       : ${filePath}`);
  console.log(`  File Size         : ${fileBytes.length} bytes`);
  console.log(`  Computed SHA-256  : ${B}${computedHash}${R}`);
  console.log(`  Target Evidence ID: #${evidenceId}`);
  console.log(`  Network           : ${hre.network.name}`);

  // Resolve contract instance
  let contract;
  const depPath = path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);

  if (fs.existsSync(depPath) && hre.network.name !== "hardhat") {
    const dep = JSON.parse(fs.readFileSync(depPath, "utf8"));
    contract = await ethers.getContractAt("ChainCustody", dep.address);
    console.log(`  Contract Address  : ${dep.address}`);
  } else {
    // In-process Hardhat chain: simulate deployment & baseline registration
    const [admin, inv] = await ethers.getSigners();
    contract = await ethers.deployContract("ChainCustody");
    await contract.waitForDeployment();
    await contract.registerParty(inv.address, 1);

    // Seed baseline sample evidence if verifying ID #1
    const sampleRaw = fs.readFileSync(path.join(__dirname, "..", "sample", "evidence_report.txt"));
    const sampleHash = sha256(sampleRaw);
    await contract.connect(inv).registerEvidence(sampleHash, "sim-sample-42f11e", "0x" + "ab".repeat(64));
    console.log(`  Contract Address  : ${await contract.getAddress()} (Hardhat In-Process)`);
  }

  try {
    const [anchoredHash, cid, custodian, createdAt] = await contract.getEvidence(evidenceId);
    const isValid = await contract.verifyIntegrity(evidenceId, computedHash);

    console.log(`  Anchored Hash     : ${anchoredHash}`);
    console.log(`  Storage CID       : ${cid}`);
    console.log(`  Current Custodian : ${custodian}`);
    console.log(`  Registered At     : ${new Date(Number(createdAt) * 1000).toUTCString()}`);
    console.log(`${B}----------------------------------------------------------------------${R}`);

    if (isValid) {
      console.log(`  ${B}${G}VERIFICATION RESULT : [PASS] INTEGRITY CONFIRMED (100% BIT-FOR-BIT MATCH)${R}`);
      console.log(`  ${D}The file cryptographic signature matches the immutable on-chain ground truth.${R}`);
    } else {
      console.log(`  ${B}${RD}VERIFICATION RESULT : [FAIL] TAMPER DETECTED: HASH MISMATCH!${R}`);
      console.log(`  ${RD}WARNING: This file has been altered or substituted after initial acquisition.${R}`);
    }
  } catch (err) {
    console.log(`  ${B}${RD}VERIFICATION RESULT : [ERROR] ${err.message}${R}`);
  }
  console.log(`${B}${CY}======================================================================${R}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
