const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const ROLE_NAMES = ["None", "Investigator", "ForensicLab", "Court", "Defense"];

async function main() {
  const [admin] = await hre.ethers.getSigners();
  const deployPath = path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
  if (!fs.existsSync(deployPath)) {
    console.error(`[ERROR] Deployment file not found: ${deployPath}. Run 'npm run deploy:local' first.`);
    process.exit(1);
  }

  const { address } = JSON.parse(fs.readFileSync(deployPath, "utf8"));
  const custody = await hre.ethers.getContractAt("ChainCustody", address);

  const targetAddress = process.env.PARTY_ADDRESS;
  const targetRole = process.env.ROLE ? parseInt(process.env.ROLE, 10) : 1; // Default: Investigator (1)

  if (targetAddress) {
    console.log(`Registering ${targetAddress} as ${ROLE_NAMES[targetRole]} (Role ${targetRole})...`);
    const tx = await custody.registerParty(targetAddress, targetRole);
    await tx.wait();
    console.log(`[SUCCESS] ${targetAddress} is now registered as ${ROLE_NAMES[targetRole]}.`);
  } else {
    const signers = await hre.ethers.getSigners();
    console.log(`\nRegistering standard local test accounts on ChainCustody (${address}):`);

    const defaultRoles = [
      { signer: signers[1], role: 1, name: "Investigator" },
      { signer: signers[2], role: 2, name: "ForensicLab" },
      { signer: signers[3], role: 3, name: "Court" },
      { signer: signers[4], role: 4, name: "Defense" },
    ];

    for (const item of defaultRoles) {
      const currentRole = await custody.roleOf(item.signer.address);
      if (Number(currentRole) === 0) {
        const tx = await custody.registerParty(item.signer.address, item.role);
        await tx.wait();
        console.log(`  [OK] Registered Account #${signers.indexOf(item.signer)} (${item.signer.address}) as ${item.name}`);
      } else {
        console.log(`  [INFO] Account #${signers.indexOf(item.signer)} (${item.signer.address}) already registered as ${ROLE_NAMES[currentRole]}`);
      }
    }
  }
}

main().catch((err) => {
  console.error("Registration error:", err.message);
  process.exit(1);
});
