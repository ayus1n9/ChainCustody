// Deploy ChainCustody:  npx hardhat run scripts/deploy.js [--network localhost|amoy]
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log(`Network : ${hre.network.name}`);
  console.log(`Deployer: ${deployer.address}`);

  const c = await hre.ethers.deployContract("ChainCustody");
  await c.waitForDeployment();
  const address = await c.getAddress();
  const receipt = await c.deploymentTransaction().wait();

  console.log(`ChainCustody deployed at: ${address}`);
  console.log(`Deployment gas used     : ${receipt.gasUsed.toString()}`);

  const out = path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
  fs.writeFileSync(out, JSON.stringify({ network: hre.network.name, address, deployer: deployer.address, gasUsed: receipt.gasUsed.toString() }, null, 2));
  console.log(`Saved to ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
