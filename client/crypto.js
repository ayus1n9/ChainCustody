"use strict";
/**
 * Client-side cryptography for ChainCustody (Node built-in `crypto`, no dependencies).
 *
 *  - SHA-256           : fingerprint of the ORIGINAL file (anchored on-chain)      O(n)
 *  - AES-256-GCM       : authenticated encryption of the file (stored off-chain)   O(n)
 *  - RSA-OAEP (SHA-256): wraps the AES key separately for each authorized party
 *
 * Blob layout produced by encryptFile():  [ IV (12 bytes) | GCM tag (16 bytes) | ciphertext ]
 */
const crypto = require("crypto");

const IV_LEN = 12;
const TAG_LEN = 16;

/** SHA-256 of a Buffer, returned as 0x-prefixed hex (fits a Solidity bytes32). */
function sha256(buf) {
  return "0x" + crypto.createHash("sha256").update(buf).digest("hex");
}

/** New random 256-bit AES key. */
function generateSymmetricKey() {
  return crypto.randomBytes(32);
}

/** AES-256-GCM encrypt. A fresh random IV is used for every file. */
function encryptFile(plain, key) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

/** AES-256-GCM decrypt. Throws if the ciphertext (or key) was tampered with. */
function decryptFile(blob, key) {
  if (!Buffer.isBuffer(blob) || blob.length < IV_LEN + TAG_LEN) {
    throw new Error("Invalid or truncated ciphertext blob");
  }
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/** RSA-2048 key pair for a party (demo stand-in for ECIES with Ethereum keys). */
function generateKeyPair() {
  return crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

/** Encrypt (wrap) the AES key for one recipient's public key. */
function wrapKey(symKey, publicKeyPem) {
  return crypto.publicEncrypt(
    { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    symKey
  );
}

/** Decrypt (unwrap) the AES key with the recipient's private key. */
function unwrapKey(wrapped, privateKeyPem) {
  const wrappedBuf = Buffer.isBuffer(wrapped) ? wrapped : Buffer.from(wrapped);
  return crypto.privateDecrypt(
    { key: privateKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    wrappedBuf
  );
}

module.exports = { sha256, generateSymmetricKey, encryptFile, decryptFile, generateKeyPair, wrapKey, unwrapKey };
