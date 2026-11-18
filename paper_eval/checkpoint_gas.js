// Steady-state gas of CheckpointWitness.checkpoint: 100 checkpoints on one stream.
const { ethers } = require("hardhat");
const fs = require("fs"), path = require("path");
async function main() {
  const [owner, w] = await ethers.getSigners();
  const W = await ethers.deployContract("CheckpointWitness");
  const dep = Number((await W.deploymentTransaction().wait()).gasUsed);
  await (await W.setWitness(w.address, true)).wait();
  const tag = ethers.id("custody-chain-A");
  const gas = [];
  for (let h = 1; h <= 100; h++) gas.push(Number((await (await W.connect(w).checkpoint(tag, h * 16, ethers.id("b" + h))).wait()).gasUsed));
  const rest = gas.slice(1);
  const out = { deployment: dep, first: gas[0], steady: { n: rest.length, mean: Math.round(rest.reduce((a, b) => a + b) / rest.length), min: Math.min(...rest), max: Math.max(...rest) } };
  fs.writeFileSync(path.join(__dirname, "checkpoint_gas.json"), JSON.stringify(out, null, 2));
  console.log(out);
}
main().catch((e) => { console.error(e); process.exit(1); });
