/**
 * Replays tamper scenarios S1-S5 against the ChainCustody contract on Hardhat.
 * Run: RUNS=1000 npx hardhat --config hardhat.local.config.js run paper_eval/replay_scenarios.js
 * Writes paper_eval/replay_results.json
 *
 * Attacker model: the strongest insider. The attacker is the contract admin, controls the
 * off-chain store, and holds the file's AES key. S4/S5 add control of the only chain node
 * (Hardhat's single in-process node), which can rewrite history with evm_snapshot/evm_revert.
 * The verifier runs Algorithm 2: CID check -> AES-GCM tag -> on-chain hash (verifyIntegrity).
 */
const hre = require("hardhat");
const { ethers, network } = hre;
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const cc = require("../client/crypto");
const { LocalContentStore } = require("../client/storage");

const RUNS = Number(process.env.RUNS || 1000);
const FILE_BYTES = 4096; // same evidence size as the Python baseline's rnd()
const hex = (b) => "0x" + Buffer.from(b).toString("hex");

// Algorithm 2 on the verifier's side. Returns {detected, layer}.
async function verify(contract, store, id, privKey, party, { trustStorage = false } = {}) {
  const [, cid] = await contract.getEvidence(id);
  const wrapped = ethers.getBytes(await contract.getWrappedKey(id, party));
  const key = cc.unwrapKey(Buffer.from(wrapped), privKey);
  let blob;
  try {
    // trustStorage = a lying storage node that skips the CID check
    blob = trustStorage ? fs.readFileSync(store._path(cid)) : await store.get(cid);
  } catch (e) {
    return { detected: true, layer: "CID" };
  }
  let plain;
  try {
    plain = cc.decryptFile(blob, key);
  } catch (e) {
    return { detected: true, layer: "GCM" };
  }
  const ok = await contract.verifyIntegrity(id, cc.sha256(plain));
  return ok ? { detected: false, layer: null } : { detected: true, layer: "hash" };
}

function tally() {
  return { runs: 0, detected: 0, byLayer: {} };
}
function add(t, r) {
  t.runs++;
  if (r.detected) {
    t.detected++;
    t.byLayer[r.layer] = (t.byLayer[r.layer] || 0) + 1;
  }
}

