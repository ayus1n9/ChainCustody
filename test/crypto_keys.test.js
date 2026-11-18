const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const crypto = require("crypto");
const { subtle } = crypto.webcrypto;

const ROLE = { None: 0, Investigator: 1, Lab: 2, Court: 3, Defense: 4 };

async function deployCryptoFixture() {
  const [admin, investigator, lab, court, defense] = await ethers.getSigners();
  const custody = await ethers.deployContract("ChainCustody");
  await custody.waitForDeployment();

  await custody.registerParty(investigator.address, ROLE.Investigator);
  await custody.registerParty(lab.address, ROLE.Lab);

  const hash = ethers.id("evidence-file-test");
  const cid = "sim-cid-test";
  const mockWrappedKey = "0x" + "bb".repeat(64);

  await custody.connect(investigator).registerEvidence(hash, cid, mockWrappedKey);
  await custody.connect(investigator).grantAccess(1, lab.address, mockWrappedKey);

  return { custody, admin, investigator, lab, court, defense, hash, cid };
}

describe("Per-User Browser Encryption Keys & Audit-First Access", () => {
  it("generates 2048-bit RSA-OAEP key pair and exports public key SPKI", async () => {
    const keyPair = await subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256"
      },
      true,
      ["encrypt", "decrypt", "wrapKey", "unwrapKey"]
    );

    expect(keyPair.publicKey).to.exist;
    expect(keyPair.privateKey).to.exist;

    const spki = await subtle.exportKey("spki", keyPair.publicKey);
    expect(spki.byteLength).to.be.greaterThan(200);
  });

  it("publishes public key signed by wallet signer", async () => {
    const [, , lab] = await ethers.getSigners();

    const keyPair = await subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256"
      },
      true,
      ["encrypt", "decrypt", "wrapKey", "unwrapKey"]
    );

    const spki = await subtle.exportKey("spki", keyPair.publicKey);
    const spkiHex = "0x" + Buffer.from(spki).toString("hex");
    const keyDigest = ethers.keccak256(spkiHex);

    const message = `ChainCustody Public Key Registration\nAddress: ${lab.address}\nKeyDigest: ${keyDigest}`;
    const signature = await lab.signMessage(message);

    const recovered = ethers.verifyMessage(message, signature);
    expect(recovered.toLowerCase()).to.equal(lab.address.toLowerCase());
  });

  it("wraps and unwraps AES-256-GCM symmetric key via RSA-OAEP", async () => {
    const keyPair = await subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256"
      },
      true,
      ["encrypt", "decrypt", "wrapKey", "unwrapKey"]
    );

    const aesKey = await subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );

    const wrappedKey = await subtle.wrapKey("raw", aesKey, keyPair.publicKey, {
      name: "RSA-OAEP"
    });
    expect(wrappedKey.byteLength).to.be.greaterThan(0);

    const unwrappedAesKey = await subtle.unwrapKey(
      "raw",
      wrappedKey,
      keyPair.privateKey,
      { name: "RSA-OAEP" },
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );

    expect(unwrappedAesKey).to.exist;

    // Test encryption and decryption with unwrapped key
    const iv = crypto.randomBytes(12);
    const plaintext = Buffer.from("CONFIDENTIAL FORENSIC REPORT DATA");
    const ciphertext = await subtle.encrypt(
      { name: "AES-GCM", iv },
      unwrappedAesKey,
      plaintext
    );

    const decrypted = await subtle.decrypt(
      { name: "AES-GCM", iv },
      unwrappedAesKey,
      ciphertext
    );

    expect(Buffer.from(decrypted).toString()).to.equal("CONFIDENTIAL FORENSIC REPORT DATA");
  });

  it("enforces audit-first rule: must logAccess on contract BEFORE unwrapping key", async () => {
    const { custody, lab } = await loadFixture(deployCryptoFixture);

    // 1. Calling logAccess on contract succeeds and emits AccessLogged
    await expect(custody.connect(lab).logAccess(1))
      .to.emit(custody, "AccessLogged");

    // 2. An unauthorized party is blocked by on-chain AccessDenied before any key unwrapping
    const [, , , , defense] = await ethers.getSigners();
    await expect(custody.connect(defense).logAccess(1))
      .to.be.revertedWithCustomError(custody, "AccessDenied");
  });
});
