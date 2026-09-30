"use strict";
/**
 * Cryptographic Merkle Tree for Bulk Digital Evidence Dossiers.
 * Uses SHA-256 for leaves and internal nodes, with lexicographically sorted pairs
 * matching standard EVM verification (OpenZeppelin compatible).
 */
const crypto = require("crypto");

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest();
}

function toBuffer(val) {
  if (Buffer.isBuffer(val)) return val;
  if (typeof val === "string") {
    const clean = val.startsWith("0x") ? val.slice(2) : val;
    if (clean.length === 64) return Buffer.from(clean, "hex");
    return Buffer.from(val, "utf8");
  }
  return Buffer.from(val);
}

function hashPair(a, b) {
  return Buffer.compare(a, b) <= 0
    ? sha256(Buffer.concat([a, b]))
    : sha256(Buffer.concat([b, a]));
}

class MerkleTree {
  /**
   * @param {Array<Buffer|string>} elements Array of file buffers or leaf hashes
   */
  constructor(elements) {
    if (!elements || elements.length === 0) {
      throw new Error("Cannot create Merkle tree with empty elements");
    }

    // Leaves: If 32-byte Buffer or 64-char hex, treat as already hashed; otherwise hash the content
    this.leaves = elements.map((el) => {
      const b = toBuffer(el);
      return b.length === 32 ? b : sha256(b);
    });

    this.layers = [this.leaves];
    this._build();
  }

  _build() {
    let current = this.leaves;
    while (current.length > 1) {
      const next = [];
      for (let i = 0; i < current.length; i += 2) {
        if (i + 1 < current.length) {
          next.push(hashPair(current[i], current[i + 1]));
        } else {
          // Odd element is promoted to the next level
          next.push(current[i]);
        }
      }
      this.layers.push(next);
      current = next;
    }
  }

  /** Merkle Root as 0x-prefixed hex string (Solidity bytes32) */
  getRoot() {
    return "0x" + this.layers[this.layers.length - 1][0].toString("hex");
  }

  /** Leaf hash at index as 0x-prefixed hex string */
  getLeaf(index) {
    return "0x" + this.leaves[index].toString("hex");
  }

  /**
   * Generates a Merkle inclusion proof for a given leaf index.
   * @param {number} index Index of the leaf
   * @returns {string[]} Array of 0x-prefixed 32-byte hex strings
   */
  getProof(index) {
    if (index < 0 || index >= this.leaves.length) {
      throw new Error("Leaf index out of bounds");
    }

    const proof = [];
    let idx = index;

    for (let i = 0; i < this.layers.length - 1; i++) {
      const layer = this.layers[i];
      const isRight = idx % 2 === 1;
      const siblingIdx = isRight ? idx - 1 : idx + 1;

      if (siblingIdx < layer.length) {
        proof.push("0x" + layer[siblingIdx].toString("hex"));
      }
      idx = Math.floor(idx / 2);
    }

    return proof;
  }

  /**
   * Client-side proof verification.
   * @param {string[]} proof Sibling hashes
   * @param {string|Buffer} leaf Leaf hash or original buffer
   * @param {string} root Expected Merkle root
   * @returns {boolean}
   */
  static verify(proof, leaf, root) {
    let computed = toBuffer(leaf);
    if (computed.length !== 32) computed = sha256(computed);

    const rootBuf = toBuffer(root);

    for (const p of proof) {
      const sibling = toBuffer(p);
      computed = hashPair(computed, sibling);
    }

    return computed.equals(rootBuf);
  }
}

module.exports = { MerkleTree };
