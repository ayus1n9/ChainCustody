const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { MerkleTree } = require("../client/merkle");

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

    it("executes 2-step custody handover (propose -> accept)", async () => {
      const { c, investigator, court, lab } = await loadFixture(withEvidenceFixture);
      // Step 1: propose
      await expect(c.connect(investigator).proposeCustodyTransfer(1, court.address, KEY))
        .to.emit(c, "CustodyTransferProposed")
        .withArgs(1, investigator.address, court.address, anyValue);
      expect(await c.proposedCustodianOf(1)).to.equal(court.address);

      // Wrong party cannot accept
      await expect(c.connect(lab).acceptCustody(1)).to.be.revertedWithCustomError(c, "NotProposedCustodian");

      // Step 2: proposed custodian accepts
      await expect(c.connect(court).acceptCustody(1))
        .to.emit(c, "CustodyTransferred")
        .withArgs(1, investigator.address, court.address, anyValue);

      const [, , custodian] = await c.getEvidence(1);
      expect(custodian).to.equal(court.address);
      expect(await c.hasAccess(1, court.address)).to.equal(true);
      expect(await c.getWrappedKey(1, court.address)).to.equal(KEY);
      expect(await c.proposedCustodianOf(1)).to.equal(ethers.ZeroAddress);
    });

    it("allows custodian to cancel pending custody transfer proposal", async () => {
      const { c, investigator, court } = await loadFixture(withEvidenceFixture);
      await c.connect(investigator).proposeCustodyTransfer(1, court.address, KEY);
      await expect(c.connect(investigator).cancelCustodyTransfer(1))
        .to.emit(c, "CustodyTransferCancelled")
        .withArgs(1, investigator.address, court.address, anyValue);
      expect(await c.proposedCustodianOf(1)).to.equal(ethers.ZeroAddress);

      // Trying to accept after cancellation reverts
      await expect(c.connect(court).acceptCustody(1)).to.be.revertedWithCustomError(c, "NotProposedCustodian");

      // Canceling when none pending reverts
      await expect(c.connect(investigator).cancelCustodyTransfer(1)).to.be.revertedWithCustomError(c, "NoTransferPending");
    });

    it("rejects invalid proposeCustodyTransfer calls", async () => {
      const { c, investigator, outsider, court, lab } = await loadFixture(withEvidenceFixture);
      // Non-custodian proposing reverts
      await expect(c.connect(lab).proposeCustodyTransfer(1, court.address, KEY)).to.be.revertedWithCustomError(c, "NotCustodian");
      // Proposing to unregistered party
      await expect(c.connect(investigator).proposeCustodyTransfer(1, outsider.address, KEY)).to.be.revertedWithCustomError(c, "PartyNotRegistered");
      // Proposing to oneself
      await expect(c.connect(investigator).proposeCustodyTransfer(1, investigator.address, KEY)).to.be.revertedWithCustomError(c, "InvalidInput");
      // Proposing with empty wrappedKey
      await expect(c.connect(investigator).proposeCustodyTransfer(1, court.address, "0x")).to.be.revertedWithCustomError(c, "InvalidInput");
    });
  });

  describe("merkle batch inclusion", () => {
    it("verifies inclusion of individual files in a bulk evidence dossier", async () => {
      const { c, investigator } = await loadFixture(deployFixture);
      const files = [
        Buffer.from("file_001_cctv.mp4"),
        Buffer.from("file_002_chat_log.db"),
        Buffer.from("file_003_disk_dump.raw"),
        Buffer.from("file_004_photo.jpg"),
      ];
      const tree = new MerkleTree(files);
      const root = tree.getRoot();

      await c.connect(investigator).registerEvidence(root, "cid-dossier", KEY);

      for (let i = 0; i < files.length; i++) {
        const proof = tree.getProof(i);
        const leafHash = tree.getLeaf(i);
        expect(await c.verifyBatchInclusion(1, leafHash, proof)).to.equal(true);
      }
    });

    it("rejects altered files or invalid proofs for batch dossiers", async () => {
      const { c, investigator } = await loadFixture(deployFixture);
      const files = [Buffer.from("file_A"), Buffer.from("file_B"), Buffer.from("file_C")];
      const tree = new MerkleTree(files);
      const root = tree.getRoot();

      await c.connect(investigator).registerEvidence(root, "cid-dossier", KEY);

      const validProof0 = tree.getProof(0);
      const fakeHash = ethers.id("fake_file");
      expect(await c.verifyBatchInclusion(1, fakeHash, validProof0)).to.equal(false);
      expect(await c.verifyBatchInclusion(1, tree.getLeaf(0), [ethers.ZeroHash])).to.equal(false);
    });

    it("reverts batch verification on non-existent evidence", async () => {
      const { c } = await loadFixture(deployFixture);
      await expect(c.verifyBatchInclusion(999, ethers.ZeroHash, [])).to.be.revertedWithCustomError(c, "EvidenceNotFound");
    });
  });

  describe("judicial evidence sealing", () => {
    it("allows Court to seal evidence with reason and emits EvidenceSealed", async () => {
      const { c, court } = await loadFixture(withEvidenceFixture);
      const reason = "Order 2026-CR-8921: Impound pending judicial inquiry";

      await expect(c.connect(court).sealEvidence(1, reason))
        .to.emit(c, "EvidenceSealed")
        .withArgs(1, court.address, reason, anyValue);

      expect(await c.isSealed(1)).to.equal(true);
      expect(await c.sealReason(1)).to.equal(reason);
    });

    it("rejects sealing by non-court parties or with empty reason", async () => {
      const { c, investigator, admin, outsider, court } = await loadFixture(withEvidenceFixture);
      await expect(c.connect(investigator).sealEvidence(1, "reason")).to.be.revertedWithCustomError(c, "NotAuthorized");
      await expect(c.connect(admin).sealEvidence(1, "reason")).to.be.revertedWithCustomError(c, "NotAuthorized");
      await expect(c.connect(outsider).sealEvidence(1, "reason")).to.be.revertedWithCustomError(c, "NotAuthorized");

      await expect(c.connect(court).sealEvidence(1, "")).to.be.revertedWithCustomError(c, "InvalidInput");
      await expect(c.connect(court).sealEvidence(999, "reason")).to.be.revertedWithCustomError(c, "EvidenceNotFound");
    });

    it("prevents double-sealing already sealed evidence", async () => {
      const { c, court } = await loadFixture(withEvidenceFixture);
      await c.connect(court).sealEvidence(1, "First seal order");
      await expect(c.connect(court).sealEvidence(1, "Second seal order")).to.be.revertedWithCustomError(c, "EvidenceIsSealed");
    });

    it("blocks custody transfers and access modifications when sealed", async () => {
      const { c, investigator, lab, court } = await loadFixture(withEvidenceFixture);

      // Pre-propose transfer before seal
      await c.connect(investigator).proposeCustodyTransfer(1, lab.address, KEY);

      // Court seals evidence
      await c.connect(court).sealEvidence(1, "Order: Evidence frozen");

      // All modifying operations must revert with EvidenceIsSealed
      await expect(c.connect(investigator).grantAccess(1, lab.address, KEY)).to.be.revertedWithCustomError(c, "EvidenceIsSealed");
      await expect(c.connect(investigator).revokeAccess(1, investigator.address)).to.be.revertedWithCustomError(c, "EvidenceIsSealed");
      await expect(c.connect(investigator).transferCustody(1, lab.address, KEY)).to.be.revertedWithCustomError(c, "EvidenceIsSealed");
      await expect(c.connect(investigator).proposeCustodyTransfer(1, lab.address, KEY)).to.be.revertedWithCustomError(c, "EvidenceIsSealed");
      await expect(c.connect(lab).acceptCustody(1)).to.be.revertedWithCustomError(c, "EvidenceIsSealed");
    });

    it("allows Court to unseal evidence, restoring modification capability", async () => {
      const { c, investigator, lab, court } = await loadFixture(withEvidenceFixture);
      await c.connect(court).sealEvidence(1, "Sealed pending trial");
      expect(await c.isSealed(1)).to.equal(true);

      // Unseal
      const unsealReason = "Order: Trial concluded; evidence released for archive";
      await expect(c.connect(court).unsealEvidence(1, unsealReason))
        .to.emit(c, "EvidenceUnsealed")
        .withArgs(1, court.address, unsealReason, anyValue);

      expect(await c.isSealed(1)).to.equal(false);
      expect(await c.sealReason(1)).to.equal(unsealReason);

      // Modifications work again
      await expect(c.connect(investigator).grantAccess(1, lab.address, KEY)).to.emit(c, "AccessGranted");
    });

    it("rejects unsealing if not sealed or if caller is not Court", async () => {
      const { c, court, investigator } = await loadFixture(withEvidenceFixture);
      // Not sealed
      await expect(c.connect(court).unsealEvidence(1, "reason")).to.be.revertedWithCustomError(c, "EvidenceNotSealed");

      // Seal it first
      await c.connect(court).sealEvidence(1, "reason");

      // Non-court caller
      await expect(c.connect(investigator).unsealEvidence(1, "reason")).to.be.revertedWithCustomError(c, "NotAuthorized");

      // Empty reason
      await expect(c.connect(court).unsealEvidence(1, "")).to.be.revertedWithCustomError(c, "InvalidInput");
    });
  });
});


