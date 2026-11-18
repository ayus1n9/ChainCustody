/**
 * Gas comparison: ChainCustody (wrapped keys in storage) vs ChainCustodyCommit
 * (32-byte keccak256 commitment in storage, wrapped key in an event log).
 * Identical workloads; 256-byte wrapped key (RSA-2048 output) unless swept.
 * Run: npx hardhat --config hardhat.local.config.js run paper_eval/gas_compare.js
 */
const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");
const { signCustodyHandover } = require("../client/eip712");

const N = 30;
const CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
const key = (b, fill = "ab") => "0x" + fill.repeat(b);
const mean = (a) => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
const st = (a) => ({ n: a.length, mean: mean(a), min: Math.min(...a), max: Math.max(...a) });

async function run(name) {
  const [admin, inv, lab, court, relayer] = await ethers.getSigners();
  const f = await ethers.getContractFactory(name);
  const c = await f.deploy();
  const deployGas = Number((await c.deploymentTransaction().wait()).gasUsed);
  const addr = await c.getAddress();
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const g = async (p) => Number((await (await p).wait()).gasUsed);
  await g(c.registerParty(inv.address, 1));
  await g(c.registerParty(lab.address, 2));
  await g(c.registerParty(court.address, 3));
  let next = 1;
  const reg = async (tag, k = key(256)) => { await g(c.connect(inv).registerEvidence(ethers.id(tag), CID, k)); return next++; };
  await reg("warm");

  const K = key(256);
  const out = { contract: name, deployment: deployGas };
  const r = [], gr = [], lg = [], rv = [], tr = [], pr = [], ac = [], sg = [], pd = [], cd = [];
  for (let i = 0; i < N; i++) {
    r.push(await g(c.connect(inv).registerEvidence(ethers.id("r" + i), CID, K))); const id = next++;
    gr.push(await g(c.connect(inv).grantAccess(id, lab.address, K)));
    lg.push(await g(c.connect(lab).logAccess(id)));
    rv.push(await g(c.connect(inv).revokeAccess(id, lab.address)));
    tr.push(await g(c.connect(inv).transferCustody(id, court.address, K)));
  }
  for (let i = 0; i < N; i++) {
    const id = await reg("p" + i);
    pr.push(await g(c.connect(inv).proposeCustodyTransfer(id, lab.address, K)));
    ac.push(await g(c.connect(lab).acceptCustody(id)));
  }
  const deadline = BigInt((await ethers.provider.getBlock("latest")).timestamp) + 3600n;
  for (let i = 0; i < N; i++) {
    const id = await reg("s" + i);
    const nonce = await c.nonces(id);
    const { signature } = await signCustodyHandover({ signer: inv, contractAddress: addr, chainId, evidenceId: id,
      from: inv.address, to: court.address, wrappedKey: K, nonce, deadline });
    sg.push(await g(c.connect(relayer).transferCustodyWithSignature(id, court.address, K, deadline, signature)));
  }
  for (let i = 0; i < N; i++) {
    const id = await reg("d" + i);
    pd.push(await g(c.connect(court).proposeDisposal(id, "order")));
    cd.push(await g(c.connect(inv).confirmDisposal(id)));
  }
  Object.assign(out, {
    registerEvidence: st(r), grantAccess: st(gr), logAccess: st(lg), revokeAccess: st(rv),
    transferCustody: st(tr), proposeCustodyTransfer: st(pr), acceptCustody: st(ac),
    transferCustodyWithSignature: st(sg), proposeDisposal: st(pd), confirmDisposal: st(cd),
  });
  const sweep = [];
  for (const b of [32, 64, 128, 256, 512]) {
    const rr = [], gg = [];
    for (let i = 0; i < 5; i++) {
      rr.push(await g(c.connect(inv).registerEvidence(ethers.id(`k${b}-${i}`), CID, key(b, "cd")))); const id = next++;
      gg.push(await g(c.connect(inv).grantAccess(id, lab.address, key(b, "ef"))));
    }
    sweep.push({ bytes: b, registerEvidence: mean(rr), grantAccess: mean(gg) });
  }
  out.sweep = sweep;
  return out;
}

async function main() {
  const a = await run("ChainCustody");
  const b = await run("ChainCustodyCommit");
  const ops = ["registerEvidence", "grantAccess", "logAccess", "revokeAccess", "transferCustody",
    "proposeCustodyTransfer", "acceptCustody", "transferCustodyWithSignature", "proposeDisposal", "confirmDisposal"];
  const cmp = ops.map((o) => ({ op: o, storage: a[o].mean, commit: b[o].mean,
    saving: a[o].mean - b[o].mean, savingPct: +(100 * (a[o].mean - b[o].mean) / a[o].mean).toFixed(1) }));
  cmp.unshift({ op: "deployment", storage: a.deployment, commit: b.deployment, saving: a.deployment - b.deployment,
    savingPct: +(100 * (a.deployment - b.deployment) / a.deployment).toFixed(1) });
  // linear fit gas = alpha + beta * bytes for each contract and operation
  const fit = (arr, k) => {
    const xs = arr.map((p) => p.bytes), ys = arr.map((p) => p[k]);
    const n = xs.length, mx = xs.reduce((s, x) => s + x, 0) / n, my = ys.reduce((s, y) => s + y, 0) / n;
    const sxy = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0), sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    const beta = sxy / sxx, alpha = my - beta * mx;
    const ssr = ys.reduce((s, y, i) => s + (y - (alpha + beta * xs[i])) ** 2, 0), sst = ys.reduce((s, y) => s + (y - my) ** 2, 0);
    return { alpha: Math.round(alpha), beta: +beta.toFixed(2), r2: +(1 - ssr / sst).toFixed(5) };
  };
  const fits = {
    storage: { registerEvidence: fit(a.sweep, "registerEvidence"), grantAccess: fit(a.sweep, "grantAccess") },
    commit: { registerEvidence: fit(b.sweep, "registerEvidence"), grantAccess: fit(b.sweep, "grantAccess") },
  };
  const w = { reg: 1000, grant: 2000, log: 4000, transfer: 1000, revoke: 500 };
  const month = (x) => w.reg * x.registerEvidence.mean + w.grant * x.grantAccess.mean + w.log * x.logAccess.mean +
    w.transfer * x.transferCustody.mean + w.revoke * x.revokeAccess.mean;
  const out = { storage: a, commit: b, comparison: cmp, linearFit: fits,
    monthlyWorkloadGas: { storage: month(a), commit: month(b), savingPct: +(100 * (month(a) - month(b)) / month(a)).toFixed(1) },
    env: { hardhat: require("hardhat/package.json").version, ethers: ethers.version, node: process.version } };
  fs.writeFileSync(path.join(__dirname, "gas_compare.json"), JSON.stringify(out, null, 2));
  console.table(cmp);
  console.log(JSON.stringify({ fits, monthly: out.monthlyWorkloadGas, sweepA: a.sweep, sweepB: b.sweep }, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
