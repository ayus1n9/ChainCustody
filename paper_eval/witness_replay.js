/**
 * External checkpoint witness experiment.
 * Chain A: the custody chain (Hardhat in-process node; its operator can rewrite history
 *          with evm_snapshot / evm_revert). Chain B: an independent chain
 *          (a separate `hardhat node` on WITNESS_RPC) holding CheckpointWitness.
 * A witness posts A's block hash to B at every height divisible by k. The operator then
 * rewrites the last d blocks of A. The verifier compares A with the latest checkpoint.
 * Prediction (Theorem 4): detected iff a checkpointed height lies in the rewritten range,
 * so over a uniformly random phase P(detect) = min(d, k) / k.
 *
 * Run: RUNS=250 WITNESS_RPC=http://127.0.0.1:8546 \
 *      npx hardhat --config hardhat.local.config.js run paper_eval/witness_replay.js
 */
const hre = require("hardhat");
const { ethers, network } = hre;
const fs = require("fs");
const path = require("path");

const RUNS = Number(process.env.RUNS || 250);
const KS = (process.env.KS || "1,4,16,64").split(",").map(Number);
const DMAX = Number(process.env.DMAX || 64);
const RPC = process.env.WITNESS_RPC || "http://127.0.0.1:8546";

// deterministic PRNG so the run can be repeated
let seed = 20261116;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const randint = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

async function main() {
  const [admin, inv, lab] = await ethers.getSigners();
  const A = await ethers.deployContract("ChainCustody");
  await A.waitForDeployment();
  await (await A.registerParty(inv.address, 1)).wait();
  await (await A.registerParty(lab.address, 2)).wait();
  await (await A.connect(inv).registerEvidence(ethers.id("case-1"), "sim-x", "0x" + "ab".repeat(256))).wait();
  await (await A.connect(inv).grantAccess(1, lab.address, "0x" + "ab".repeat(256))).wait();

  const providerB = new ethers.JsonRpcProvider(RPC);
  const ownerB = await providerB.getSigner(0);
  const witnessB = await providerB.getSigner(1);
  const art = await hre.artifacts.readArtifact("CheckpointWitness");
  const W = await new ethers.ContractFactory(art.abi, art.bytecode, ownerB).deploy();
  await W.waitForDeployment();
  await (await W.setWitness(await witnessB.getAddress(), true)).wait();
  const Ww = W.connect(witnessB);
  const chainIdB = (await providerB.getNetwork()).chainId;
  const chainIdA = (await ethers.provider.getNetwork()).chainId;

  const cpGas = [];
  const head = () => ethers.provider.getBlockNumber();
  // one honest block on A; the witness checkpoints it when height % k == 0
  async function honestBlock(tag, k) {
    await (await A.connect(lab).logAccess(1)).wait();
    const h = await head();
    if (h % k === 0) {
      const blk = await ethers.provider.getBlock(h);
      const rc = await (await Ww.checkpoint(tag, h, blk.hash)).wait();
      cpGas.push(Number(rc.gasUsed));
    }
  }
  // one forged block on A (different content, so a different block hash)
  async function forgedBlock() {
    await (await A.connect(inv).logAccess(1)).wait();
  }

  const results = [];
  let runId = 0;
  for (const k of KS) {
    let detected = 0, predictedDetected = 0, agree = 0, chainConsistent = 0;
    const byDepth = {};
    for (let r = 0; r < RUNS; r++) {
      const tag = ethers.id(`run-${runId++}`); // fresh checkpoint stream per run
      const d = randint(1, DMAX);
      const pad = randint(0, k - 1);           // random phase relative to checkpoints
      for (let i = 0; i < pad; i++) await honestBlock(tag, k);
      const snap = await network.provider.send("evm_snapshot", []);
      const s = await head();                  // last block the operator keeps
      for (let i = 0; i < d; i++) await honestBlock(tag, k);
      const h = await head();
      // operator rewrites blocks s+1..h
      await network.provider.send("evm_revert", [snap]);
      for (let i = 0; i < d; i++) await forgedBlock();
      // the rewritten chain is internally consistent: walk parent links over the window
      let ok = (await head()) === h;
      let prev = await ethers.provider.getBlock(s);
      for (let b = s + 1; ok && b <= h; b++) {
        const blk = await ethers.provider.getBlock(b);
        if (blk.parentHash !== prev.hash) ok = false;
        prev = blk;
      }
      if (ok) chainConsistent++;
      // verifier: compare A with the latest checkpoint on B (if any)
      const latest = Number(await W.latestHeight(tag));
      let det = false;
      if (latest > 0 && latest <= h) {
        const nowHash = (await ethers.provider.getBlock(latest)).hash;
        det = !(await W.matches(tag, latest, nowHash));
      }
      const pred = Math.floor(h / k) > Math.floor(s / k); // a multiple of k in (s, h]
      if (det) detected++;
      if (pred) predictedDetected++;
      if (det === pred) agree++;
      const bucket = d >= k ? ">=k" : String(d);
      byDepth[bucket] = byDepth[bucket] || { runs: 0, detected: 0 };
      byDepth[bucket].runs++; if (det) byDepth[bucket].detected++;
      // expected detection for this d under uniform phase
      results.push({ k, d, pad, s, h, latest, detected: det, predicted: pred });
    }
    const expected = results.filter((x) => x.k === k).reduce((acc, x) => acc + Math.min(x.d, k) / k, 0) / RUNS;
    console.log(JSON.stringify({ k, runs: RUNS, detectionRate: detected / RUNS, predictedRate: predictedDetected / RUNS,
      expectedUniformPhase: +expected.toFixed(4), agreement: agree / RUNS, chainConsistent: chainConsistent / RUNS }));
  }

  const summary = KS.map((k) => {
    const rs = results.filter((x) => x.k === k);
    const det = rs.filter((x) => x.detected).length;
    const deep = rs.filter((x) => x.d >= k), shallow = rs.filter((x) => x.d < k);
    return {
      k, runs: rs.length,
      detectionRate: det / rs.length,
      predictedRate: rs.filter((x) => x.predicted).length / rs.length,
      expectedUniformPhase: +(rs.reduce((a, x) => a + Math.min(x.d, k) / k, 0) / rs.length).toFixed(4),
      agreementWithPrediction: rs.filter((x) => x.detected === x.predicted).length / rs.length,
      depthAtLeastK: { runs: deep.length, detected: deep.filter((x) => x.detected).length },
      depthBelowK: { runs: shallow.length, detected: shallow.filter((x) => x.detected).length,
        expected: +shallow.reduce((a, x) => a + x.d / k, 0).toFixed(1) },
    };
  });
  const out = {
    runsPerK: RUNS, dRange: [1, DMAX], ks: KS, chainIdA: Number(chainIdA), chainIdB: Number(chainIdB),
    checkpointGas: { n: cpGas.length, firstOfStream: null, mean: Math.round(cpGas.reduce((a, b) => a + b, 0) / cpGas.length),
      min: Math.min(...cpGas), max: Math.max(...cpGas) },
    summary, runs: results,
    env: { hardhat: require("hardhat/package.json").version, ethers: ethers.version, node: process.version },
  };
  fs.writeFileSync(path.join(__dirname, "witness_results.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ checkpointGas: out.checkpointGas, summary }, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
