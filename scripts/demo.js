/**
 * ChainCustody end-to-end demo.   Run:  npx hardhat run scripts/demo.js
 * Uses Hardhat's in-process blockchain, so no wallet, faucet or internet is needed.
 */
const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");
const cc = require("../client/crypto");
const { createStore } = require("../client/storage");

const R = "\x1b[0m", B = "\x1b[1m", G = "\x1b[32m", RD = "\x1b[31m", Y = "\x1b[33m", CY = "\x1b[36m", D = "\x1b[2m";
const step = (n, t) => console.log(`\n${B}${CY}=== Step ${n}: ${t} ===${R}`);
const ok = (t) => console.log(`  ${G}[OK]${R} ${t}`);
const blocked = (t) => console.log(`  ${Y}[BLOCKED]${R} ${t}`);
const alert = (t) => console.log(`  ${RD}[TAMPER DETECTED]${R} ${t}`);
const info = (t) => console.log(`  ${D}${t}${R}`);
const hex = (b) => "0x" + Buffer.from(b).toString("hex");
const short = (a) => a.slice(0, 8) + "..." + a.slice(-4);

function reasonOf(e) {
  const m = /custom error '([^']+)'/.exec(e.message || "");
  if (m) return m[1];
  return (e.shortMessage || e.message || String(e)).split("\n")[0];
}

async function expectRevert(promise, what) {
  try {
    await promise;
    console.log(`  ${RD}[UNEXPECTED]${R} ${what} was allowed (this should not happen)`);
  } catch (e) {
    blocked(`${what} -> reverted with ${reasonOf(e)}`);
  }
}

async function printAudit(contract, id, labels) {
  const names = ["EvidenceRegistered", "AccessGranted", "AccessRevoked", "AccessLogged", "CustodyTransferred"];
  let logs = [];
  for (const n of names) logs.push(...(await contract.queryFilter(contract.filters[n](id))));
  logs.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
  const who = (a) => labels[a.toLowerCase()] || short(a);
  let i = 1;
  for (const l of logs) {
    const a = l.args;
    let text = "";
    switch (l.eventName) {
      case "EvidenceRegistered": text = `evidence registered by ${who(a[3])}  (hash ${a[1].slice(0, 12)}...)`; break;
      case "AccessGranted": text = `${who(a[1])} granted access to ${who(a[2])}`; break;
      case "AccessRevoked": text = `${who(a[1])} revoked access of ${who(a[2])}`; break;
      case "AccessLogged": text = `${who(a[1])} accessed the evidence`; break;
      case "CustodyTransferred": text = `custody transferred ${who(a[1])} -> ${who(a[2])}`; break;
    }
    console.log(`  ${String(i++).padStart(2)}. block ${String(l.blockNumber).padStart(3)}  ${l.eventName.padEnd(19)} ${text}`);
  }
}

