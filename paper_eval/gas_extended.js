/**
 * Extended gas benchmark for the paper: covers the operations scripts/benchmark.js skips.
 * Run: npx hardhat --config hardhat.local.config.js run paper_eval/gas_extended.js
 * Writes paper_eval/gas_extended.json
 */
const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");
const { MerkleTree } = require("../client/merkle");
const { signCustodyHandover } = require("../client/eip712");

const N = 30;
const KEY_256 = "0x" + "ab".repeat(256);
const CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"; // 59 chars
const META = {
  deviceSerial: "SAMSUNG-980PRO-NVMe-1TB-S5GANG0N10423",
  acquisitionTool: "FTK Imager v4.7.1",
  officerBadge: "DET-CYBER-8841",
  jurisdiction: "IN-AP-AMR-CCU",
};
const stats = (a) => ({
  n: a.length,
  mean: Math.round(a.reduce((x, y) => x + y, 0) / a.length),
  min: Math.min(...a),
  max: Math.max(...a),
});

async function main() {
  const [admin, inv, lab, court, defense, relayer] = await ethers.getSigners();
  const c = await ethers.deployContract("ChainCustody");
  await c.waitForDeployment();
  const addr = await c.getAddress();
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const g = async (txp) => Number((await (await txp).wait()).gasUsed);

  const out = {};
  const regParty = [];
  regParty.push(await g(c.registerParty(inv.address, 1)));
  regParty.push(await g(c.registerParty(lab.address, 2)));
  regParty.push(await g(c.registerParty(court.address, 3)));
  regParty.push(await g(c.registerParty(defense.address, 4)));
  out.registerParty = stats(regParty);

  // warm-up item so later registrations are not the first write to evidenceCount
  let next = 1;
  await g(c.connect(inv).registerEvidence(ethers.id("warm"), CID, KEY_256));
  next++;
  const newId = () => next++;

  // registerEvidenceWithMetadata
  const meta = [];
  for (let i = 0; i < N; i++) {
    meta.push(await g(c.connect(inv).registerEvidenceWithMetadata(ethers.id("meta-" + i), CID, KEY_256, META)));
    newId();
  }
  out.registerEvidenceWithMetadata = stats(meta);

  // two-step transfer: propose, accept, cancel
  const prop = [], acc = [], canc = [];
  for (let i = 0; i < N; i++) {
    await g(c.connect(inv).registerEvidence(ethers.id("2s-" + i), CID, KEY_256));
    const id = newId();
    prop.push(await g(c.connect(inv).proposeCustodyTransfer(id, lab.address, KEY_256)));
    acc.push(await g(c.connect(lab).acceptCustody(id)));
  }
  for (let i = 0; i < N; i++) {
    await g(c.connect(inv).registerEvidence(ethers.id("cx-" + i), CID, KEY_256));
    const id = newId();
    await g(c.connect(inv).proposeCustodyTransfer(id, lab.address, KEY_256));
    canc.push(await g(c.connect(inv).cancelCustodyTransfer(id)));
  }
  out.proposeCustodyTransfer = stats(prop);
  out.acceptCustody = stats(acc);
  out.cancelCustodyTransfer = stats(canc);
  out.twoStepTotal = { mean: out.proposeCustodyTransfer.mean + out.acceptCustody.mean };

  // EIP-712 signed transfer, submitted by a third-party relayer
  const sig = [];
  const deadline = BigInt((await ethers.provider.getBlock("latest")).timestamp) + 3600n;
  for (let i = 0; i < N; i++) {
    await g(c.connect(inv).registerEvidence(ethers.id("sig-" + i), CID, KEY_256));
    const id = newId();
    const nonce = await c.nonces(id);
    const { signature } = await signCustodyHandover({
      signer: inv, contractAddress: addr, chainId, evidenceId: id,
      from: inv.address, to: court.address, wrappedKey: KEY_256, nonce, deadline,
    });
    sig.push(await g(c.connect(relayer).transferCustodyWithSignature(id, court.address, KEY_256, deadline, signature)));
  }
  out.transferCustodyWithSignature = stats(sig);

  // seal / unseal
  const seal = [], unseal = [];
  for (let i = 0; i < N; i++) {
    await g(c.connect(inv).registerEvidence(ethers.id("seal-" + i), CID, KEY_256));
    const id = newId();
    seal.push(await g(c.connect(court).sealEvidence(id, "Order 2026/CR/0042")));
    unseal.push(await g(c.connect(court).unsealEvidence(id, "Order 2026/CR/0042-U")));
  }
  out.sealEvidence = stats(seal);
  out.unsealEvidence = stats(unseal);

  // hold, then disposal (propose + confirm) on fresh items without a hold
  const hold = [], propD = [], confD = [];
  const now = BigInt((await ethers.provider.getBlock("latest")).timestamp);
  for (let i = 0; i < N; i++) {
    await g(c.connect(inv).registerEvidence(ethers.id("hold-" + i), CID, KEY_256));
    const id = newId();
    hold.push(await g(c.connect(court).placeEvidentiaryHold(id, now + 86400n * 365n, "Retention 7 years")));
  }
  for (let i = 0; i < N; i++) {
    await g(c.connect(inv).registerEvidence(ethers.id("disp-" + i), CID, KEY_256));
    const id = newId();
    propD.push(await g(c.connect(court).proposeDisposal(id, "Expungement order 2026/77")));
    confD.push(await g(c.connect(inv).confirmDisposal(id)));
  }
  out.placeEvidentiaryHold = stats(hold);
  out.proposeDisposal = stats(propD);
  out.confirmDisposal = stats(confD);

  // view calls: gas as estimated for a transaction carrying the same call
  const vi = await c.verifyIntegrity.estimateGas(2, ethers.id("meta-0"));
  const leaves = Array.from({ length: 1024 }, (_, i) => Buffer.from("file-" + i));
  const tree = new MerkleTree(leaves);
  await g(c.connect(inv).registerEvidence(tree.getRoot(), CID, KEY_256));
  const rootId = newId();
  const proof = tree.getProof(517);
  const ok = await c.verifyBatchInclusion(rootId, tree.getLeaf(517), proof);
  const vb = await c.verifyBatchInclusion.estimateGas(rootId, tree.getLeaf(517), proof);
  out.views = {
    verifyIntegrity_estimateGas: Number(vi),
    verifyBatchInclusion_1024leaves_estimateGas: Number(vb),
    merkleProofLength: proof.length,
    merkleProofValid: ok,
  };

  // sensitivity of registration and grant gas to wrapped-key size
  const sweep = [];
  for (const bytes of [32, 128, 256, 512]) {
    const key = "0x" + "cd".repeat(bytes);
    const reg = [], gr = [];
    for (let i = 0; i < 5; i++) {
      reg.push(await g(c.connect(inv).registerEvidence(ethers.id(`k${bytes}-${i}`), CID, key)));
      const id = newId();
      gr.push(await g(c.connect(inv).grantAccess(id, lab.address, key)));
    }
    sweep.push({ wrappedKeyBytes: bytes, registerEvidence: stats(reg).mean, grantAccess: stats(gr).mean });
  }
  out.wrappedKeySweep = sweep;

  out.env = {
    hardhat: require("hardhat/package.json").version,
    ethers: ethers.version,
    node: process.version,
    solc: hre.config.solidity.compilers[0].version,
    optimizer: hre.config.solidity.compilers[0].settings.optimizer,
    viaIR: hre.config.solidity.compilers[0].settings.viaIR,
    evmVersion: hre.config.solidity.compilers[0].settings.evmVersion || "hardhat default",
    hardfork: hre.config.networks.hardhat.hardfork,
  };
  fs.writeFileSync(path.join(__dirname, "gas_extended.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
