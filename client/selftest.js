"use strict";
// Offline self-test of the client layer (no blockchain needed):  npm run selftest
const assert = require("assert");
const os = require("os");
const path = require("path");
const fs = require("fs");
const cc = require("./crypto");
const { LocalContentStore } = require("./storage");

(async () => {
  const store = new LocalContentStore(fs.mkdtempSync(path.join(os.tmpdir(), "cc-")));
  const plain = Buffer.from("Disk image report - case FIR-2026-0042");
  const key = cc.generateSymmetricKey();

  // 1. hash + encrypt + store + retrieve + decrypt round trip
  const hash = cc.sha256(plain);
  assert.strictEqual(hash.length, 66, "hash must be 0x + 64 hex chars (bytes32)");
  const cid = await store.put(cc.encryptFile(plain, key));
  const back = cc.decryptFile(await store.get(cid), key);
  assert.ok(back.equals(plain), "round trip must return identical bytes");
  assert.strictEqual(cc.sha256(back), hash, "hash of decrypted file must match");
  console.log("PASS  hash / encrypt / store / retrieve / decrypt round trip");

  // 2. per-recipient key wrapping
  const lab = cc.generateKeyPair(), defense = cc.generateKeyPair();
  const wrapped = cc.wrapKey(key, lab.publicKey);
  assert.ok(cc.unwrapKey(wrapped, lab.privateKey).equals(key), "lab must recover the AES key");
  assert.throws(() => cc.unwrapKey(wrapped, defense.privateKey), "another party must NOT recover it");
  console.log("PASS  AES key wrapped per recipient; wrong private key fails");

  // 3. storage-layer tamper (bit flip) is caught by content addressing
  store.tamperFlipBit(cid);
  await assert.rejects(() => store.get(cid), /CID mismatch/);
  console.log("PASS  altered stored file rejected by content addressing (CID mismatch)");

  // 4. even if the storage layer lies, AES-GCM authentication catches a flipped bit
  assert.throws(() => cc.decryptFile(await_get(store, cid), key), "GCM must reject tampered ciphertext");
  console.log("PASS  altered ciphertext rejected by AES-GCM authentication tag");

  // 5. key-holder substitutes a different file and re-encrypts: GCM passes, hash does not
  store.overwrite(cid, cc.encryptFile(Buffer.from("FORGED report"), key));
  const forged = cc.decryptFile(await_get(store, cid), key);
  assert.notStrictEqual(cc.sha256(forged), hash, "forged file must not match the anchored hash");
  console.log("PASS  substituted-but-validly-encrypted file caught by SHA-256 hash comparison");

  // 6. truncated ciphertext blob is rejected cleanly
  assert.throws(() => cc.decryptFile(Buffer.from("too-short"), key), /Invalid or truncated ciphertext blob/);
  // 7. unwrapKey accepts Buffer or typed array
  const wrappedUint8 = new Uint8Array(wrapped);
  assert.ok(cc.unwrapKey(wrappedUint8, lab.privateKey).equals(key), "unwrapKey accepts Uint8Array");
  console.log("PASS  buffer guard and unwrapKey input normalization verified");

  console.log("\nAll client-layer self-tests passed.");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });

// synchronous raw read that bypasses CID verification (simulates a lying storage node)
function await_get(store, cid) { return fs.readFileSync(store._path(cid)); }