async function main() {
  console.log(`${B}ChainCustody - blockchain chain of custody for digital evidence${R}`);
  const [admin, investigator, lab, court, defense, outsider] = await ethers.getSigners();
  const labels = {
    [investigator.address.toLowerCase()]: "Investigator",
    [lab.address.toLowerCase()]: "Lab",
    [court.address.toLowerCase()]: "Court",
    [defense.address.toLowerCase()]: "Defense",
    [outsider.address.toLowerCase()]: "Outsider",
  };
  const store = createStore();

  // ---------------------------------------------------------------- Step 1
  step(1, "Deploy the smart contract and register the parties");
  const contract = await ethers.deployContract("ChainCustody");
  await contract.waitForDeployment();
  info(`contract at ${await contract.getAddress()}`);
  await contract.registerParty(investigator.address, 1);
  await contract.registerParty(lab.address, 2);
  await contract.registerParty(court.address, 3);
  await contract.registerParty(defense.address, 4);
  ok("Investigator, Lab, Court and Defense registered by the admin (Outsider is NOT registered)");

  // each party has its own key pair (public key can be shared, private key never leaves them)
  const keys = { investigator: cc.generateKeyPair(), lab: cc.generateKeyPair(), court: cc.generateKeyPair(), defense: cc.generateKeyPair() };

  // ---------------------------------------------------------------- Step 2
  step(2, "Investigator hashes, encrypts and registers a piece of evidence");
  const plain = fs.readFileSync(path.join(__dirname, "..", "sample", "evidence_report.txt"));
  const fileHash = cc.sha256(plain);
  const aesKey = cc.generateSymmetricKey();
  const encrypted = cc.encryptFile(plain, aesKey);
  const cid = await store.put(encrypted);
  info(`original file : ${plain.length} bytes`);
  info(`SHA-256 hash  : ${fileHash}`);
  info(`encrypted blob: ${encrypted.length} bytes, stored off-chain as ${cid.slice(0, 24)}...`);
  const wrappedForInvestigator = cc.wrapKey(aesKey, keys.investigator.publicKey);
  const tx = await contract.connect(investigator).registerEvidence(fileHash, cid, hex(wrappedForInvestigator));
  const rc = await tx.wait();
  const id = 1n;
  ok(`registered on-chain as evidence #${id}  (gas used: ${rc.gasUsed})`);
  info("On-chain we store only: hash + CID + wrapped key. The file itself never touches the blockchain.");

  // ---------------------------------------------------------------- Step 3
  step(3, "Investigator grants the Lab access");
  await (await contract.connect(investigator).grantAccess(id, lab.address, hex(cc.wrapKey(aesKey, keys.lab.publicKey)))).wait();
  ok("access granted (AES key re-encrypted for the Lab's public key)");

  // ---------------------------------------------------------------- Step 4
  step(4, "Lab retrieves, decrypts and verifies the evidence");
  await (await contract.connect(lab).logAccess(id)).wait();
  const [, storedCid] = await contract.getEvidence(id);
  const wrapped = ethers.getBytes(await contract.getWrappedKey(id, lab.address));
  const labKey = cc.unwrapKey(Buffer.from(wrapped), keys.lab.privateKey);
  const labPlain = cc.decryptFile(await store.get(storedCid), labKey);
  const intact = await contract.verifyIntegrity(id, cc.sha256(labPlain));
  intact ? ok("decrypted file's SHA-256 matches the hash anchored on-chain: INTEGRITY VERIFIED")
         : alert("hash mismatch");
  ok("Lab's access was recorded in the audit log");

  // ---------------------------------------------------------------- Step 5
  step(5, "Unauthorized parties try to get in");
  await expectRevert(contract.connect(defense).logAccess(id), "Defense (registered, but NOT granted access) logging access");
  await expectRevert(contract.connect(outsider).registerEvidence(ethers.id("x"), "sim-x", "0x"), "Outsider registering evidence");
  await expectRevert(contract.connect(lab).grantAccess(id, defense.address, "0x"), "Lab (not the custodian) granting access");
  await expectRevert(contract.connect(investigator).registerEvidence(fileHash, "sim-dup", "0x"), "Registering the same file twice");

  // ---------------------------------------------------------------- Step 6
  step(6, "Tampering attempts on the stored evidence");
  if (!store.tamperFlipBit) {
    info("Skipped: with a real IPFS node, stored content is immutable by design (its CID is its hash).");
    info("Run without STORAGE=ipfs to see the tamper scenarios on the local simulator.");
  } else {
    // 6a: someone modifies the encrypted file in storage
    store.tamperFlipBit(cid);
    try { await store.get(cid); } catch (e) { alert(`6a. storage layer: ${e.message}`); }
    // 6b: a lying storage node skips the CID check, but AES-GCM still notices
    const flipped = fs.readFileSync(store._path(cid));
    try { cc.decryptFile(flipped, aesKey); }
    catch (e) { alert("6b. even if storage lies, the AES-GCM authentication tag fails -> ciphertext was altered"); }
    // 6c: an insider holding the real key substitutes a forged file, correctly encrypted
    const forged = Buffer.from("FORGED REPORT - evidence has been replaced by an insider");
    store.overwrite(cid, cc.encryptFile(forged, aesKey));
    const forgedPlain = cc.decryptFile(fs.readFileSync(store._path(cid)), aesKey); // GCM passes: correct key used
    const passed = await contract.verifyIntegrity(id, cc.sha256(forgedPlain));
    passed ? console.log(`  ${RD}[UNEXPECTED]${R} forged file passed verification`)
           : alert("6c. forged-but-validly-encrypted file: its SHA-256 does NOT match the on-chain hash -> caught by the blockchain");
    info("Three layers: content addressing (storage), authenticated encryption (GCM), on-chain hash (blockchain).");
    info("Only the on-chain hash cannot be silently rewritten by whoever controls the storage or a database.");
  }

  // ---------------------------------------------------------------- Step 7
  step(7, "Revoke the Lab's access");
  await (await contract.connect(investigator).revokeAccess(id, lab.address)).wait();
  ok("access revoked (stored key for the Lab deleted on-chain)");
  await expectRevert(contract.connect(lab).logAccess(id), "Lab logging access after revocation");

  // ---------------------------------------------------------------- Step 8
  step(8, "Transfer custody: Investigator -> Court, then Court grants Defense");
  await (await contract.connect(investigator).transferCustody(id, court.address, hex(cc.wrapKey(aesKey, keys.court.publicKey)))).wait();
  ok("custody transferred to the Court");
  await expectRevert(contract.connect(investigator).grantAccess(id, defense.address, "0x"), "Former custodian granting access");
  await (await contract.connect(court).grantAccess(id, defense.address, hex(cc.wrapKey(aesKey, keys.defense.publicKey)))).wait();
  ok("Court (new custodian) granted the Defense access");

  // ---------------------------------------------------------------- Step 9
  step(9, "Immutable audit trail (read back from blockchain events)");
  await printAudit(contract, id, labels);
  console.log(`\n${B}${G}Demo complete.${R} Every action above is a permanent, independently verifiable record.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
