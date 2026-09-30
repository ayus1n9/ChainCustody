# ChainCustody

Blockchain-based chain of custody for digital evidence — capstone demo project.

> **Verification status.** This sandbox has no internet access, so Hardhat/Solidity
> could not be installed or compiled here. The **client-side cryptography layer has
> no external dependencies** (only Node's built-in `crypto` module) and **was run and
> verified in this sandbox** — see `npm run selftest` below, 5/5 checks pass.
> The **smart contract, tests, demo and gas benchmark were written but not yet
> executed** — run them on your own machine before presenting (steps below); they
> follow standard, well-tested Hardhat patterns, but "written correctly" and
> "verified" are different claims and you should confirm the second one yourself.

## Directory structure

```
chaincustody/
├── contracts/
│   └── ChainCustody.sol        Solidity contract: parties, evidence, access, custody, audit
├── client/
│   ├── crypto.js                SHA-256 hash, AES-256-GCM encrypt/decrypt, RSA key wrap/unwrap
│   ├── merkle.js                Cryptographic Merkle Tree for bulk evidence dossiers & proofs
│   ├── storage.js               Off-chain storage: local content-addressed sim, or real IPFS
│   └── selftest.js              Dependency-free test of the crypto+storage+merkle layer
├── scripts/
│   ├── demo.js                  Full end-to-end walkthrough (deploy → register → grant →
│   │                             access → tamper attempts → revoke → custody transfer → audit)
│   ├── deploy.js                Deploy to a network, save the address
│   ├── benchmark.js             Gas cost per operation + L2 vs L1 economic analysis
│   ├── server.js                Zero-dependency local server for the web dashboard
│   ├── verify.js                Standalone forensic terminal verification CLI
│   └── certify.js               Court-admissible certificate generator (FRE 902 / Sec 65B)
├── frontend/
│   ├── index.html               Web dashboard (role switcher, verify, custody, timeline)
│   ├── style.css                Modern dark forensic theme
│   └── app.js                   Web Crypto API + simulation & Web3 MetaMask provider
├── test/
│   └── ChainCustody.test.js     Hardhat/Mocha/Chai unit tests
├── baseline/
│   ├── baseline_benchmark.py    Review 2: existing-solution baselines (centralized store,
│   │                             hash-chained ledger) + tamper/perf benchmark
│   └── results.json             Output of the above (already run — see prior review)
├── sample/
│   └── evidence_report.txt      Fictional sample file used by the demo
├── results/                     benchmark.js writes gas-report.json here
├── deployments/                 deploy.js writes {network}.json here
├── docs/                        (notes/diagrams, optional)
├── hardhat.config.js
├── package.json
├── .env.example                 Copy to .env only if deploying to Polygon Amoy
└── .gitignore
```

## What the contract does

`ChainCustody.sol` stores, per piece of evidence: a SHA-256 **hash** of the original
file, the **CID** of the encrypted file in off-chain storage, and the current
**custodian**. It never stores the file itself. Access is role-based
(Investigator / Lab / Court / Defense), grantable and revocable only by the current
custodian, and custody itself can be **transferred** via direct or **2-step handover protocol**
(`proposeCustodyTransfer` → `acceptCustody`).

Additionally, the contract implements a **Judicial Evidence Sealing & Archival Protocol**
(`sealEvidence` / `unsealEvidence`): only the presiding Court Magistrate can issue formal
impoundment orders, freezing all custody transfers and key grants to guarantee trial integrity.
Every state change emits an event — that event log **is** the immutable audit trail, which
is why the contract doesn't also keep a separate on-chain array for it (cheaper in gas,
same guarantee).


## Setup

Requires Node.js 18+ and internet access (Hardhat downloads the Solidity compiler on
first use).

```bash
cd chaincustody
npm install
```

## Run — in this order

```bash
# 1. Dependency-free crypto/storage self-test (no blockchain needed)
npm run selftest

# 2. Compile the contract
npm run compile

# 3. Run the unit tests
npm test

# 4. Run the full end-to-end demo on Hardhat's in-process chain (no wallet/faucet needed)
npm run demo

# 5. Gas benchmark — per-operation cost, L2 vs L1 economic analysis & O(1) scaling
npm run benchmark

# 6. Interactive Web Dashboard — visual role switching, drag-and-drop verification & timeline
npm run ui
# (Opens http://localhost:3000)

# 7. Forensic Terminal Verification — instant command-line verification
npm run verify
# Or test specific file: FILE=sample/evidence_report.txt npm run verify

# 8. Generate Court-Admissible Certificate — formal proof for legal proceedings
npm run certify
# (Writes results/CERTIFICATE_EVIDENCE_1.md)
```

`npm run demo` is the one to show your faculty live: it deploys the contract,
registers four parties, hashes/encrypts/registers a sample evidence file, grants the
Lab access, has the Lab retrieve/decrypt/verify it, tries several things that should
fail (an unregistered outsider, a party with no grant, double-registering the same
file), runs three tamper scenarios (storage-layer tamper, ciphertext tamper, a valid
re-encryption of a forged file), revokes access, transfers custody, and finally
prints the full audit trail read back from the blockchain's own event log.

## Deploying to a real testnet (optional, for Review 3)

```bash
cp .env.example .env
# put a throwaway test wallet's private key in .env — never a real-money key
npm run deploy:amoy
```

## Baseline comparison (from Review 2)

`baseline/baseline_benchmark.py` implements and measures the two *existing*
approaches this project improves on — a centralized evidence store and a
single-node hash-chained ledger — and is what the Review 2 results (tamper
detection rates, hashing/encryption speed, ledger verification scaling) came from.
It's included here so the whole story — what exists, what its measured gaps are,
and what this project does about them — lives in one place. Re-run it with:

```bash
cd baseline
pip install cryptography
python3 baseline_benchmark.py
```

## Honesty notes for the viva

- The contract uses **custom Solidity errors** (`NotAdmin()`, `AccessDenied()`, etc.)
  instead of require-strings — this is the current gas-efficient convention, worth
  mentioning if asked about gas optimization.
- Confidentiality comes from **client-side encryption before anything is uploaded**;
  the blockchain and off-chain storage never see the plaintext. The contract's job is
  authorization, tamper-evidence, and the audit trail — not secrecy by itself.
- `client/storage.js` defaults to a local simulated content-addressed store so the
  demo runs fully offline. Set `STORAGE=ipfs` (with a local IPFS/Kubo daemon running)
  to use real IPFS instead — the rest of the code is unchanged either way.