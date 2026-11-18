const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const ROLE = { None: 0, Investigator: 1, Lab: 2, Court: 3, Defense: 4 };

async function deployCouncilFixture() {
  const [admin, member1, member2, member3, outsider, partyA, partyB] = await ethers.getSigners();
  const members = [member1.address, member2.address, member3.address];
  const threshold = 2; // 2-of-3

  const council = await ethers.deployContract("RoleCouncil", [members, threshold, ethers.ZeroAddress]);
  await council.waitForDeployment();

  const custodyAddress = await council.custody();
  const custody = await ethers.getContractAt("ChainCustody", custodyAddress);

  return { council, custody, admin, member1, member2, member3, outsider, partyA, partyB, members, threshold };
}

describe("RoleCouncil (Two-Person Admin Rule)", () => {
  describe("initialization & validation", () => {
    it("deploys with correct members, threshold and sets itself as custody admin", async () => {
      const { council, custody, member1, member2, member3, members } = await loadFixture(deployCouncilFixture);
      expect(await council.m()).to.equal(2);
      expect(await council.n()).to.equal(3);
      expect(await council.getMembers()).to.deep.equal(members);
      expect(await council.isMember(member1.address)).to.be.true;
      expect(await council.isMember(member2.address)).to.be.true;
      expect(await council.isMember(member3.address)).to.be.true;
      expect(await custody.admin()).to.equal(await council.getAddress());
    });

    it("rejects zero threshold or threshold greater than members", async () => {
      const [, m1, m2] = await ethers.getSigners();
      const factory = await ethers.getContractFactory("RoleCouncil");
      await expect(factory.deploy([m1.address, m2.address], 0, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(factory, "InvalidThreshold");
      await expect(factory.deploy([m1.address, m2.address], 3, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(factory, "InvalidThreshold");
    });

    it("rejects zero address members or duplicates", async () => {
      const [, m1, m2] = await ethers.getSigners();
      const factory = await ethers.getContractFactory("RoleCouncil");
      await expect(factory.deploy([m1.address, ethers.ZeroAddress], 1, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(factory, "InvalidMember");
      await expect(factory.deploy([m1.address, m1.address], 1, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(factory, "DuplicateMember");
    });
  });

  describe("proposals & execution", () => {
    it("1 member cannot grant role unilaterally", async () => {
      const { council, custody, member1, partyA } = await loadFixture(deployCouncilFixture);

      // Member1 proposes to register partyA as Investigator
      const tx = await council.connect(member1).proposeRegisterParty(partyA.address, ROLE.Investigator);
      await expect(tx)
        .to.emit(council, "ProposalCreated")
        .withArgs(1, 0, partyA.address, ROLE.Investigator, member1.address, (await time.latest()) + 7 * 86400);

      // Proposer automatically approved, but threshold is 2
      const prop = await council.getProposal(1);
      expect(prop.approvalCount).to.equal(1);
      expect(await council.hasApproved(1, member1.address)).to.be.true;

      // Single member attempts to execute -> rejected
      await expect(council.connect(member1).execute(1))
        .to.be.revertedWithCustomError(council, "ProposalNotApproved");

      // Verify partyA has NOT been granted the role
      expect(await custody.roleOf(partyA.address)).to.equal(ROLE.None);
    });

    it("M approvals can execute and register the party", async () => {
      const { council, custody, member1, member2, partyA } = await loadFixture(deployCouncilFixture);

      await council.connect(member1).proposeRegisterParty(partyA.address, ROLE.Investigator);

      // Member 2 approves
      await expect(council.connect(member2).approve(1))
        .to.emit(council, "ProposalApproved")
        .withArgs(1, member2.address);

      // Now execution succeeds
      await expect(council.connect(member1).execute(1))
        .to.emit(council, "ProposalExecuted")
        .withArgs(1);

      // Verify on-chain role is assigned
      expect(await custody.roleOf(partyA.address)).to.equal(ROLE.Investigator);

      // Proposal marked as executed
      const prop = await council.getProposal(1);
      expect(prop.executed).to.be.true;
    });

    it("supports deregistration proposal through M approvals", async () => {
      const { council, custody, member1, member2, partyA } = await loadFixture(deployCouncilFixture);

      // Register first
      await council.connect(member1).proposeRegisterParty(partyA.address, ROLE.Lab);
      await council.connect(member2).approve(1);
      await council.connect(member1).execute(1);
      expect(await custody.roleOf(partyA.address)).to.equal(ROLE.Lab);

      // Propose deregistration
      await council.connect(member1).proposeDeregisterParty(partyA.address);
      await council.connect(member2).approve(2);
      await council.connect(member2).execute(2);

      // Verified deregistered
      expect(await custody.roleOf(partyA.address)).to.equal(ROLE.None);
    });

    it("member cannot double-approve the same proposal", async () => {
      const { council, member1 } = await loadFixture(deployCouncilFixture);
      await council.connect(member1).proposeRegisterParty(ethers.Wallet.createRandom().address, ROLE.Court);

      // Member 1 already approved during creation; attempting to approve again reverts
      await expect(council.connect(member1).approve(1))
        .to.be.revertedWithCustomError(council, "AlreadyApproved");
    });

    it("expired proposal cannot run (reverts ProposalHasExpired and emits ProposalExpired)", async () => {
      const { council, member1, member2, partyA } = await loadFixture(deployCouncilFixture);
      await council.connect(member1).proposeRegisterParty(partyA.address, ROLE.Investigator);
      await council.connect(member2).approve(1);

      // Fast-forward time past 7 days
      await time.increase(7 * 24 * 3600 + 10);

      expect(await council.isExpired(1)).to.be.true;

      // Approval after expiry reverts
      const [, , , member3] = await ethers.getSigners();
      await expect(council.connect(member3).approve(1))
        .to.be.revertedWithCustomError(council, "ProposalHasExpired");

      // Expire call emits ProposalExpired
      await expect(council.expire(1))
        .to.emit(council, "ProposalExpired")
        .withArgs(1);

      // Execution after expiry reverts with ProposalHasExpired
      await expect(council.connect(member1).execute(1))
        .to.be.revertedWithCustomError(council, "ProposalHasExpired");
    });

    it("replay of CURRENT PROBLEMS ('admin grants itself Investigator') fails", async () => {
      const { council, custody, admin, member1, outsider } = await loadFixture(deployCouncilFixture);

      // 1. Direct call to custody contract by original deployer or outsider fails
      await expect(custody.connect(admin).registerParty(admin.address, ROLE.Investigator))
        .to.be.revertedWithCustomError(custody, "NotAdmin");

      // 2. Outsider cannot propose on council
      await expect(council.connect(outsider).proposeRegisterParty(outsider.address, ROLE.Investigator))
        .to.be.revertedWithCustomError(council, "NotCouncilMember");

      // 3. A rogue council member proposing to grant itself a role cannot execute alone
      await council.connect(member1).proposeRegisterParty(member1.address, ROLE.Investigator);
      await expect(council.connect(member1).execute(1))
        .to.be.revertedWithCustomError(council, "ProposalNotApproved");

      // Role is still None
      expect(await custody.roleOf(member1.address)).to.equal(ROLE.None);
    });

    it("rejects operations on non-existent or already-executed proposals", async () => {
      const { council, member1, member2, partyA } = await loadFixture(deployCouncilFixture);
      await expect(council.connect(member1).approve(99))
        .to.be.revertedWithCustomError(council, "ProposalNotFound");
      await expect(council.connect(member1).execute(99))
        .to.be.revertedWithCustomError(council, "ProposalNotFound");

      await council.connect(member1).proposeRegisterParty(partyA.address, ROLE.Defense);
      await council.connect(member2).approve(1);
      await council.connect(member1).execute(1);

      // Cannot execute again
      await expect(council.connect(member1).execute(1))
        .to.be.revertedWithCustomError(council, "ProposalAlreadyExecuted");

      // Cannot approve already executed
      const [, , , member3] = await ethers.getSigners();
      await expect(council.connect(member3).approve(1))
        .to.be.revertedWithCustomError(council, "ProposalAlreadyExecuted");
    });
  });
});
