const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { MerkleTree } = require("../client/merkle");
const { signCustodyHandover } = require("../client/eip712");

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

  describe("multi-party evidence disposal & key shredding", () => {
    it("executes full multi-party disposal workflow (Court proposes -> Custodian confirms)", async () => {
      const { c, investigator, court } = await loadFixture(withEvidenceFixture);
      const expungementReason = "Court Order #2026-EXP-401: Juvenile record expungement decree";

      // Step 1: Court proposes disposal
      await expect(c.connect(court).proposeDisposal(1, expungementReason))
        .to.emit(c, "DisposalProposed")
        .withArgs(1, court.address, expungementReason, anyValue);

      expect(await c.disposalProposer(1)).to.equal(court.address);
      expect(await c.disposalReason(1)).to.equal(expungementReason);

      // Step 2: Custodian confirms disposal
      await expect(c.connect(investigator).confirmDisposal(1))
        .to.emit(c, "EvidenceDisposed")
        .withArgs(1, court.address, investigator.address, expungementReason, anyValue);

      expect(await c.isDisposed(1)).to.equal(true);
      expect(await c.disposalProposer(1)).to.equal(ethers.ZeroAddress);

      // CID and wrapped key are shredded
      const [anchoredHash, cid] = await c.getEvidence(1);
      expect(cid).to.equal("");
      expect(await c.getWrappedKey(1, investigator.address)).to.equal("0x");

      // Historical hash anchor remains provable forever
      expect(await c.verifyIntegrity(1, anchoredHash)).to.equal(true);
    });

    it("rejects proposal from non-court party, empty reason, or duplicate proposals", async () => {
      const { c, investigator, lab, court } = await loadFixture(withEvidenceFixture);
      await expect(c.connect(investigator).proposeDisposal(1, "reason")).to.be.revertedWithCustomError(c, "NotAuthorized");
      await expect(c.connect(lab).proposeDisposal(1, "reason")).to.be.revertedWithCustomError(c, "NotAuthorized");
      await expect(c.connect(court).proposeDisposal(1, "")).to.be.revertedWithCustomError(c, "InvalidInput");

      // Court proposes once
      await c.connect(court).proposeDisposal(1, "Order: Expunge");
      // Duplicate proposal before resolution reverts
      await expect(c.connect(court).proposeDisposal(1, "Another proposal")).to.be.revertedWithCustomError(c, "AlreadyProposed");
    });

    it("rejects confirmation if not proposed or caller is not custodian", async () => {
      const { c, investigator, lab, court } = await loadFixture(withEvidenceFixture);
      // Not proposed yet
      await expect(c.connect(investigator).confirmDisposal(1)).to.be.revertedWithCustomError(c, "DisposalNotProposed");

      await c.connect(court).proposeDisposal(1, "Order: Expunge");

      // Non-custodian confirms
      await expect(c.connect(lab).confirmDisposal(1)).to.be.revertedWithCustomError(c, "NotCustodian");
      await expect(c.connect(court).confirmDisposal(1)).to.be.revertedWithCustomError(c, "NotCustodian");
    });

    it("allows proposer or custodian to cancel pending disposal proposal", async () => {
      const { c, investigator, court, lab } = await loadFixture(withEvidenceFixture);
      // Cancel when none pending
      await expect(c.connect(investigator).cancelDisposal(1)).to.be.revertedWithCustomError(c, "DisposalNotProposed");

      await c.connect(court).proposeDisposal(1, "Expunge order");

      // Unauthorized party cannot cancel
      await expect(c.connect(lab).cancelDisposal(1)).to.be.revertedWithCustomError(c, "NotAuthorized");

      // Proposer cancels
      await expect(c.connect(court).cancelDisposal(1))
        .to.emit(c, "DisposalCancelled")
        .withArgs(1, court.address, anyValue);

      expect(await c.disposalProposer(1)).to.equal(ethers.ZeroAddress);

      // Subsequent confirmation fails
      await expect(c.connect(investigator).confirmDisposal(1)).to.be.revertedWithCustomError(c, "DisposalNotProposed");

      // Custodian can also cancel if re-proposed
      await c.connect(court).proposeDisposal(1, "Expunge order v2");
      await expect(c.connect(investigator).cancelDisposal(1))
        .to.emit(c, "DisposalCancelled")
        .withArgs(1, investigator.address, anyValue);
    });

    it("permanently blocks all operations once evidence is disposed", async () => {
      const { c, investigator, lab, court } = await loadFixture(withEvidenceFixture);
      await c.connect(court).proposeDisposal(1, "Expunge order");
      await c.connect(investigator).confirmDisposal(1);

      // All state operations must revert with EvidenceIsDisposed
      await expect(c.connect(investigator).grantAccess(1, lab.address, KEY)).to.be.revertedWithCustomError(c, "EvidenceIsDisposed");
      await expect(c.connect(investigator).revokeAccess(1, lab.address)).to.be.revertedWithCustomError(c, "EvidenceIsDisposed");
      await expect(c.connect(investigator).transferCustody(1, lab.address, KEY)).to.be.revertedWithCustomError(c, "EvidenceIsDisposed");
      await expect(c.connect(investigator).proposeCustodyTransfer(1, lab.address, KEY)).to.be.revertedWithCustomError(c, "EvidenceIsDisposed");
      await expect(c.connect(lab).acceptCustody(1)).to.be.revertedWithCustomError(c, "EvidenceIsDisposed");
      await expect(c.connect(investigator).logAccess(1)).to.be.revertedWithCustomError(c, "EvidenceIsDisposed");
      await expect(c.connect(court).sealEvidence(1, "reason")).to.be.revertedWithCustomError(c, "EvidenceIsDisposed");
      await expect(c.connect(court).unsealEvidence(1, "reason")).to.be.revertedWithCustomError(c, "EvidenceIsDisposed");
      await expect(c.connect(court).proposeDisposal(1, "reason")).to.be.revertedWithCustomError(c, "EvidenceIsDisposed");
      await expect(c.connect(investigator).confirmDisposal(1)).to.be.revertedWithCustomError(c, "EvidenceIsDisposed");
    });
  });

  describe("forensic hardware provenance & metadata anchoring", () => {
    const meta = {
      deviceSerial: "SAMSUNG-980PRO-NVMe-1TB-S5GANG0N10423",
      acquisitionTool: "FTK Imager v4.7.1.2 (Write-Blocker Hardware Bridged)",
      officerBadge: "DET-7749-CYBER",
      jurisdiction: "US-CA-SFO-CCU"
    };

    it("registers evidence with hardware provenance metadata and emits event", async () => {
      const { c, investigator } = await loadFixture(deployFixture);
      const testHash = ethers.id("disk_image_raw");
      const cid = "ipfs://QmForensicEvidenceBlob123";

      await expect(c.connect(investigator).registerEvidenceWithMetadata(testHash, cid, KEY, meta))
        .to.emit(c, "EvidenceMetadataAnchored")
        .withArgs(1, meta.deviceSerial, meta.acquisitionTool, meta.officerBadge, meta.jurisdiction, anyValue);

      const savedMeta = await c.getForensicMetadata(1);
      expect(savedMeta.deviceSerial).to.equal(meta.deviceSerial);
      expect(savedMeta.acquisitionTool).to.equal(meta.acquisitionTool);
      expect(savedMeta.officerBadge).to.equal(meta.officerBadge);
      expect(savedMeta.jurisdiction).to.equal(meta.jurisdiction);

      const [anchoredHash, savedCid, custodian] = await c.getEvidence(1);
      expect(anchoredHash).to.equal(testHash);
      expect(savedCid).to.equal(cid);
      expect(custodian).to.equal(investigator.address);
    });

    it("rejects metadata registration by non-investigators or duplicates", async () => {
      const { c, lab, court, investigator } = await loadFixture(deployFixture);
      const testHash = ethers.id("sample_evidence");
      await expect(c.connect(lab).registerEvidenceWithMetadata(testHash, "cid", KEY, meta))
        .to.be.revertedWithCustomError(c, "NotAuthorized");
      await expect(c.connect(court).registerEvidenceWithMetadata(testHash, "cid", KEY, meta))
        .to.be.revertedWithCustomError(c, "NotAuthorized");

      await c.connect(investigator).registerEvidenceWithMetadata(testHash, "cid", KEY, meta);
      await expect(c.connect(investigator).registerEvidenceWithMetadata(testHash, "cid2", KEY, meta))
        .to.be.revertedWithCustomError(c, "AlreadyRegistered");
    });

    it("returns default empty strings for evidence registered without metadata", async () => {
      const { c, investigator } = await loadFixture(deployFixture);
      const testHash = ethers.id("raw_file_without_meta");
      await c.connect(investigator).registerEvidence(testHash, "cid", KEY);

      const savedMeta = await c.getForensicMetadata(1);
      expect(savedMeta.deviceSerial).to.equal("");
      expect(savedMeta.acquisitionTool).to.equal("");
      expect(savedMeta.officerBadge).to.equal("");
      expect(savedMeta.jurisdiction).to.equal("");
    });

    it("reverts getForensicMetadata on non-existent evidence id", async () => {
      const { c } = await loadFixture(deployFixture);
      await expect(c.getForensicMetadata(999)).to.be.revertedWithCustomError(c, "EvidenceNotFound");
    });
  });

  describe("time-locked evidentiary hold & statutory retention lock", () => {
    it("places evidentiary hold by Court or Custodian and emits EvidentiaryHoldPlaced", async () => {
      const { c, investigator, court } = await loadFixture(withEvidenceFixture);
      const currentTime = await time.latest();
      const holdTime1 = currentTime + 3600; // 1 hour hold
      const reason1 = "Litigation Hold under FRCP Rule 37(e)";

      // Court places hold
      await expect(c.connect(court).placeEvidentiaryHold(1, holdTime1, reason1))
        .to.emit(c, "EvidentiaryHoldPlaced")
        .withArgs(1, court.address, holdTime1, reason1, anyValue);

      expect(await c.holdUntil(1)).to.equal(holdTime1);
      expect(await c.holdReason(1)).to.equal(reason1);

      // Custodian extends hold further
      const holdTime2 = holdTime1 + 86400; // Extend by 1 day
      const reason2 = "Statutory 7-Year Forensic Retention Requirement";
      await expect(c.connect(investigator).placeEvidentiaryHold(1, holdTime2, reason2))
        .to.emit(c, "EvidentiaryHoldPlaced")
        .withArgs(1, investigator.address, holdTime2, reason2, anyValue);

      expect(await c.holdUntil(1)).to.equal(holdTime2);
      expect(await c.holdReason(1)).to.equal(reason2);
    });

    it("rejects placing hold with invalid duration, empty reason, or unauthorized party", async () => {
      const { c, investigator, lab, court } = await loadFixture(withEvidenceFixture);
      const currentTime = await time.latest();

      // Unauthorized caller (Lab is not court and not custodian)
      await expect(c.connect(lab).placeEvidentiaryHold(1, currentTime + 1000, "reason"))
        .to.be.revertedWithCustomError(c, "NotAuthorized");

      // Past or current timestamp
      await expect(c.connect(court).placeEvidentiaryHold(1, currentTime - 10, "reason"))
        .to.be.revertedWithCustomError(c, "InvalidHoldDuration");
      await expect(c.connect(court).placeEvidentiaryHold(1, currentTime, "reason"))
        .to.be.revertedWithCustomError(c, "InvalidHoldDuration");

      // Empty reason
      await expect(c.connect(court).placeEvidentiaryHold(1, currentTime + 1000, ""))
        .to.be.revertedWithCustomError(c, "InvalidInput");

      // Place initial hold
      await c.connect(court).placeEvidentiaryHold(1, currentTime + 5000, "Initial hold");

      // Shortening or matching existing hold duration reverts
      await expect(c.connect(investigator).placeEvidentiaryHold(1, currentTime + 3000, "Shorter hold"))
        .to.be.revertedWithCustomError(c, "InvalidHoldDuration");
      await expect(c.connect(investigator).placeEvidentiaryHold(1, currentTime + 5000, "Equal hold"))
        .to.be.revertedWithCustomError(c, "InvalidHoldDuration");
    });

    it("prevents proposeDisposal and confirmDisposal while evidentiary hold is active", async () => {
      const { c, investigator, court } = await loadFixture(withEvidenceFixture);
      const currentTime = await time.latest();
      const holdTime = currentTime + 7200;

      await c.connect(court).placeEvidentiaryHold(1, holdTime, "Grand Jury Subpoena Lock");

      // Propose disposal reverts with EvidentiaryHoldActive
      await expect(c.connect(court).proposeDisposal(1, "Premature disposal"))
        .to.be.revertedWithCustomError(c, "EvidentiaryHoldActive")
        .withArgs(holdTime);
    });

    it("allows disposal once evidentiary hold expires", async () => {
      const { c, investigator, court } = await loadFixture(withEvidenceFixture);
      const currentTime = await time.latest();
      const holdTime = currentTime + 3600;

      await c.connect(investigator).placeEvidentiaryHold(1, holdTime, "Short temporary hold");

      // Fast forward EVM time past hold expiration
      await time.increaseTo(holdTime + 1);

      // Now disposal proposal and confirmation succeed
      await expect(c.connect(court).proposeDisposal(1, "Post-hold expungement"))
        .to.emit(c, "DisposalProposed");

      await expect(c.connect(investigator).confirmDisposal(1))
        .to.emit(c, "EvidenceDisposed");

      expect(await c.isDisposed(1)).to.equal(true);
    });

    it("allows Court to release hold early and rejects release from unauthorized parties", async () => {
      const { c, investigator, lab, court } = await loadFixture(withEvidenceFixture);
      const currentTime = await time.latest();
      const holdTime = currentTime + 10000;

      await c.connect(court).placeEvidentiaryHold(1, holdTime, "Court hold");

      // Non-court party cannot release hold
      await expect(c.connect(investigator).releaseEvidentiaryHold(1, "reason"))
        .to.be.revertedWithCustomError(c, "NotAuthorized");
      await expect(c.connect(lab).releaseEvidentiaryHold(1, "reason"))
        .to.be.revertedWithCustomError(c, "NotAuthorized");

      // Empty reason
      await expect(c.connect(court).releaseEvidentiaryHold(1, ""))
        .to.be.revertedWithCustomError(c, "InvalidInput");

      // Court releases hold
      const releaseReason = "Case dismissed with prejudice; evidentiary hold lifted";
      await expect(c.connect(court).releaseEvidentiaryHold(1, releaseReason))
        .to.emit(c, "EvidentiaryHoldReleased")
        .withArgs(1, court.address, releaseReason, anyValue);

      expect(await c.holdUntil(1)).to.equal(0);
      expect(await c.holdReason(1)).to.equal(releaseReason);

      // Releasing when no hold active reverts
      await expect(c.connect(court).releaseEvidentiaryHold(1, "Another release"))
        .to.be.revertedWithCustomError(c, "InvalidInput");
    });
  });

  describe("EIP-712 typed structured data custody signatures & gasless attestation", () => {
    it("executes gasless custody transfer using EIP-712 signature from custodian and emits CustodyTransferredWithSignature", async () => {
      const { c, investigator, lab, outsider } = await loadFixture(withEvidenceFixture);
      const network = await ethers.provider.getNetwork();
      const chainId = network.chainId;
      const contractAddress = await c.getAddress();
      const deadline = (await time.latest()) + 3600;
      const nonce = await c.nonces(1);

      const { signature } = await signCustodyHandover({
        signer: investigator,
        contractAddress,
        chainId,
        evidenceId: 1,
        from: investigator.address,
        to: lab.address,
        wrappedKey: KEY,
        nonce,
        deadline
      });

      // Outsider (unregistered relayer) submits transaction on behalf of investigator
      await expect(c.connect(outsider).transferCustodyWithSignature(1, lab.address, KEY, deadline, signature))
        .to.emit(c, "CustodyTransferred")
        .withArgs(1, investigator.address, lab.address, anyValue)
        .and.to.emit(c, "CustodyTransferredWithSignature")
        .withArgs(1, investigator.address, lab.address, outsider.address, 0, anyValue);

      // Verify state changes
      const [, , newCustodian] = await c.getEvidence(1);
      expect(newCustodian).to.equal(lab.address);
      expect(await c.hasAccess(1, lab.address)).to.equal(true);
      expect(await c.getWrappedKey(1, lab.address)).to.equal(KEY);
      expect(await c.nonces(1)).to.equal(1);
    });

    it("verifies on-chain getHandoverDigest matches client EIP-712 computed digest", async () => {
      const { c, investigator, lab } = await loadFixture(withEvidenceFixture);
      const network = await ethers.provider.getNetwork();
      const chainId = network.chainId;
      const contractAddress = await c.getAddress();
      const deadline = (await time.latest()) + 7200;
      const nonce = await c.nonces(1);
      const wrappedKeyHash = ethers.keccak256(KEY);

      const onChainDigest = await c.getHandoverDigest(1, lab.address, wrappedKeyHash, deadline);

      const { domain, value } = await signCustodyHandover({
        signer: investigator,
        contractAddress,
        chainId,
        evidenceId: 1,
        from: investigator.address,
        to: lab.address,
        wrappedKey: KEY,
        nonce,
        deadline
      });

      const offChainDigest = ethers.TypedDataEncoder.hash(
        domain,
        { CustodyHandover: [
          { name: "evidenceId", type: "uint256" },
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "wrappedKeyHash", type: "bytes32" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]},
        value
      );

      expect(onChainDigest).to.equal(offChainDigest);
    });

    it("rejects transfer when signature deadline has expired", async () => {
      const { c, investigator, lab, outsider } = await loadFixture(withEvidenceFixture);
      const network = await ethers.provider.getNetwork();
      const chainId = network.chainId;
      const contractAddress = await c.getAddress();
      const deadline = (await time.latest()) + 100;
      const nonce = await c.nonces(1);

      const { signature } = await signCustodyHandover({
        signer: investigator,
        contractAddress,
        chainId,
        evidenceId: 1,
        from: investigator.address,
        to: lab.address,
        wrappedKey: KEY,
        nonce,
        deadline
      });

      // Advance time past deadline
      await time.increaseTo(deadline + 1);

      await expect(c.connect(outsider).transferCustodyWithSignature(1, lab.address, KEY, deadline, signature))
        .to.be.revertedWithCustomError(c, "SignatureExpired");
    });

    it("rejects signature signed by a non-custodian or with mismatched parameters", async () => {
      const { c, investigator, lab, court, defense, outsider } = await loadFixture(withEvidenceFixture);
      const network = await ethers.provider.getNetwork();
      const chainId = network.chainId;
      const contractAddress = await c.getAddress();
      const deadline = (await time.latest()) + 3600;
      const nonce = await c.nonces(1);

      // Signed by court instead of current custodian (investigator)
      const { signature: badSig } = await signCustodyHandover({
        signer: court,
        contractAddress,
        chainId,
        evidenceId: 1,
        from: investigator.address,
        to: lab.address,
        wrappedKey: KEY,
        nonce,
        deadline
      });

      await expect(c.connect(outsider).transferCustodyWithSignature(1, lab.address, KEY, deadline, badSig))
        .to.be.revertedWithCustomError(c, "InvalidSignature");

      // Valid signature from investigator for Lab, but relayer tries to send to Defense
      const { signature: validSigForLab } = await signCustodyHandover({
        signer: investigator,
        contractAddress,
        chainId,
        evidenceId: 1,
        from: investigator.address,
        to: lab.address,
        wrappedKey: KEY,
        nonce,
        deadline
      });

      await expect(c.connect(outsider).transferCustodyWithSignature(1, defense.address, KEY, deadline, validSigForLab))
        .to.be.revertedWithCustomError(c, "InvalidSignature");

      // Invalid signature length
      await expect(c.connect(outsider).transferCustodyWithSignature(1, lab.address, KEY, deadline, "0x1234"))
        .to.be.revertedWithCustomError(c, "InvalidSignature");
    });

    it("prevents replay attack using the same signature twice", async () => {
      const { c, investigator, lab, court, outsider } = await loadFixture(withEvidenceFixture);
      const network = await ethers.provider.getNetwork();
      const chainId = network.chainId;
      const contractAddress = await c.getAddress();
      const deadline = (await time.latest()) + 3600;
      const nonce = await c.nonces(1);

      const { signature } = await signCustodyHandover({
        signer: investigator,
        contractAddress,
        chainId,
        evidenceId: 1,
        from: investigator.address,
        to: lab.address,
        wrappedKey: KEY,
        nonce,
        deadline
      });

      // First execution succeeds: Investigator -> Lab
      await c.connect(outsider).transferCustodyWithSignature(1, lab.address, KEY, deadline, signature);

      // Immediate replay fails because target is already current custodian
      await expect(c.connect(outsider).transferCustodyWithSignature(1, lab.address, KEY, deadline, signature))
        .to.be.revertedWithCustomError(c, "InvalidInput");

      // Lab transfers custody to Court
      await c.connect(lab).transferCustody(1, court.address, KEY);

      // Replay attempt fails because nonce incremented and original signer is no longer custodian
      await expect(c.connect(outsider).transferCustodyWithSignature(1, lab.address, KEY, deadline, signature))
        .to.be.revertedWithCustomError(c, "InvalidSignature");
    });

    it("rejects transfer with signature when sealed, disposed, or invalid recipient", async () => {
      const { c, investigator, lab, court, outsider } = await loadFixture(withEvidenceFixture);
      const network = await ethers.provider.getNetwork();
      const chainId = network.chainId;
      const contractAddress = await c.getAddress();
      const deadline = (await time.latest()) + 3600;

      const { signature } = await signCustodyHandover({
        signer: investigator,
        contractAddress,
        chainId,
        evidenceId: 1,
        from: investigator.address,
        to: lab.address,
        wrappedKey: KEY,
        nonce: 0,
        deadline
      });

      // Transfer to self
      await expect(c.transferCustodyWithSignature(1, investigator.address, KEY, deadline, signature))
        .to.be.revertedWithCustomError(c, "InvalidInput");

      // Transfer to unregistered party
      await expect(c.transferCustodyWithSignature(1, outsider.address, KEY, deadline, signature))
        .to.be.revertedWithCustomError(c, "InvalidInput");

      // Empty wrapped key
      await expect(c.transferCustodyWithSignature(1, lab.address, "0x", deadline, signature))
        .to.be.revertedWithCustomError(c, "InvalidInput");

      // Sealed evidence
      await c.connect(court).sealEvidence(1, "Judicial freeze");
      await expect(c.transferCustodyWithSignature(1, lab.address, KEY, deadline, signature))
        .to.be.revertedWithCustomError(c, "EvidenceIsSealed");
    });

    it("rejects malleable high-s signature or invalid v", async () => {
      const { c, investigator, lab, outsider } = await loadFixture(withEvidenceFixture);
      const network = await ethers.provider.getNetwork();
      const chainId = network.chainId;
      const contractAddress = await c.getAddress();
      const deadline = (await time.latest()) + 3600;
      const nonce = await c.nonces(1);

      const { signature } = await signCustodyHandover({
        signer: investigator,
        contractAddress,
        chainId,
        evidenceId: 1,
        from: investigator.address,
        to: lab.address,
        wrappedKey: KEY,
        nonce,
        deadline
      });

      const r = signature.slice(0, 66);
      const s = "0x" + signature.slice(66, 130);
      const v = parseInt(signature.slice(130, 132), 16);

      const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
      const sBig = BigInt(s);
      const highS = (N - sBig).toString(16).padStart(64, "0");
      const highV = (v === 27 ? 28 : 27).toString(16).padStart(2, "0");
      const malleableSig = r + highS + highV;

      await expect(c.connect(outsider).transferCustodyWithSignature(1, lab.address, KEY, deadline, malleableSig))
        .to.be.revertedWithCustomError(c, "InvalidSignature");

      // Invalid v (not 27 or 28)
      const invalidVSig = r + signature.slice(66, 130) + "1a"; // v = 26
      await expect(c.connect(outsider).transferCustodyWithSignature(1, lab.address, KEY, deadline, invalidVSig))
        .to.be.revertedWithCustomError(c, "InvalidSignature");
    });
  });
});