async function main() {
  const [admin, inv, lab] = await ethers.getSigners();
  const store = new LocalContentStore(fs.mkdtempSync(path.join(os.tmpdir(), "cc-replay-")));
  const kInv = cc.generateKeyPair();
  const kLab = cc.generateKeyPair();
  const kAdmin = cc.generateKeyPair();

  const contract = await ethers.deployContract("ChainCustody");
  await contract.waitForDeployment();
  await (await contract.registerParty(inv.address, 1)).wait();
  await (await contract.registerParty(lab.address, 2)).wait();

  // one legitimate registration + grant + access; returns everything a run needs
  async function legit(c, fileBuf) {
    const h = cc.sha256(fileBuf);
    const K = cc.generateSymmetricKey();
    const cid = await store.put(cc.encryptFile(fileBuf, K));
    await (await c.connect(inv).registerEvidence(h, cid, hex(cc.wrapKey(K, kInv.publicKey)))).wait();
    const id = await c.evidenceCount();
    await (await c.connect(inv).grantAccess(id, lab.address, hex(cc.wrapKey(K, kLab.publicKey)))).wait();
    await (await c.connect(lab).logAccess(id)).wait();
    return { id, h, K, cid };
  }

  const res = {
    S1: tally(), S1_lyingStorage: tally(), S2: tally(), S2_anchorChanged: 0, S2_adminForgedNewItems: 0,
    S3: tally(), S4: tally(), S4_chainConsistent: 0, S5: tally(),
  };

  // ---------------- S1: evidence file altered in storage (one byte appended)
  for (let r = 0; r < RUNS; r++) {
    const { id, cid } = await legit(contract, crypto.randomBytes(FILE_BYTES));
    const p = store._path(cid);
    fs.appendFileSync(p, Buffer.from("x"));
    add(res.S1, await verify(contract, store, id, kLab.privateKey, lab.address));
    add(res.S1_lyingStorage, await verify(contract, store, id, kLab.privateKey, lab.address, { trustStorage: true }));
  }

  // ---------------- S2: insider replaces the file AND tries to replace the anchored hash
  // Holds K, controls storage (serves the forged blob under the original CID, skipping the CID
  // check), and is admin: grants itself Investigator and registers the forged file. There is no
  // function that rewrites the hash of an existing id, so that is all the admin can do on-chain.
  await (await contract.registerParty(admin.address, 1)).wait(); // admin abuses its role power
  for (let r = 0; r < RUNS; r++) {
    const orig = crypto.randomBytes(FILE_BYTES);
    const { id, h, K, cid } = await legit(contract, orig);
    const forged = crypto.randomBytes(FILE_BYTES);
    const forgedHash = cc.sha256(forged);
    store.overwrite(cid, cc.encryptFile(forged, K)); // valid GCM under the real key
    await (await contract.connect(admin).registerEvidence(forgedHash, "sim-forged-" + r, hex(cc.wrapKey(K, kAdmin.publicKey)))).wait();
    res.S2_adminForgedNewItems++;
    const [anchored] = await contract.getEvidence(id);
    if (anchored !== h) res.S2_anchorChanged++;
    add(res.S2, await verify(contract, store, id, kLab.privateKey, lab.address, { trustStorage: true }));
  }
  await (await contract.deregisterParty(admin.address)).wait();

  // ---------------- S3: admin deletes an audit record
  // The admin keeps an off-chain mirror of the events (as a records database would) and deletes
  // the AccessLogged row; it also de-registers the party to hide it. The verifier re-reads the
  // events from the chain and compares them with the mirror.
  for (let r = 0; r < RUNS; r++) {
    const { id } = await legit(contract, crypto.randomBytes(FILE_BYTES));
    const mirror = (await contract.queryFilter(contract.filters.AccessLogged(id))).map((e) => e.transactionHash);
    mirror.pop(); // delete the audit record in the admin's copy
    const chainLog = (await contract.queryFilter(contract.filters.AccessLogged(id))).map((e) => e.transactionHash);
    const missing = chainLog.filter((t) => !mirror.includes(t));
    add(res.S3, missing.length > 0 ? { detected: true, layer: "event log" } : { detected: false, layer: null });
  }
  // de-register / re-register once to show events survive role changes
  await (await contract.deregisterParty(lab.address)).wait();
  const survived = (await contract.queryFilter(contract.filters.AccessLogged())).length;
  await (await contract.registerParty(lab.address, 2)).wait();

  // ---------------- S4 / S5: the only node operator rewrites the chain
  // Snapshot, write the legitimate history, record the head hash (S5's second party keeps it),
  // revert to the snapshot and write a forged history with the same number of blocks.
  async function walkChainConsistent(fromBlock, toBlock) {
    let prev = await ethers.provider.getBlock(fromBlock - 1);
    for (let b = fromBlock; b <= toBlock; b++) {
      const blk = await ethers.provider.getBlock(b);
      if (blk.parentHash !== prev.hash) return false;
      prev = blk;
    }
    return true;
  }
  for (let r = 0; r < RUNS; r++) {
    const snap = await network.provider.send("evm_snapshot", []);
    const start = (await ethers.provider.getBlockNumber()) + 1;
    const orig = crypto.randomBytes(FILE_BYTES);
    const { id } = await legit(contract, orig);
    const headNum = await ethers.provider.getBlockNumber();
    const anchoredHead = (await ethers.provider.getBlock(headNum)).hash; // held by a 2nd party in S5

    await network.provider.send("evm_revert", [snap]); // operator discards the real history
    const forged = crypto.randomBytes(FILE_BYTES);
    const f = await legit(contract, forged); // forged history, same heights, same id
    const newHead = await ethers.provider.getBlockNumber();

    // S4 verifier: only the chain itself. Links are consistent and the forged file verifies.
    const consistent = newHead === headNum && (await walkChainConsistent(start, newHead));
    if (consistent) res.S4_chainConsistent++;
    const forgedPasses = f.id === id && (await contract.verifyIntegrity(id, cc.sha256(forged)));
    add(res.S4, consistent && forgedPasses ? { detected: false, layer: null } : { detected: true, layer: "chain check" });

    // S5 verifier: compares the head hash the second party kept with the chain at that height.
    const nowAtHeight = (await ethers.provider.getBlock(headNum)).hash;
    add(res.S5, nowAtHeight !== anchoredHead ? { detected: true, layer: "anchored head hash" } : { detected: false, layer: null });
  }

  const rate = (t) => t.detected / t.runs;
  const out = {
    runs: RUNS,
    fileBytes: FILE_BYTES,
    attacker: "contract admin + storage operator + holder of AES key; S4/S5 also the only node",
    detectionRate: { S1: rate(res.S1), S1_lyingStorage: rate(res.S1_lyingStorage), S2: rate(res.S2), S3: rate(res.S3), S4: rate(res.S4), S5: rate(res.S5) },
    detail: res,
    accessLoggedEventsAfterDeregistration: survived,
    env: { hardhat: require("hardhat/package.json").version, node: process.version },
  };
  fs.writeFileSync(path.join(__dirname, "replay_results.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
