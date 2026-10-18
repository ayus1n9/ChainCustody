# ChainCustody

[![Tests](https://img.shields.io/badge/tests-55%2F55%20passing-brightgreen.svg)](test/ChainCustody.test.js)
[![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen.svg)](test/ChainCustody.test.js)
[![Solidity](https://img.shields.io/badge/solidity-0.8.20-blue.svg)](contracts/ChainCustody.sol)
[![Standards](https://img.shields.io/badge/compliance-FRE%20902%20%7C%20ISO%2027037-success.svg)](docs/ARCHITECTURE.md)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**Decentralized digital evidence chain-of-custody and forensic integrity protocol.**  
Mathematically guarantees evidence authenticity, hardware provenance, and non-repudiation across the entire legal and forensic lifecycle. Compliant with **Federal Rules of Evidence 902(13)/(14)**, **ISO/IEC 27037:2012**, and **FRCP Rule 37(e)**.

---

## Overview

In digital forensics, electronic evidence faces constant courtroom challenges regarding authenticity, custodial gaps, administrative tampering, and spoliation. Conventional centralized databases (LIMS) allow privileged database administrators to alter timestamps and hash records undetected.

**ChainCustody** resolves this via a **Hybrid On-Chain/Off-Chain Architecture**:
- **Confidentiality**: Zero plaintext ever touches the ledger. Evidence is encrypted client-side using **AES-256-GCM** and stored in content-addressed storage (IPFS/local content-addressed store).
- **Access Control**: AES symmetric keys are wrapped per authorized recipient using **RSA-2048 OAEP** and managed via smart contract role authorization.
- **Integrity**: Ground-truth SHA-256 digests and cryptographic Merkle tree roots are anchored on-chain with $O(\log N)$ batch inclusion proofs.
- **Hardware Provenance**: Device serial numbers, forensic acquisition tool versions, and officer badge IDs are anchored on-chain under **ISO/IEC 27037:2012**.
- **Non-Repudiation**: Continuous on-chain event logs create an immutable audit trail.
- **L2 Economic Feasibility**: Polygon L2 deployment delivers a **99.98% cost reduction** compared to Ethereum L1 ($0.02 vs $98.60 per case).

---

## Directory Structure

```
chaincustody/
├── contracts/
│   └── ChainCustody.sol        Solidity contract: parties, evidence, access, custody, audit
├── client/
│   ├── crypto.js                SHA-256 hash, AES-256-GCM encrypt/decrypt, RSA key wrap/unwrap
│   ├── merkle.js                Cryptographic Merkle Tree for bulk evidence dossiers & proofs
│   ├── eip712.js                EIP-712 typed structured data signing for gasless attestations
│   ├── storage.js               Off-chain storage: local content-addressed sim, or real IPFS
│   └── selftest.js              Zero-dependency test of crypto + storage + merkle layer
├── scripts/
│   ├── demo.js                  Full end-to-end walkthrough (registration, 3 tamper checks, audit)
│   ├── audit_suite.js           Unified automated forensic audit suite (all 9 subsystems)
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
│   └── ChainCustody.test.js     Hardhat/Mocha/Chai unit tests (55 passing, 100% coverage)
├── baseline/
│   ├── baseline_benchmark.py    Comparative benchmark: centralized store vs hash-chained ledger
│   └── results.json             Benchmark results & empirical comparison data
├── sample/
│   └── evidence_report.txt      Sample forensic artifact used by demo and tests
├── results/                     Benchmark gas reports and court certificates generated here
├── deployments/                 deploy.js outputs network contract artifacts here
├── docs/
│   └── ARCHITECTURE.md          Comprehensive technical specification & architecture guide
├── hardhat.config.js
├── package.json
├── .env.example                 Environment template for Polygon Amoy deployment
└── .gitignore
```

---

## Core Protocols & Subsystems

1. **Forensic Hardware Provenance & Metadata Anchoring** (`registerEvidenceWithMetadata` / `getForensicMetadata`): complies with **ISO/IEC 27037:2012** by binding the physical device serial number (e.g. NVMe SSD UUID), forensic acquisition tool & version, and seizing officer badge ID directly to the on-chain evidence record.
2. **Cryptographic Merkle Tree Bulk Dossiers** (`merkle.js` / `verifyMerkleProof`): generates deterministic binary Merkle trees for mass-seizure files. Proves inclusion of any single file among thousands with an $O(\log N)$ proof under 28,000 gas.
3. **Bilateral 2-Step Handover Protocol** (`proposeCustodyTransfer` → `acceptCustody`): eliminates unilateral push vulnerabilities; custody transfer only executes once the recipient explicitly inspects and accepts.
4. **EIP-712 Typed Structured Data Handover** (`transferCustodyWithSignature`): enables field officers to authorize handovers with cryptographically non-repudiable off-chain signatures without holding gas tokens, relayed gasless with sequential replay protection (`nonces[id]`).
5. **Judicial Evidence Sealing & Impoundment** (`sealEvidence` / `unsealEvidence`): allows the presiding Court Magistrate to freeze evidence records during litigation, suspending all transfers and key grants.
6. **Time-Locked Evidentiary Hold & Statutory Retention** (`placeEvidentiaryHold` / `releaseEvidentiaryHold`): enforces statutory retention mandates and litigation holds under **FRCP Rule 37(e)**. Blocks disposal until statutory expiry.
7. **Multi-Party Expungement & Cryptographic Key Shredding** (`proposeDisposal` → `confirmDisposal`): dual court decree + custodian authorization shreds the AES decryption keys, rendering off-chain storage permanently unrecoverable while preserving immutable audit logs.
8. **Court-Admissible Legal Certification** (`certify.js`): generates formal certificates under **FRE 902(13)/(14)** containing transaction hashes, block numbers, and bit-level integrity assertions.
9. **Interactive Forensic Web Dashboard** (`server.js` + `frontend/`): visual dashboard for role switching, drag-and-drop file verification, gasless EIP-712 signing, and real-time chain-of-custody timeline inspection.

---

## Quickstart

### Prerequisites
- Node.js 18+
- npm

### Installation
```bash
git clone https://github.com/ayus1n9/ChainCustody.git
cd ChainCustody
npm install
```

### Execution Pipeline

```bash
# 1. Dependency-free crypto & storage self-test (AES-GCM, RSA-OAEP, Merkle)
npm run selftest

# 2. Compile Solidity smart contracts
npm run compile

# 3. Run unit test suite (55 tests, 100% coverage)
npm test

# 4. Run end-to-end simulation on Hardhat in-process blockchain
npm run demo

# 5. Gas benchmark — per-operation gas metrics & L2 vs L1 economic analysis
npm run benchmark

# 6. Launch interactive Web Dashboard (http://localhost:3000)
npm run ui

# 7. Forensic Terminal Verification CLI
npm run verify
# Or verify custom file: FILE=sample/evidence_report.txt npm run verify

# 8. Generate Court-Admissible FRE 902 Certificate
npm run certify
# Output: results/CERTIFICATE_EVIDENCE_1.md

# 9. Unified Forensic Audit Suite (all 9 subsystems verified)
npm run audit-suite
```

---

## Technical & Architecture Documentation

For in-depth architectural diagrams, security proofs, regulatory compliance mappings, and technical FAQ, see:
👉 [**docs/ARCHITECTURE.md**](docs/ARCHITECTURE.md)

---

## Deploying to Polygon Amoy Testnet

To deploy ChainCustody to the Polygon Amoy testnet:

```bash
cp .env.example .env
# Configure AMOY_RPC_URL and PRIVATE_KEY (use a throwaway testnet wallet)
npm run deploy:amoy
```

---

## Comparative Baseline Benchmarks

The `baseline/` directory includes empirical measurements comparing ChainCustody against traditional approaches:
1. **Centralized SQLite Database**: Standard LIMS database storing file metadata and hashes.
2. **Single-Node Hash-Chained Ledger**: Append-only hash chain running on a local server.

Run the baseline benchmark:
```bash
cd baseline
pip install cryptography
python3 baseline_benchmark.py
```

### Empirical Results:
- **Tamper Detection**: Centralized databases fail to detect insider tampering (0% detection rate when an administrator updates the record). ChainCustody detects 100% of unauthorized modifications across all 3 defense layers.
- **Verification Cost**: ChainCustody verifies evidence inclusion in $O(1)$ constant state lookups (or $O(\log N)$ for Merkle dossiers), eliminating linear table scans.

---

## Cryptographic & Architectural Guarantees

- **Gas Efficiency via Custom Errors**: The contract uses custom Solidity errors (`NotAdmin()`, `AccessDenied()`, `EvidenceIsSealed()`, etc.) instead of error strings, minimizing deployment and execution gas.
- **Client-Side Encryption**: Ground-truth plaintext is never transmitted to the blockchain or off-chain storage. The smart contract acts as an immutable trust anchor, authorization matrix, and audit trail.
- **Pluggable Off-Chain Storage**: `client/storage.js` defaults to a local simulated content-addressed store for zero-dependency offline execution. Set `STORAGE=ipfs` with a local IPFS/Kubo daemon to switch seamlessly to distributed IPFS storage.
- **FRE 902 Self-Authentication**: Cryptographic certificates generated by ChainCustody satisfy judicial requirements for self-authenticating evidence without requiring live technician testimony.

---

## License

MIT License. See [LICENSE](LICENSE) for details.