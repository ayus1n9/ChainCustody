const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const witness = require("../scripts/witness");
const { createServer } = require("../scripts/server");

async function deployWitnessFixture() {
  const [owner, witnessSigner, user] = await ethers.getSigners();

  const witnessContract = await ethers.deployContract("CheckpointWitness");
  await witnessContract.waitForDeployment();

  await witnessContract.setWitness(witnessSigner.address, true);

  const chainTag = ethers.id("test-custody-chain");

  return { witnessContract, owner, witnessSigner, user, chainTag };
}

describe("Checkpoint Witness Service & Verification", () => {
  it("checkpoints block at interval K on CheckpointWitness contract", async () => {
    const { witnessContract, witnessSigner, chainTag } = await loadFixture(deployWitnessFixture);

    // Mine a few blocks on hardhat provider
    await ethers.provider.send("evm_mine", []);
    await ethers.provider.send("evm_mine", []);

    // Checkpoint using pollAndCheckpoint with k = 1
    const res = await witness.pollAndCheckpoint(ethers.provider, witnessContract.connect(witnessSigner), {
      chainTag,
      k: 1
    });

    expect(res.checkpointed).to.be.true;
    expect(res.height).to.be.greaterThan(0);

    const latest = await witnessContract.latestHeight(chainTag);
    expect(Number(latest)).to.equal(res.height);

    const block = await ethers.provider.getBlock(res.height);
    const matches = await witnessContract.matches(chainTag, res.height, block.hash);
    expect(matches).to.be.true;
  });

  it("verifyWitnessStatus correctly reports verified when block hash matches", async () => {
    const { witnessContract, witnessSigner, chainTag } = await loadFixture(deployWitnessFixture);

    await ethers.provider.send("evm_mine", []);
    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);

    await witnessContract.connect(witnessSigner).checkpoint(chainTag, blockNum, block.hash);

    const status = await witness.verifyWitnessStatus(ethers.provider, witnessContract, {
      chainTag,
      k: 16
    });

    expect(status.available).to.be.true;
    expect(status.verified).to.be.true;
    expect(status.matches).to.be.true;
    expect(status.latestHeight).to.equal(blockNum);
    expect(status.statusText).to.include(`Verified (block #${blockNum})`);
  });

  it("verifyWitnessStatus reports unverified when hash does not match", async () => {
    const { witnessContract, witnessSigner, chainTag } = await loadFixture(deployWitnessFixture);

    const blockNum = await ethers.provider.getBlockNumber();
    const fakeHash = ethers.id("tampered-block-hash");

    await witnessContract.connect(witnessSigner).checkpoint(chainTag, blockNum + 1, fakeHash);

    // Mine block so height matches
    await ethers.provider.send("evm_mine", []);

    const status = await witness.verifyWitnessStatus(ethers.provider, witnessContract, {
      chainTag,
      k: 16
    });

    expect(status.available).to.be.true;
    expect(status.verified).to.be.false;
    expect(status.matches).to.be.false;
    expect(status.statusText).to.include("hash mismatch");
  });

  it("GET /api/witness/status serves current witness verification state", async () => {
    const { witnessContract, witnessSigner, chainTag } = await loadFixture(deployWitnessFixture);

    await ethers.provider.send("evm_mine", []);
    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    await witnessContract.connect(witnessSigner).checkpoint(chainTag, blockNum, block.hash);

    const appServer = createServer({
      provider: ethers.provider,
      witnessContract: witnessContract,
      chainTag,
      witnessK: 16
    });

    await new Promise((resolve) => appServer.listen(0, "127.0.0.1", resolve));
    const port = appServer.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/witness/status`);
      expect(res.status).to.equal(200);
      const data = await res.json();
      expect(data.verified).to.be.true;
      expect(data.latestHeight).to.equal(blockNum);
      expect(data.statusText).to.include("Verified");
    } finally {
      await new Promise((resolve) => appServer.close(resolve));
    }
  });
});
