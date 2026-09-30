"use strict";
/**
 * Off-chain storage adapters. Both expose the same async interface:
 *     put(buffer) -> cid        get(cid) -> buffer
 *
 *  1. LocalContentStore  (default) - a content-addressed store on disk that behaves like IPFS:
 *     the ID is derived from the content, so altered content no longer matches its ID.
 *     It is a SIMULATION so the demo runs offline. Its IDs are not real IPFS CIDs.
 *  2. IpfsStore (optional, STORAGE=ipfs) - talks to a real local IPFS node (Kubo) over its HTTP API.
 *     Needs `ipfs daemon` running on 127.0.0.1:5001. Not exercised in the offline demo.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const hexSha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

class LocalContentStore {
  constructor(dir = path.join(__dirname, "..", ".storage")) {
    this.dir = dir;
    fs.mkdirSync(this.dir, { recursive: true });
  }
  _path(cid) {
    return path.join(this.dir, cid.replace(/[^a-zA-Z0-9-]/g, "_"));
  }
  async put(buf) {
    const cid = "sim-" + hexSha(buf);
    fs.writeFileSync(this._path(cid), buf);
    return cid;
  }
  /** verify=true mimics IPFS: content must hash to its own ID. */
  async get(cid, { verify = true } = {}) {
    const buf = fs.readFileSync(this._path(cid));
    if (verify && "sim-" + hexSha(buf) !== cid) {
      throw new Error("CID mismatch: stored content does not match its content identifier");
    }
    return buf;
  }
  // ---- attack helpers used only by the demo / self-test ----
  tamperFlipBit(cid) {
    const p = this._path(cid);
    const b = fs.readFileSync(p);
    b[b.length - 1] ^= 0x01;
    fs.writeFileSync(p, b);
  }
  overwrite(cid, buf) {
    fs.writeFileSync(this._path(cid), buf);
  }
}

class IpfsStore {
  constructor(api = process.env.IPFS_API || "http://127.0.0.1:5001") {
    this.api = api;
  }
  async put(buf) {
    const fd = new FormData();
    fd.append("file", new Blob([buf]));
    const r = await fetch(`${this.api}/api/v0/add?cid-version=1`, { method: "POST", body: fd });
    if (!r.ok) throw new Error(`IPFS add failed: ${r.status}`);
    return (await r.json()).Hash;
  }
  async get(cid) {
    const r = await fetch(`${this.api}/api/v0/cat?arg=${encodeURIComponent(cid)}`, { method: "POST" });
    if (!r.ok) throw new Error(`IPFS cat failed: ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }
}

function createStore() {
  return process.env.STORAGE === "ipfs" ? new IpfsStore() : new LocalContentStore();
}

module.exports = { LocalContentStore, IpfsStore, createStore };
