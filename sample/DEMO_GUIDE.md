# Capstone Presentation & Defense Guide: ChainCustody

This guide is your complete presentation playbook for presenting **ChainCustody** to faculty examiners, capstone judges, and review panels.

---

## 1. Sample Evidence Files in `sample/`

We have provided a set of realistic forensic evidence files in the `sample/` folder:

| File Name | Purpose | What It Demonstrates to Judges |
|:---|:---|:---|
| **`sample/case_FIR_2026_042_cctv_log.txt`** | **Authentic Original Evidence** | Primary seized forensic server log with timestamp, IP (`192.168.1.105`), and write-blocker serial numbers. Used as ground truth. |
| **`sample/case_FIR_2026_042_cctv_log_TAMPERED.txt`** | **Tampered / Forged Evidence** | Identical file except **one IP address** is altered (`10.0.0.1`). Used to demonstrate live zero-tolerance tamper detection. |
| **`sample/hardware_provenance.json`** | **Physical Hardware Metadata** | Adherence to **ISO/IEC 27037:2012** (Tableau T8u hardware write-blocker, technician badge, and physical drive serial number). |
| **`sample/bulk_dossier/`** | **Bulk Seizure Evidence Dossier** | 4 multi-source evidence files (syslog, USB extraction, browser history, email headers) proving $O(\log N)$ Merkle batch inclusion proofs. |

---

## 2. The 5-Minute Live Demonstration Playbook

Follow these exact steps during your review presentation:

### Step 1: The One-Command Forensic Audit (30 Seconds)
Open a terminal in the project directory and run:
```bash
npm run audit-suite
```
**What to say to judges:**
> *"To ensure mathematical correctness across all evidentiary subsystems, we built an automated forensic verification suite. With a single command, it validates all 9 protocols—from client AES-256-GCM encryption, to ISO/IEC 27037 hardware anchoring, Merkle tree batch proofs, judicial sealing, and multi-party cryptographic expungement."*

---

### Step 2: The Visual Web Dashboard Demo (2 Minutes)
Start the UI in Demo Simulation Mode:
```bash
DEMO_MODE=true npm run ui
```
Open **`http://127.0.0.1:3000`** in your browser.

#### A. Show Dynamic Role-Based Access Control (RBAC):
1. In the top navigation bar, toggle the **Persona Switcher**:
   - Select **Investigator**: Show that `Register Evidence`, `Transfer Custody`, and `Grant Access` are unlocked.
   - Select **Forensic Lab**: Show that `Register Evidence` is hidden, but `Accept Custody` and `Verify Integrity` are enabled.
   - Select **Court (Judge)**: Show judicial controls (`Judicial Sealing`, `Evidentiary Hold`, `Propose Disposal`).
   - Select **Unauthorized Outsider**: Show that all action cards disappear and a yellow warning banner appears.

#### B. The "Killer Demo" — Drag-and-Drop Tamper Detection:
1. Click the **"Verify Integrity"** tab.
2. Drag and drop **`sample/case_FIR_2026_042_cctv_log.txt`** into the dropzone.
   - Result: Screen turns **GREEN** with **`[PASS] INTEGRITY CONFIRMED`**. The client SHA-256 matches the on-chain anchor.
3. Now, drag and drop **`sample/case_FIR_2026_042_cctv_log_TAMPERED.txt`**.
   - Result: Screen flashes **RED** with **`[FAIL] TAMPER DETECTED: HASH MISMATCH`**!
**What to say to judges:**
> *"Here we test our system against an active tampering attack. Even though the attacker changed only a single IP address in a 1,000-byte file, the SHA-256 avalanche effect generates a completely different digest, failing on-chain reconciliation immediately."*

---

### Step 3: Judicial Evidentiary Hold & Anti-Spoliation (1 Minute)
1. Switch persona to **Court (Judge)**.
2. Under **Judicial Evidentiary Hold**, click **"Place Evidentiary Hold"** for 90 days.
3. Try to propose or confirm disposal.
   - Result: The contract blocks deletion with custom error `EvidentiaryHoldActive()`.
**What to say to judges:**
> *"Under Federal Rules of Civil Procedure 37(e), evidence subject to litigation cannot be destroyed. ChainCustody enforces mathematical time-locks on-chain, preventing even corrupt administrators from deleting evidence before statutory deadlines expire."*

---

### Step 4: One-Click Court Certificate Export (30 Seconds)
1. Click the **"Export Court Certificate"** button in the header.
2. Open the downloaded Markdown/PDF file.
**What to say to judges:**
> *"For court submission, ChainCustody automatically generates self-authenticating certificates compliant with Federal Rules of Evidence 902(13) and 902(14), providing an unbroken cryptographic audit trail with block heights, timestamps, and custodian signatures."*

---

## 3. Cheat Sheet: Anticipated Questions & Bulletproof Answers

### Q1: Why not store the actual evidence file directly on the blockchain?
> **Answer**: Storing raw files on-chain creates severe privacy violations (evidence is permanently public) and prohibitive gas costs. ChainCustody implements a **hybrid architecture**: large files are encrypted client-side via **AES-256-GCM** and stored off-chain in content-addressed storage (IPFS), while only the **32-byte cryptographic SHA-256 commitment** touches the immutable ledger.

### Q2: What prevents an administrator from granting themselves arbitrary roles?
> **Answer**: We implemented a **Two-Person Rule Council contract (`RoleCouncil.sol`)**. Role registration and revocation require M-of-N multi-signature approval (2-of-3) with a 7-day expiration. A single deployer or admin cannot unilaterally escalate privileges.

### Q3: What happens if an authorized investigator registers fraudulent data?
> **Answer**: Cryptography guarantees that digital evidence has not changed *since the moment of acquisition*; it cannot guarantee physical reality prior to acquisition. To mitigate this, we anchor **ISO/IEC 27037 hardware provenance metadata** (write-blocker serials, technician credentials) directly to the registration transaction to establish strict non-repudiation.

### Q4: How does ChainCustody handle huge cases with thousands of files?
> **Answer**: We implemented **Merkle Tree Dossier Inclusion Proofs**. For a case with 1,024 seized files, we anchor only the 32-byte Merkle root on-chain. Proving that any single file belongs to the dossier requires only a 10-hash proof ($\lceil \log_2 1024 \rceil$), executing on-chain in just **40,126 gas** (~15 milliseconds).

### Q5: How do you protect against blockchain reorganizations or 51% attacks?
> **Answer**: We built the **`CheckpointWitness`** service. At regular block intervals ($k=16$), block hashes are cross-anchored to an independent secondary blockchain. If the primary chain suffers a reorganization, the witness verification badge immediately flags the discrepancy as unverified.
