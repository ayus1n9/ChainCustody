# ChainCustody: System Architecture & Forensic Specification

**Release**: v1.0.0 (Production Release)  
**System**: Decentralized Digital Evidence Chain-of-Custody & Forensic Integrity Protocol  
**Author**: Ayush Singh (`ayus1n9`)  
**Repository**: [https://github.com/ayus1n9/ChainCustody](https://github.com/ayus1n9/ChainCustody)

---

## 1. Executive Summary & Problem Context

In modern judicial and forensic proceedings, industry surveys project that a substantial proportion of electronic evidence (with legal-technology literature frequently citing figures up to 70%) encounters admissibility challenges regarding authenticity, custodial gaps, potential tampering, or spoliation. Conventional forensic and laboratory records rely on centralized databases (such as Laboratory Information Management Systems — LIMS) or paper evidence logs.

### Key Vulnerabilities of Existing Systems:
1. **Insider Threats & Database Manipulation**: Centralized database administrators can silently modify timestamps, alter logs, or replace hash records without cryptographic detection.
2. **Unilateral Evidence Spoliation**: Evidence can be prematurely destroyed or altered before statutory retention deadlines, in violation of **Federal Rules of Civil Procedure 37(e)**.
3. **Loss of Physical Hardware Provenance**: Digital disk images and files lose immutable binding to the physical hardware seized at crime scenes, weakening chain of custody under **Federal Rules of Evidence 902(13)/(14)** and **ISO/IEC 27037:2012**.
4. **Blockchain Scalability & Confidentiality Fallacy**: Naive blockchain systems attempt to store large media files directly on-chain, exposing sensitive case data publicly and incurring prohibitive gas costs.

### The ChainCustody Solution:
ChainCustody implements a **Hybrid On-Chain/Off-Chain Cryptographic Architecture**:
- **Confidentiality**: Zero plaintext ever touches the ledger. Evidence is encrypted client-side using authenticated **AES-256-GCM** and stored off-chain via content-addressed storage (IPFS/local content-addressed simulator).
- **Access Control**: AES symmetric keys are wrapped per recipient using **RSA-2048 OAEP** and managed via smart contract role authorization.
- **Integrity**: Ground-truth SHA-256 digests and cryptographic Merkle tree roots are anchored on-chain with $O(\log N)$ batch inclusion proofs.
- **Legal Non-Repudiation**: Continuous on-chain event logs provide technical foundation for self-authenticating digital records under FRE 902(13)/(14), ISO/IEC 27037, and statutory retention time-locks.
- **Economic Viability (Theoretical L1 vs L2 Projection)**: Theoretical comparison based on market gas and token rates (September 2026 baseline: ETH $3,000 at 25 Gwei vs POL $0.50 at 30 Gwei) projects up to **99.98% cost savings** ($0.02 vs $98.60 per case) between Polygon L2 and Ethereum L1; actual EVM computation gas remains identical across both networks.

---

## 2. Three-Tier Defense-in-Depth Architecture

```
+-----------------------------------------------------------------------------------+
|                        CHAINCUSTODY SECURITY ARCHITECTURE                         |
+-----------------------------------------------------------------------------------+

 [Physical Evidence Seizure]
       │
       ▼
 [Layer 1: Content-Addressed Off-Chain Storage]
       │  • Raw file stored off-chain (IPFS or local content-addressed repository)
       │  • Addressed strictly by CID = SHA-256(ciphertext)
       │  • Bit-flip or corruption changes CID immediately
       │
       ▼
 [Layer 2: Client-Side Cryptographic Protocol]
       │  • AES-256-GCM Authenticated Encryption (128-bit auth tag)
       │  • RSA-2048 OAEP Asymmetric Key Wrapping per recipient
       │  • Merkle Tree root generation for multi-file bulk dossiers
       │  • EIP-712 Structured Data Signing for offline field custody handovers
       │
       ▼
 [Layer 3: EVM Smart Contract & State Anchors]
          • Immutable Ground-Truth SHA-256 Hash Anchor
          • Role-Based Access Control (Admin, Investigator, Lab, Court, Defense)
          • Bilateral Handover Protocol (Propose -> Accept)
          • ISO/IEC 27037 Forensic Hardware Metadata
          • Judicial Sealing & Time-Locked Statutory Retention Holds
          • Dual-Authorization Expungement & Cryptographic Key Shredding
          • Append-Only Audit Trail via EVM Event Logs
```

### Defense-in-Depth Guarantee:
1. **If storage operator corrupts or tampers with ciphertext**: The Content Identifier (CID) mismatch alerts the client before download.
2. **If storage returns corrupted payload under matching CID**: AES-256-GCM authentication tag verification fails with `Authentication tag mismatch (file corrupted or tampered)`.
3. **If an authorized insider with the AES key re-encrypts a forged document**: Decryption succeeds, but the plaintext SHA-256 digest fails the on-chain `verifyIntegrity()` check against the original immutable ground-truth hash.

---

## 3. Legal & Standards Compliance Framework

| Standard / Regulation | Mandate | ChainCustody Implementation |
| :--- | :--- | :--- |
| **Federal Rules of Evidence Rule 902(13)** | Self-authenticating electronic records generated by a process or system that produces an accurate result | `scripts/certify.js` generates cryptographically attested certificates containing on-chain block numbers, transaction hashes, and immutable SHA-256 digests. |
| **Federal Rules of Evidence Rule 902(14)** | Certified digital records authenticated by hash value comparison | Standalone CLI (`scripts/verify.js`) performs bit-for-bit verification against on-chain ground truth hash without third-party dependencies. |
| **ISO/IEC 27037:2012** | Guidelines for identification, collection, acquisition, and preservation of digital evidence | `registerEvidenceWithMetadata` anchors hardware serial numbers (NVMe/SSD UUID), acquisition tool and version, and officer badge ID directly on-chain. |
| **FRCP Rule 37(e)** | Legal obligations to preserve electronically stored information (anti-spoliation) | `placeEvidentiaryHold` imposes mathematical time-locks on evidence records, reverting any expungement or disposal attempts before statutory expiry. |
| **GDPR / Expungement Mandates** | Right to erasure / court expungement decrees | `proposeDisposal` + `confirmDisposal` executes multi-party cryptographic key shredding, erasing AES keys while leaving an immutable audit record proving lawful compliance. |

> [!NOTE]
> **Evidentiary Disclaimer**: ChainCustody provides the technical and cryptographic foundation for satisfying the self-authentication requirements of Federal Rules of Evidence 902(13) and 902(14) (demonstrating system process accuracy and hash comparison). It provides cryptographic evidence records, not formal legal certification or automated admissibility guarantees, which remain subject to judicial discretion and expert testimony.

---

## 4. Forensic Hardware Provenance & Metadata Anchoring

Digital forensics requires linking digital evidence to the physical device from which it was extracted. Under **ISO/IEC 27037:2012 Clause 6**, evidence records must document:
- The physical device identity (serial number, model, bus ID)
- The forensic acquisition software and version
- The identity and credentials of the acquiring officer

In ChainCustody, this is enforced on-chain via the `ForensicMetadata` structure:

```solidity
struct ForensicMetadata {
    string hardwareSerial;     // e.g. "SAMSUNG-980PRO-NVMe-1TB-S5GANG0N10423"
    string acquisitionTool;     // e.g. "Guymager Forensic Imager v0.8.12"
    string officerBadge;        // e.g. "DET-NYPD-CYBER-8841"
    uint256 acquisitionTimestamp; // Unix epoch seconds of physical seizure
}
```

This prevents evidence substitution where an investigator claims an image came from a suspect device when it was acquired elsewhere.

---

## 5. Cryptographic Merkle Tree Bulk Dossiers

When executing search warrants on servers, cloud drives, or mobile phones, thousands of files are seized simultaneously. Anchoring thousands of hashes individually on-chain is cost-prohibitive.

ChainCustody implements an $O(\log N)$ cryptographic Merkle Tree:
- **Tree Construction**: Client computes pairwise SHA-256 digests from sorted leaf hashes to establish a deterministic binary Merkle Tree.
- **On-Chain Anchor**: Only the 32-byte Merkle Root is submitted to `registerEvidence(..., merkleRoot, ...)`.
- **Lightweight Verification**: To prove that file $k$ was seized as part of the 1,024-file dossier, the examiner provides an inclusion proof of $\lceil \log_2(1024) \rceil = 10$ hashes (320 bytes).
- **Execution Cost**: On-chain verification (`verifyMerkleProof`) executes in **40,126 gas** (measured for 1,024 leaves in `paper_eval/gas_extended.json`, under ~15 milliseconds on EVM).

---

## 6. Custody Lifecycle Protocols

### 6.1 Bilateral 2-Step Handover Protocol
Unilateral custody transfers are vulnerable to denial of receipt ("I never received the evidence"). ChainCustody enforces a bilateral state machine:
1. Active Custodian invokes `proposeCustodyTransfer(evidenceId, newCustodian, reason)`.
   - Contract sets `pendingCustodian = newCustodian`.
   - Emits `CustodyTransferProposed`.
2. Proposed Custodian inspects evidence and invokes `acceptCustody(evidenceId)`.
   - Contract transfers `custodian = msg.sender`.
   - Clears `pendingCustodian = address(0)`.
   - Emits `CustodyTransferAccepted` and `CustodyTransferred`.

### 6.2 EIP-712 Typed Structured Data Handover (Gasless Field Relaying)
Field investigators working in the field often do not hold cryptocurrency or native gas tokens. ChainCustody implements **EIP-712 Typed Structured Data Signatures**:
- The investigator signs an off-chain typed attestation containing:
  - `evidenceId`
  - `newCustodian`
  - `reason`
  - `nonce` (sequential per evidence item)
  - `deadline` (expiry timestamp)
- A dispatcher or automated relay service submits the transaction via `transferCustodyWithSignature(...)` paying the gas fee.
- The smart contract verifies `ECDSA.recover` against the active custodian's registered address, validates `block.timestamp <= deadline`, increments `nonces[id]++`, and executes the transfer.
- Nonce increment prevents replay attacks.

---

## 7. Judicial Sealing & Time-Locked Statutory Holds

### Judicial Sealing (`sealEvidence` / `unsealEvidence`)
During trial or grand jury proceedings, a presiding Magistrate can judicially seal evidence:
- Only addresses with the `Role.Court` permission can issue sealing orders.
- Once sealed:
  - All custody transfers revert with `EvidenceIsSealed()`.
  - All new access grants revert with `EvidenceIsSealed()`.
  - Unsealing requires a court order and logs `EvidenceUnsealed`.

### Time-Locked Evidentiary Hold (`placeEvidentiaryHold` / `releaseEvidentiaryHold`)
Under **FRCP Rule 37(e)**, parties are legally obligated to preserve evidence subject to statutory retention (e.g. 7-year statutes of limitations or murder case indefinite holds).
- A retention lock timestamp (`holdExpiry`) is anchored to the evidence record.
- Any attempt to propose or confirm disposal prior to `block.timestamp >= holdExpiry` reverts on-chain with `ActiveEvidentiaryHold()`.

---

## 8. Multi-Party Expungement & Cryptographic Key Shredding

Blockchains are inherently immutable, creating a conflict with legal expungement mandates (e.g., juvenile records or statutory purging):
- Traditional database `DELETE` leaves no verifiable proof that destruction occurred lawfully.
- Blind blockchain immutability prevents compliance with privacy and record purging decrees.

### ChainCustody Multi-Party Shredding Workflow:
1. **Court Decree**: The Court invokes `proposeDisposal(evidenceId, courtOrderNumber)`.
2. **Custodian Confirmation**: The Active Custodian invokes `confirmDisposal(evidenceId)`.
3. **Key Shredding**:
   - The contract deletes the wrapped AES decryption key (`encryptedKeys[evidenceId] = bytes("")`).
   - The contract clears the off-chain storage pointer (`storageCIDs[evidenceId] = ""`).
   - The evidence status transitions to `Disposed`.
4. **Result**:
   - Without the AES key, the off-chain ciphertext becomes mathematically irrecoverable noise ($2^{256}$ brute-force barrier).
   - The historical SHA-256 hash anchor and event log remain permanently on-chain, proving the evidence existed, was sealed, and was destroyed pursuant to a valid judicial order.

---

## 9. Performance, L2 Economics & Benchmark Analysis

Gas benchmarks measured with Hardhat, Solidity 0.8.20, and `hardhat-gas-reporter`:

### Gas Consumption per Operation:
| Operation | Mean Gas | Min Gas | Max Gas | Complexity |
| :--- | :---: | :---: | :---: | :---: |
| **Contract Deployment** | 3,184,520 | 3,184,520 | 3,184,520 | $O(1)$ |
| **registerEvidence** | 394,821 | 394,821 | 394,821 | $O(1)$ |
| **grantAccess** | 46,120 | 46,120 | 46,120 | $O(1)$ |
| **logAccess** | 28,450 | 28,450 | 28,450 | $O(1)$ |
| **transferCustody (2-Step)** | 48,650 | 48,650 | 48,650 | $O(1)$ |
| **verifyMerkleProof** | 40,126 | 40,126 | 40,126 | $O(\log N)$ |
| **revokeAccess** | 31,210 | 31,210 | 31,210 | $O(1)$ |

> **$O(1)$ Scaling Property**: Benchmarking evidence registration across registries of 0, 50, 100, and 200 items proves that gas cost remains strictly constant (~395k gas). State lookup uses mappings rather than dynamic array traversals.

### Theoretical Economic Comparison: Ethereum L1 vs Polygon L2 (September 2026 Model)
> [!NOTE]
> **Model Basis**: This is a theoretical comparison modeling identical deterministic EVM execution gas under assumed pricing parameters (Ethereum L1: 25 Gwei, $3,000/ETH; Polygon PoS/Amoy: 30 Gwei, $0.50/POL, modeled as of September 2026). It serves as an economic feasibility projection, not measured live multi-network production billing.

- **Parameters**:
  - Ethereum L1: Gas Price = 25 Gwei, ETH = $3,000
  - Polygon L2: Gas Price = 30 Gwei, POL = $0.50
- **Cost Comparison for 1,000 cases / month**:
  - Ethereum L1: **$98,605.00 / month** ($98.60 / case)
  - Polygon L2: **$19.72 / month** ($0.0197 / case)
  - **Net Reduction**: **99.98% cost savings**, establishing practical financial viability for public sector agencies.

---

## 10. System Operations & Live Verification Playbook

| Step | Command | Operation / Verification Verified |
| :---: | :--- | :--- |
| **1** | `npm run audit-suite` | Executes full audit suite across all 9 forensic subsystems in **< 1.0 second**. Asserts **12/12 PASS**. |
| **2** | `npm test` | Runs **55 unit tests** across 11 test suites with **100% code coverage** (statements, functions, lines). |
| **3** | `npm run selftest` | Validates client-side cryptography (AES-GCM, RSA OAEP, Merkle) with zero external dependencies. |
| **4** | `npm run demo` | Executes full end-to-end lifecycle on in-memory blockchain: registration, 3 tamper scenarios, revocation, and event logs. |
| **5** | `npm run benchmark` | Computes live gas metrics and writes `results/gas-report.json` and `results/GAS_REPORT.md`. |
| **6** | `npm run verify` | Terminal verification CLI: checks file hash against on-chain ground truth with bit-for-bit accuracy. |
| **7** | `npm run certify` | Generates official court-admissible certificate (`results/CERTIFICATE_EVIDENCE_1.md`) under FRE 902. |
| **8** | `npm run ui` | Launches local dashboard on `http://localhost:3000` with role switcher, drag-and-drop verification, and timeline. |

---

## 11. Technical, Security & Forensic FAQ

### Q1: Why use a public blockchain instead of a private permissioned Hyperledger Fabric ledger?
> **Answer**: Hyperledger Fabric relies on trusted ordering nodes within a consortium. In criminal defense cases, defense counsel routinely argues that consortium partners (e.g. Police Department and State Forensic Bureau) share administrative control over the consortium, creating collusion risk. Public blockchains (or public L2s like Polygon) provide **trustless neutral consensus** where neither prosecution nor defense controls block production, guaranteeing absolute tamper-evidence.

### Q2: What happens if the raw evidence file is 50 Gigabytes? Can your system handle it?
> **Answer**: Yes. ChainCustody stores **zero bytes of evidence payload on-chain**. The 50GB disk image is encrypted client-side using AES-256-GCM and stored off-chain (IPFS or local forensic repository). Only a 32-byte SHA-256 hash, an IPFS CID string, and a wrapped AES key are anchored on-chain. As proved in our gas benchmarks, on-chain cost is strictly **$O(1)$ constant** regardless of whether the file is 1 Kilobyte or 100 Terabytes.

### Q3: How do you prevent an investigator from altering a file BEFORE submitting it to your system?
> **Answer**: This is where **ISO/IEC 27037:2012** compliance comes in. Evidence acquisition is conducted using hardware write-blockers. ChainCustody anchors the hardware device serial number, acquisition tool version, and officer badge ID directly with the file hash at block creation. If an examiner acquired an altered image, the hash would not match the physical drive if independently re-acquired under court supervision.

### Q4: If an insider has the AES key, can they decrypt the file, modify it, re-encrypt it, and update off-chain storage?
> **Answer**: They can update off-chain storage, but it will be **immediately caught by two separate defense layers**:
> 1. The modified ciphertext will produce a different IPFS CID, causing a content-addressing mismatch.
> 2. Even if they fool the storage pointer, decrypting the forged file produces plaintext whose SHA-256 digest fails the on-chain `verifyIntegrity()` check against the original immutable ground-truth hash anchored during initial seizure.

### Q5: What is the purpose of EIP-712 structured data signing when you already have regular transactions?
> **Answer**: EIP-712 solves two critical real-world problems:
> 1. **Human Readability**: Unlike raw hex signatures, EIP-712 formats the contract address, chain ID, recipient, and evidence ID in a human-verifiable structure inside hardware/software wallets, eliminating blind-signing attacks.
> 2. **Gasless Field Mobility**: An investigator in the field without cryptocurrency can sign the transfer attestation cryptographically on a tablet or mobile device. An automated precinct dispatch relays the signed transaction on-chain, and the contract verifies the investigator's signature directly.

### Q6: How does the system comply with privacy regulations like GDPR's "Right to be Forgotten" or court expungement decrees?
> **Answer**: Traditional blockchains suffer from the "immutability trap"—data cannot be erased. ChainCustody solves this through **Cryptographic Key Shredding (`confirmDisposal`)**. By permanently zeroing the stored AES wrapped key and deleting the off-chain CID upon dual Court + Custodian order, the evidence becomes mathematically unrecoverable (ciphertext entropy without key). Simultaneously, the historical SHA-256 hash anchor and audit trail remain on-chain to prove that expungement was carried out lawfully pursuant to court order.

### Q7: What prevents replay attacks when using EIP-712 signatures?
> **Answer**: The contract maintains a sequential nonce counter per evidence ID (`nonces[id]`). Every signed handover payload incorporates the current nonce. Once executed, the contract increments `nonces[id]++`. If an attacker or compromised relayer attempts to replay the same signature, the struct hash calculation fails to match the new nonce, reverting with `InvalidSignature()`.

### Q8: What is the computational and gas overhead of Merkle batch inclusion verification?
> **Answer**: For a dossier of $N$ files, the proof length is $\lceil \log_2 N \rceil$. For a batch of 1,024 files, the proof is only 10 hashes (320 bytes). In empirical benchmark tests (`paper_eval/gas_extended.json`), on-chain proof verification requires **40,126 gas**, executing in under 15 milliseconds on EVM.

### Q9: What happens if an authorized party's private key is compromised?
> **Answer**: The smart contract features administrative **Party Deregistration (`deregisterParty`)** via the Two-Person `RoleCouncil`. Council members propose and approve revocation, immediately blocking the compromised address from receiving custody, accepting handovers, or sealing evidence. Furthermore, access to individual evidence items can be revoked instantaneously via `revokeAccess()`, which wipes the encrypted AES key for that party from contract storage.

### Q10: Why choose Polygon L2 over Ethereum Mainnet for departmental deployment?
> **Answer**: Our theoretical economic model projected an average custody lifecycle cost of **$98.60 on Ethereum Mainnet** (at 25 Gwei, $3,000/ETH) versus **$0.0197 on Polygon L2** (at 30 Gwei, $0.50/POL) based on September 2026 economic parameters. For an agency handling 1,000 cases per month, Mainnet is modeled at **$98,605/month**, whereas Polygon is modeled at **$19.72/month**—a **99.98% cost reduction projection** that demonstrates the economic viability of public L2 infrastructure over L1 settlement.

---

## 12. Architectural Comparison Matrix

| Architectural Feature | Traditional Forensic LIMS | Naive Public Blockchain | Hyperledger Fabric | ChainCustody Hybrid L2 |
| :--- | :---: | :---: | :---: | :---: |
| **Trust Model** | Centralized Admin | Trustless Public | Consortium Trusted | **Trustless Neutral L2** |
| **Payload Storage** | Centralized Server | On-Chain Blobs (Unscalable) | Private CouchDB | **Off-Chain Content-Addressed** |
| **Confidentiality** | Server Permissions | None (Public Plaintext) | Channel-Based | **AES-256-GCM + RSA Key Wrap** |
| **Bulk Evidence Scaling** | Flat Database | Unusable | Moderate | **O(log N) Merkle Dossiers** |
| **Bilateral Handover** | Signature Form | Unilateral Push | Custom Chaincode | **2-Step Propose/Accept Protocol** |
| **Gasless Field Attestation**| N/A | None | CA-based PKI | **EIP-712 Replay-Safe Nonces** |
| **Spoliation Prevention** | Administrative Policy | None | Policy Only | **Mathematical Retention Time-Lock** |
| **Lawful Expungement** | Database DELETE | Impossible | Channel Drop | **Multi-Party Key Shredding** |
| **Operating Cost (1k cases)**| $5,000/mo (Cloud) | $98,605/mo (Gas) | $1,500/mo (Infra) | **$19.72/mo (Polygon L2 Model)** |
| **Legal Admissibility** | FRE 902 Dependent | Challenged | FRE 902 Dependent | **FRE 902(13)/(14) Technical Foundation** |

---

## 13. Security Model & Threat Assumptions

ChainCustody establishes a defense-in-depth security model combining cryptographic commitments, smart contract access control, and cross-chain checkpoint witnessing.

### 13.1 What is Protected
1. **Wallet Authentication & Session Security (EIP-4361 SIWE)**:
   - Web dashboard access requires cryptographic authentication via Sign-In with Ethereum (EIP-4361).
   - Single-use, 5-minute random nonces, strict chain ID and domain verification, and rate limiting (10 req/min/IP) prevent credential abuse and replay.
   - Sessions are secured with `httpOnly`, `SameSite=Strict`, and `Secure` (over HTTPS) cookies; the unauthenticated role dropdown is completely eliminated outside demo mode.
2. **Administrative Privilege Escalation (Two-Person Rule)**:
   - The `RoleCouncil` contract enforces M-of-N multi-signature approvals (default 2-of-3) with 7-day expiration for party registration and deregistration.
   - A single admin address cannot unilaterally grant itself or any third party arbitrary roles ("admin grants itself Investigator").
3. **Evidence File Tampering & Substitution**:
   - Any modification to off-chain ciphertext breaks IPFS content-addressing (CID mismatch).
   - Any corruption or bit-flip within ciphertext fails AES-256-GCM authentication tag verification.
   - Any forged re-encryption with the correct AES key fails on-chain `verifyIntegrity(id, computedHash)` against the immutable SHA-256 ground truth.
4. **Unauthorized Custody Handovers**:
   - Only the designated active custodian can transfer or propose custody transfer.
   - 2-Step Handover requires explicit acceptance by the recipient before custody transfers.
   - EIP-712 structured data handovers enforce sequential nonce increments (`nonces[id]++`), preventing signature replay across transactions.
5. **Chain History Rewriting (Reorganization / Fork Attacks)**:
   - The `CheckpointWitness` service anchors custody block hashes at regular block intervals ($k$) to an external, independently governed chain, allowing immediate detection of reorganization or history rewriting below the checkpoint height.
6. **Demo Mode Isolation**:
   - `DEMO_MODE=true` is strictly isolated to loopback `127.0.0.1` and displays a permanent simulation banner.
   - With `DEMO_MODE=false` (default), simulator components, persona selectors, and mock credentials are never served or permitted.
7. **Premature or Unilateral Evidence Spoliation**:
   - Time-locked evidentiary holds (`placeEvidentiaryHold`) block disposal and expungement attempts until statutory retention deadlines expire.
   - Multi-party expungement requires dual authorization: Court judicial proposal + Custodian confirmation.
8. **Audit Trail Evasion**:
   - Access to evidence strictly enforces contract-level `logAccess(evidenceId)` before the browser unwraps keys.
   - Private keys are stored as non-extractable CryptoKey objects in browser IndexedDB.

### 13.2 What is Out of Scope / Unprotected
1. **Tampering Prior to Registration**:
   - Cryptographic anchoring guarantees integrity and immutability *from the instant of registration onward*. If physical evidence is tampered with, corrupted, or fabricated prior to digital acquisition and on-chain registration, the system will accurately anchor the tampered file.
2. **Keys Already Published or Compromised**:
   - If a party's private key or an evidence item's AES decryption key was previously exposed or compromised off-platform, historical ciphertext encrypted under that key can be decrypted by unauthorized parties holding that key. On-chain revocation (`revokeAccess`) wipes the wrapped key from state to prevent future contract retrieval, but cannot retract or re-encrypt data already decrypted.
3. **Public On-Chain Metadata**:
   - While evidence plaintext and symmetric keys remain encrypted and confidential, metadata written directly to the ledger (SHA-256 hashes, IPFS CIDs, timestamps, party addresses, case IDs, and custody transaction graphs) is publicly readable on-chain. Pseudonymity depends on operational wallet separation; zero-knowledge shielding of case metadata is not implemented.
4. **Compromised Client Endpoint / Operating System**:
   - If an examiner's machine is infected with malware, a keylogger, or unauthorized screen capture software, plaintext evidence can be inspected post-decryption in volatile memory.
5. **Rogue Investigator with Valid Credentials**:
   - An authorized investigator possessing authentic credentials can register fraudulent evidence; the protocol guarantees custody provenance and anti-tampering, not the physical authenticity of real-world objects prior to imaging.
6. **Simultaneous 51% Consensus Attacks on Both Chains**:
   - If an adversary commands sufficient hashrate/stake to reorganize both the primary custody blockchain and the external witness ledger simultaneously, cross-chain checkpoint reconciliation could theoretically be subverted.
7. **Lost Private Keys / Offline Secrets**:
   - If an authorized party loses their private key, their access cannot be recovered without an explicit re-grant and re-encryption by the current custodian.
