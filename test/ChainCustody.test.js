const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

const ROLE = { None: 0, Investigator: 1, Lab: 2, Court: 3, Defense: 4 };
const HASH = ethers.id("evidence-file-1"); // any bytes32
const CID = "sim-abc123";
const KEY = "0x" + "ab".repeat(64); // stand-in for a wrapped AES key

async function deployFixture() {
  const [admin, investigator, lab, court, defense, outsider] = await ethers.getSigners();
  const c = await ethers.deployContract("ChainCustody");
  await c.waitForDeployment();
  await c.registerParty(investigator.address, ROLE.Investigator);
  await c.registerParty(lab.address, ROLE.Lab);
  await c.registerParty(court.address, ROLE.Court);
  await c.registerParty(defense.address, ROLE.Defense);
  return { c, admin, investigator, lab, court, defense, outsider };
}

async function withEvidenceFixture() {
  const f = await deployFixture();
  await f.c.connect(f.investigator).registerEvidence(HASH, CID, KEY);
  return f;
}

describe("ChainCustody", () => {
  describe("party registration", () => {
    it("sets the deployer as admin", async () => {
      const { c, admin } = await loadFixture(deployFixture);
      expect(await c.admin()).to.equal(admin.address);
    });

    it("lets only the admin register parties", async () => {
      const { c, investigator, outsider } = await loadFixture(deployFixture);
      await expect(c.connect(investigator).registerParty(outsider.address, ROLE.Lab))
        .to.be.revertedWithCustomError(c, "NotAdmin");
    });

    it("rejects Role.None and the zero address", async () => {
      const { c, outsider } = await loadFixture(deployFixture);
      await expect(c.registerParty(outsider.address, ROLE.None)).to.be.revertedWithCustomError(c, "InvalidInput");
      await expect(c.registerParty(ethers.ZeroAddress, ROLE.Lab)).to.be.revertedWithCustomError(c, "InvalidInput");
    });

    it("lets the admin deregister parties", async () => {
      const { c, lab } = await loadFixture(deployFixture);
      expect(await c.roleOf(lab.address)).to.equal(ROLE.Lab);
      await expect(c.deregisterParty(lab.address))
        .to.emit(c, "PartyRegistered")
        .withArgs(lab.address, ROLE.None);
      expect(await c.roleOf(lab.address)).to.equal(ROLE.None);
    });

    it("blocks non-admins from deregistering parties", async () => {
      const { c, investigator, lab } = await loadFixture(deployFixture);
      await expect(c.connect(investigator).deregisterParty(lab.address))
        .to.be.revertedWithCustomError(c, "NotAdmin");
    });

    it("rejects deregistering unregistered parties or zero address", async () => {
      const { c, outsider } = await loadFixture(deployFixture);
      await expect(c.deregisterParty(outsider.address)).to.be.revertedWithCustomError(c, "InvalidInput");
      await expect(c.deregisterParty(ethers.ZeroAddress)).to.be.revertedWithCustomError(c, "InvalidInput");
    });
  });

  describe("evidence registration", () => {
    it("lets an investigator register evidence and emits an event", async () => {
      const { c, investigator } = await loadFixture(deployFixture);
      await expect(c.connect(investigator).registerEvidence(HASH, CID, KEY))
        .to.emit(c, "EvidenceRegistered")
        .withArgs(1, HASH, CID, investigator.address, anyValue);
      const [hash, cid, custodian] = await c.getEvidence(1);
      expect(hash).to.equal(HASH);
      expect(cid).to.equal(CID);
      expect(custodian).to.equal(investigator.address);
      expect(await c.hasAccess(1, investigator.address)).to.equal(true);
    });

    it("blocks non-investigators and outsiders", async () => {
      const { c, lab, outsider } = await loadFixture(deployFixture);
      await expect(c.connect(lab).registerEvidence(HASH, CID, KEY)).to.be.revertedWithCustomError(c, "NotAuthorized");
      await expect(c.connect(outsider).registerEvidence(HASH, CID, KEY)).to.be.revertedWithCustomError(c, "NotAuthorized");
    });

    it("rejects the same file hash twice", async () => {
      const { c, investigator } = await loadFixture(withEvidenceFixture);
      await expect(c.connect(investigator).registerEvidence(HASH, "other-cid", KEY))
        .to.be.revertedWithCustomError(c, "AlreadyRegistered");
    });

    it("rejects an empty hash, empty CID, or empty wrappedKey", async () => {
      const { c, investigator } = await loadFixture(deployFixture);
      await expect(c.connect(investigator).registerEvidence(ethers.ZeroHash, CID, KEY)).to.be.revertedWithCustomError(c, "InvalidInput");
      await expect(c.connect(investigator).registerEvidence(HASH, "", KEY)).to.be.revertedWithCustomError(c, "InvalidInput");
      await expect(c.connect(investigator).registerEvidence(HASH, CID, "0x")).to.be.revertedWithCustomError(c, "InvalidInput");
    });
  });

  describe("integrity verification", () => {
    it("returns true for the original hash and false for any other", async () => {
      const { c } = await loadFixture(withEvidenceFixture);
      expect(await c.verifyIntegrity(1, HASH)).to.equal(true);
      expect(await c.verifyIntegrity(1, ethers.id("tampered-file"))).to.equal(false);
    });

    it("reverts for unknown evidence ids", async () => {
      const { c } = await loadFixture(withEvidenceFixture);
      await expect(c.verifyIntegrity(99, HASH)).to.be.revertedWithCustomError(c, "EvidenceNotFound");
      await expect(c.verifyIntegrity(0, HASH)).to.be.revertedWithCustomError(c, "EvidenceNotFound");
    });
  });

  describe("access control", () => {
    it("lets the custodian grant access and the grantee log access", async () => {
      const { c, investigator, lab } = await loadFixture(withEvidenceFixture);
      await expect(c.connect(investigator).grantAccess(1, lab.address, KEY))
        .to.emit(c, "AccessGranted").withArgs(1, investigator.address, lab.address, anyValue);
      expect(await c.getWrappedKey(1, lab.address)).to.equal(KEY);
      await expect(c.connect(lab).logAccess(1)).to.emit(c, "AccessLogged").withArgs(1, lab.address, anyValue);
    });

    it("denies access logging to parties without access", async () => {
      const { c, defense, outsider } = await loadFixture(withEvidenceFixture);
      await expect(c.connect(defense).logAccess(1)).to.be.revertedWithCustomError(c, "AccessDenied");
      await expect(c.connect(outsider).logAccess(1)).to.be.revertedWithCustomError(c, "AccessDenied");
    });

    it("only lets the custodian grant, and only to registered parties", async () => {
      const { c, investigator, lab, defense, outsider } = await loadFixture(withEvidenceFixture);
      await expect(c.connect(lab).grantAccess(1, defense.address, KEY)).to.be.revertedWithCustomError(c, "NotCustodian");
      await expect(c.connect(investigator).grantAccess(1, outsider.address, KEY)).to.be.revertedWithCustomError(c, "PartyNotRegistered");
    });

    it("rejects granting access with empty wrappedKey", async () => {
      const { c, investigator, lab } = await loadFixture(withEvidenceFixture);
      await expect(c.connect(investigator).grantAccess(1, lab.address, "0x")).to.be.revertedWithCustomError(c, "InvalidInput");
    });

    it("reverts access operations on unknown evidence ids", async () => {
      const { c, investigator, lab } = await loadFixture(withEvidenceFixture);
      await expect(c.connect(investigator).grantAccess(99, lab.address, KEY)).to.be.revertedWithCustomError(c, "EvidenceNotFound");
      await expect(c.connect(investigator).grantAccess(0, lab.address, KEY)).to.be.revertedWithCustomError(c, "EvidenceNotFound");
    });

    it("revokes access, wipes the stored key, and keeps the history", async () => {
      const { c, investigator, lab } = await loadFixture(withEvidenceFixture);
      await c.connect(investigator).grantAccess(1, lab.address, KEY);
      await c.connect(lab).logAccess(1);
      await expect(c.connect(investigator).revokeAccess(1, lab.address))
        .to.emit(c, "AccessRevoked").withArgs(1, investigator.address, lab.address, anyValue);
      expect(await c.hasAccess(1, lab.address)).to.equal(false);
      expect(await c.getWrappedKey(1, lab.address)).to.equal("0x");
      await expect(c.connect(lab).logAccess(1)).to.be.revertedWithCustomError(c, "AccessDenied");
      // earlier AccessLogged event is still in the log (immutable audit trail)
      const logs = await c.queryFilter(c.filters.AccessLogged(1));
      expect(logs.length).to.equal(1);
    });

    it("cannot revoke the custodian or someone without access", async () => {
      const { c, investigator, lab } = await loadFixture(withEvidenceFixture);
      await expect(c.connect(investigator).revokeAccess(1, investigator.address)).to.be.revertedWithCustomError(c, "CannotRevokeCustodian");
      await expect(c.connect(investigator).revokeAccess(1, lab.address)).to.be.revertedWithCustomError(c, "NothingToRevoke");
    });
  });

  describe("custody transfer", () => {
    it("moves custody, grants the new custodian access, and emits an event", async () => {
      const { c, investigator, court } = await loadFixture(withEvidenceFixture);
      await expect(c.connect(investigator).transferCustody(1, court.address, KEY))
        .to.emit(c, "CustodyTransferred").withArgs(1, investigator.address, court.address, anyValue);
      const [, , custodian] = await c.getEvidence(1);
      expect(custodian).to.equal(court.address);
      expect(await c.hasAccess(1, court.address)).to.equal(true);
    });

    it("gives the new custodian (and only them) the power to grant", async () => {
      const { c, investigator, court, defense } = await loadFixture(withEvidenceFixture);
      await c.connect(investigator).transferCustody(1, court.address, KEY);
      await expect(c.connect(investigator).grantAccess(1, defense.address, KEY)).to.be.revertedWithCustomError(c, "NotCustodian");
      await expect(c.connect(court).grantAccess(1, defense.address, KEY)).to.emit(c, "AccessGranted");
    });

    it("rejects transfers to unregistered parties, oneself, or with empty wrappedKey", async () => {
      const { c, investigator, outsider, court } = await loadFixture(withEvidenceFixture);
      await expect(c.connect(investigator).transferCustody(1, outsider.address, KEY)).to.be.revertedWithCustomError(c, "PartyNotRegistered");
      await expect(c.connect(investigator).transferCustody(1, investigator.address, KEY)).to.be.revertedWithCustomError(c, "InvalidInput");
      await expect(c.connect(investigator).transferCustody(1, court.address, "0x")).to.be.revertedWithCustomError(c, "InvalidInput");
    });
  });
});

