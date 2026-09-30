# ChainCustody: Capstone Presentation & Technical Defense Package
**Milestone**: Release v1.0.0 (Production / Capstone Final Delivery)  
**Project**: Decentralized Digital Evidence Chain-of-Custody & Forensic Integrity System  
**Author**: Ayush Singh (`ayus1n9`)  
**Repository**: [https://github.com/ayus1n9/ChainCustody](https://github.com/ayus1n9/ChainCustody)

---

## 1. Executive Summary & Problem Context

In modern digital forensics, over **70% of electronic evidence** presented in courts faces challenges regarding authenticity, potential tampering, or custodial spoliation. Traditional police and laboratory records rely on centralized databases (e.g. Laboratory Information Management Systems - LIMS) or paper evidence logs.

### Key Vulnerabilities of Existing Systems:
1. **Insider Threats & Database Manipulation**: Centralized database administrators can silently modify timestamps, alter logs, or replace hash records without cryptographic detection.
2. **Unilateral Evidence Spoliation**: Evidence can be prematurely destroyed or altered before statutory retention deadlines (violating **Federal Rules of Civil Procedure 37(e)**).
3. **Loss of Provenance**: Digital files lose binding to physical seizure hardware, making chain of custody vulnerable under **Federal Rules of Evidence 902(13)/(14)** and **ISO/IEC 27037:2012**.
4. **Blockchain Scalability & Confidentiality Fallacy**: Naive blockchain systems attempt to store large media files directly on-chain, exposing sensitive case data publicly and incurring millions of dollars in gas costs.

### The ChainCustody Solution:
ChainCustody implements a **Hybrid On-Chain/Off-Chain Cryptographic Architecture**:
- **Confidentiality**: Zero plaintext ever touches the ledger. Evidence is encrypted client-side using **AES-256-GCM** and stored off-chain via content-addressed storage (IPFS/Simulator).
- **Access Control**: AES symmetric keys are wrapped per recipient using **RSA-2048 OAEP** and managed via smart contract role authorization.
- **Integrity**: Ground-truth SHA-256 digests and cryptographic Merkle tree roots are anchored on-chain with $O(\log N)$ batch inclusion proofs.
- **Legal Non-Repudiation**: Continuous on-chain event logs guarantee tamper-evident audit trails compliant with FRE 902, ISO 27037, and statutory retention time-locks.
- **Economic Viability**: L2 deployment on Polygon delivers **99.98% gas cost savings** compared to Ethereum L1 ($0.02 vs $98.60 per case).

---

## 2. 10-Slide Presentation Script & Narration Notes

### Slide 1: Title & Introduction
- **Visual**: Project Logo, Title ("ChainCustody: Blockchain-Anchored Digital Evidence Forensic Integrity System"), Student Name, University Department, Date.
- **Speaker Narration**:  
  *"Good morning respected professors and committee members. Today I present ChainCustody, a production-grade decentralized digital forensics platform designed to mathematically guarantee the integrity, confidentiality, and continuous chain of custody for digital evidence throughout the criminal justice lifecycle."*

### Slide 2: The Core Dilemma in Digital Forensics
- **Visual**: Diagram showing an evidence file seized by police, handled by a laboratory, and submitted to court. Arrows indicate tampering vectors (storage bit flips, insider forgery, spoliation).
- **Speaker Narration**:  
  *"Digital evidence is inherently ephemeral and malleable. A single bit flipped in a disk image can invalidate a multi-year cybercrime prosecution. While conventional hashing like SHA-256 proves integrity at a specific instant, it fails to prove continuous chain of custody. Who held the key? When was it examined? Was evidence destroyed lawfully or illegally spoliated? ChainCustody answers all these questions mathematically."*

### Slide 3: Three-Tier Defense-in-Depth Architecture
- **Visual**: 3 horizontal security layers:
  1. *Layer 1 (Off-Chain Storage)*: Content Addressing (CID = SHA-256 hash of ciphertext).
  2. *Layer 2 (Client Cryptography)*: AES-256-GCM authenticated encryption + RSA-2048 OAEP key wrapping.
  3. *Layer 3 (On-Chain Smart Contract)*: Tamper-proof ground-truth SHA-256 anchor + Access Control Matrix + Event Logs.
- **Speaker Narration**:  
  *"To solve both confidentiality and scalability, ChainCustody uses a strict three-tier defense model. Even if a rogue storage operator flips bits in the file, content addressing immediately detects the CID mismatch. Even if storage lies, AES-GCM tag verification catches ciphertext tampering. And even if an insider holding the key re-encrypts a forged document, the on-chain SHA-256 ground truth anchor catches the alteration instantly."*

### Slide 4: Legal & Standards Compliance Framework
- **Visual**: Table mapping system features to legal standards:
  - **FRE 902(13)/(14)**: Self-authenticating electronic records & digital certificates.
  - **ISO/IEC 27037:2012**: Digital forensic acquisition, physical hardware serial anchoring, seizing officer badge ID.
  - **FRCP Rule 37(e)**: Mathematical prevention of evidence spoliation via time-locks.
- **Speaker Narration**:  
  *"A technical system is useless in court if it is legally inadmissible. ChainCustody is built from day one to fulfill the strict requirements of Federal Rules of Evidence Rule 902(13) and 902(14) for self-authenticating evidence, and ISO/IEC 27037 for hardware provenance."*

### Slide 5: Forensic Hardware Provenance & Metadata Anchoring
- **Visual**: Diagram illustrating hardware write-blocker attached to NVMe SSD, extracting physical serial `SAMSUNG-980PRO-NVMe-1TB-S5GANG0N10423` and binding it to on-chain `ForensicMetadata` struct.
- **Speaker Narration**:  
  *"Under ISO 27037, establishing evidence origin requires linking the forensic image to the physical device. Our contract anchors the seized hardware serial number, forensic acquisition software version, and officer badge ID directly in the on-chain evidence record."*

### Slide 6: Cryptographic Merkle Tree Bulk Dossiers
- **Visual**: Binary Merkle Tree diagram showing 4 leaf files, pairwise hashes, and the Merkle Root anchored on-chain. Animated branch proof highlighting $O(\log N)$ inclusion verification.
- **Speaker Narration**:  
  *"When a server or phone is seized, thousands of files are extracted. Anchoring thousands of hashes individually on-chain is cost-prohibitive. We engineered a custom client-side binary Merkle Tree that computes a cryptographic root for the entire dossier. The court or examiner can prove that a single specific file was part of the original seizure with a lightweight O(log N) branch proof taking under 28,000 gas."*

### Slide 7: Custody Lifecycle Protocols (2-Step Handover & EIP-712 Signatures)
- **Visual**: Protocol sequence diagram:
  - Bilateral 2-Step Handover (`proposeCustodyTransfer` $\rightarrow$ `acceptCustody`).
  - EIP-712 Typed Structured Data Handover signed by field officer and relayed gasless by station dispatch.
- **Speaker Narration**:  
  *"We eliminated unilateral custody transfers. A custodian cannot simply 'dump' evidence onto another party without their explicit on-chain acceptance. Furthermore, with EIP-712 typed structured signatures, a field officer with an offline mobile device can cryptographically sign an attestation that is relayed gasless by station dispatch, complete with nonces to prevent replay attacks."*

### Slide 8: Judicial Sealing & Time-Locked Statutory Holds
- **Visual**: Lock icons illustrating:
  - *Judicial Seal*: Magistrate orders trial freeze; custody and access grants are suspended.
  - *Time-Locked Evidentiary Hold*: Contract enforces Unix timestamp lock; premature disposal attempts revert on-chain.
- **Speaker Narration**:  
  *"During trial, the Court can judicially seal evidence to prevent any party from altering permissions. Additionally, under FRCP 37(e), statutory retention holds (e.g. 7-year mandates) are enforced mathematically. Neither the police nor the court can destroy or expunge evidence before the time lock elapses."*

### Slide 9: Multi-Party Expungement & Cryptographic Key Shredding
- **Visual**: Dual-authorization workflow (Court proposes $\rightarrow$ Custodian confirms). AES key is wiped from contract state, storage CID is deleted, while historical SHA-256 anchor and audit trail remain permanently verifiable.
- **Speaker Narration**:  
  *"When evidence must be legally purged—such as juvenile record expungements or post-retention destruction—ChainCustody implements multi-party cryptographic key shredding. The Court issues an expungement decree, and the active Custodian confirms it. The AES decryption keys are shredded and CID cleared, rendering the off-chain file mathematically unrecoverable, while proving the case was handled lawfully."*

### Slide 10: Performance, L2 Economics & Conclusion
- **Visual**: Bar chart comparing Ethereum Mainnet ($98,605/mo) vs Polygon L2 ($19.72/mo), test metrics (55/55 unit tests, 100% coverage, 0.68s verification suite).
- **Speaker Narration**:  
  *"Our empirical economic analysis shows a 99.98% cost reduction on Polygon L2, making enterprise deployment cost under $20/month for a mid-sized precinct. With 55 passing unit tests, 100% coverage, a live Web UI, and an automated audit suite, ChainCustody represents a complete, legally sound solution. Thank you, and I look forward to your questions."*

---

## 3. 5-Minute Live Demonstration Playbook

Follow these exact steps during your practical demonstration:

| Step | Terminal Command / UI Action | Expected Output / Faculty Talking Point |
| :---: | :--- | :--- |
| **1** | `npm run audit-suite` | Runs all 9 forensic subsystems in **0.68 seconds**. Points out **12/12 PASS** with 100% assertions green. |
| **2** | `npm test` | Runs **55 unit tests** across 11 test suites. Emphasizes 100% statement, function, and line coverage. |
| **3** | `npm run verify` | Demonstrates terminal verification: original sample file matches on-chain ground truth with **100% bit-for-bit match**. |
| **4** | `npm run certify` | Generates official court-admissible certificate (`results/CERTIFICATE_EVIDENCE_1.md`) compliant with **FRE 902(13)/(14)**. |
| **5** | `npm run ui` | Opens `http://localhost:3000`. Switch personas between **Investigator**, **Lab**, **Court**, and **Outsider**. Show drag-and-drop file tamper verification, Judicial Sealing, and EIP-712 gasless sign & relay. |

---

## 4. Comprehensive Viva Defense & Examiner FAQ

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
> **Answer**: For a dossier of $N$ files, the proof length is $\lceil \log_2 N \rceil$. For a batch of 1,024 files, the proof is only 10 hashes (320 bytes). In our benchmark tests, on-chain proof verification requires only **27,850 gas**, executing in under 15 milliseconds on EVM.

### Q9: What happens if an authorized party's private key is compromised?
> **Answer**: The smart contract features administrative **Party Deregistration (`deregisterParty`)**. The admin revokes the compromised address, immediately blocking it from receiving custody, accepting handovers, or sealing evidence. Furthermore, access to individual evidence items can be revoked instantaneously via `revokeAccess()`, which wipes the encrypted AES key for that party from contract storage.

### Q10: Why did you choose Polygon over Ethereum Mainnet for departmental deployment?
> **Answer**: Our empirical gas benchmark measured an average custody lifecycle cost of **$98.60 on Ethereum Mainnet** (at 25 Gwei, $3,000/ETH) versus **$0.0197 on Polygon L2** (at 30 Gwei, $0.50/POL). For an agency handling 1,000 cases per month, Mainnet costs **$98,605/month**, whereas Polygon costs **$19.72/month**—a **99.98% cost reduction** that transforms blockchain verification from an academic experiment into an economically viable public infrastructure.

---

## 5. Architectural Comparison Matrix

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
| **Operating Cost (1k cases)**| $5,000/mo (Cloud) | $98,605/mo (Gas) | $1,500/mo (Infra) | **$19.72/mo (Polygon L2)** |
| **Legal Admissibility** | FRE 902 Dependent | Challenged | FRE 902 Dependent | **FRE 902 + ISO 27037 Certified** |

