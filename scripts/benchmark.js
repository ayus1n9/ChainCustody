/**
 * Gas benchmark for every ChainCustody operation.   Run:  npx hardhat run scripts/benchmark.js
 * Runs on Hardhat's local chain, so GAS numbers are exact (gas is deterministic for the same
 * contract + inputs). Latency on a local chain is NOT representative of a real network.
 *
 * Optional cost estimate (values change daily - use current ones):
 *   GAS_PRICE_GWEI=30 TOKEN_PRICE_USD=0.5 npx hardhat run scripts/benchmark.js
 */
const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");

const N_SCALE = 200;   // evidence records used to check that gas does not grow with registry size
const N_OPS = 30;      // repetitions for grant / log / revoke / transfer
const KEY_256 = "0x" + "ab".repeat(256);              // size of an RSA-2048 wrapped key
const CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"; // realistic CID length

const stats = (a) => ({ n: a.length, mean: Math.round(a.reduce((x, y) => x + y, 0) / a.length), min: Math.min(...a), max: Math.max(...a) });

async function main() {
  const [admin, inv, lab, court] = await ethers.getSigners();
  const c = await ethers.deployContract("ChainCustody");
  const deployReceipt = await c.deploymentTransaction().wait();
  await c.registerParty(inv.address, 1);
  await c.registerParty(lab.address, 2);
  await c.registerParty(court.address, 3);

  const gas = { registerEvidence: [], grantAccess: [], logAccess: [], revokeAccess: [], transferCustody: [] };
  const g = async (txp) => Number((await (await txp).wait()).gasUsed);

  const registerGas = [];
  for (let i = 1; i <= N_SCALE; i++) {
    registerGas.push(await g(c.connect(inv).registerEvidence(ethers.id("file-" + i), CID, KEY_256)));
  }
  gas.registerEvidence = registerGas;

  for (let i = 1; i <= N_OPS; i++) {
    gas.grantAccess.push(await g(c.connect(inv).grantAccess(i, lab.address, KEY_256)));
    gas.logAccess.push(await g(c.connect(lab).logAccess(i)));
    gas.revokeAccess.push(await g(c.connect(inv).revokeAccess(i, lab.address)));
  }
  for (let i = 1; i <= N_OPS; i++) {
    gas.transferCustody.push(await g(c.connect(inv).transferCustody(i, court.address, KEY_256)));
  }

  const summary = { deployment: Number(deployReceipt.gasUsed) };
  for (const k of Object.keys(gas)) summary[k] = stats(gas[k]);

  const scaling = [1, 50, 100, 200].map((i) => ({ registrySizeBefore: i - 1, registerGas: registerGas[i - 1] }));

  console.log("\nGas per operation (RSA-2048 wrapped key = 256 bytes, CID = 59 chars)\n");
  console.log("operation".padEnd(18), "runs".padStart(5), "mean".padStart(9), "min".padStart(9), "max".padStart(9));
  console.log("-".repeat(54));
  console.log("deployment".padEnd(18), "1".padStart(5), String(summary.deployment).padStart(9));
  for (const k of Object.keys(gas)) {
    const s = summary[k];
    console.log(k.padEnd(18), String(s.n).padStart(5), String(s.mean).padStart(9), String(s.min).padStart(9), String(s.max).padStart(9));
  }
  console.log("\nDoes gas grow with the number of records? (mapping lookups should be O(1))");
  scaling.forEach((s) => console.log(`  registry already holds ${String(s.registrySizeBefore).padStart(3)} records -> registerEvidence gas = ${s.registerGas}`));

  const gp = parseFloat(process.env.GAS_PRICE_GWEI), tp = parseFloat(process.env.TOKEN_PRICE_USD);
  const cost = {};
  if (gp > 0 && tp > 0) {
    console.log(`\nIllustrative cost at ${gp} gwei and $${tp}/token (YOUR assumptions, not live data):`);
    for (const k of Object.keys(gas)) {
      cost[k] = summary[k].mean * gp * 1e-9 * tp;
      console.log(`  ${k.padEnd(18)} ~ $${cost[k].toFixed(6)}`);
    }
  } else {
    console.log("\n(Set GAS_PRICE_GWEI and TOKEN_PRICE_USD to print an illustrative USD cost.)");
  }

  const out = path.join(__dirname, "..", "results", "gas-report.json");
  fs.writeFileSync(out, JSON.stringify({ summary, scaling, assumptions: { gasPriceGwei: gp || null, tokenPriceUsd: tp || null }, costUsd: cost, note: "Local Hardhat chain; gas exact, latency not representative." }, null, 2));
  console.log(`\nSaved ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
