const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

async function fx() {
  const [owner, w, other] = await ethers.getSigners();
  const W = await ethers.deployContract("CheckpointWitness");
  await W.setWitness(w.address, true);
  return { W, owner, w, other, tag: ethers.id("custody-chain") };
}

describe("CheckpointWitness", () => {
  it("lets only the owner add or remove witnesses", async () => {
    const { W, other } = await loadFixture(fx);
    await expect(W.connect(other).setWitness(other.address, true)).to.be.revertedWithCustomError(W, "NotOwner");
  });

  it("records a checkpoint from a witness and matches it", async () => {
    const { W, w, tag } = await loadFixture(fx);
    const h = ethers.id("block-16");
    await expect(W.connect(w).checkpoint(tag, 16, h)).to.emit(W, "Checkpointed").withArgs(tag, 16, h, w.address);
    expect(await W.latestHeight(tag)).to.equal(16);
    expect(await W.matches(tag, 16, h)).to.equal(true);
    expect(await W.matches(tag, 16, ethers.id("rewritten"))).to.equal(false);
    expect(await W.matches(tag, 32, h)).to.equal(false);
  });

  it("rejects non-witnesses, zero hashes and non-increasing heights", async () => {
    const { W, w, other, tag } = await loadFixture(fx);
    await expect(W.connect(other).checkpoint(tag, 1, ethers.id("x"))).to.be.revertedWithCustomError(W, "NotWitness");
    await expect(W.connect(w).checkpoint(tag, 1, ethers.ZeroHash)).to.be.revertedWithCustomError(W, "InvalidInput");
    await W.connect(w).checkpoint(tag, 10, ethers.id("a"));
    await expect(W.connect(w).checkpoint(tag, 10, ethers.id("b"))).to.be.revertedWithCustomError(W, "StaleCheckpoint");
    await expect(W.connect(w).checkpoint(tag, 9, ethers.id("b"))).to.be.revertedWithCustomError(W, "StaleCheckpoint");
  });

  it("stops accepting a removed witness", async () => {
    const { W, w, tag } = await loadFixture(fx);
    await W.setWitness(w.address, false);
    await expect(W.connect(w).checkpoint(tag, 1, ethers.id("x"))).to.be.revertedWithCustomError(W, "NotWitness");
  });
});
