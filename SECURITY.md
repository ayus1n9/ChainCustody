# Security Policy & Threat Model

ChainCustody is a decentralized digital evidence chain-of-custody protocol engineered for judicial integrity, tamper-detection, and statutory retention enforcement.

---

## 1. Vulnerability Reporting & Disclosure Process

We welcome responsible security research and disclosures. If you discover a vulnerability in ChainCustody:

1. **Do NOT open a public GitHub issue.**
2. Send an encrypted or direct email detailing the vulnerability to `security@chaincustody.org` or submit via private GitHub Security Advisory at [https://github.com/ayus1n9/ChainCustody/security/advisories](https://github.com/ayus1n9/ChainCustody/security/advisories).
3. Include:
   - Reproduction steps or proof-of-concept (PoC) script.
   - Affected components (`contracts/`, `scripts/`, `frontend/`, or API endpoints).
   - Severity assessment (CVSS 3.1 rating).
4. **Response Timeline**:
   - Initial acknowledgment: within 24 hours.
   - Triage and impact validation: within 72 hours.
   - Remediation and coordinated disclosure: within 14 calendar days.

---

## 2. Security Threat Model

ChainCustody enforces a three-tier defense-in-depth model across the storage, client, and consensus layers:

### Primary Threat Actors:
- **Centralized Storage Adversary**: An untrusted cloud or IPFS storage provider attempting to alter, delete, or inject malicious payloads.
- **Rogue Insider / Custodian**: A malicious laboratory analyst or investigator possessing the AES key attempting to forge documents or modify historical evidence.
- **Unilateral Administrator**: A compromised or corrupt deployer attempting to grant themselves investigator privileges or unilaterally destroy active litigation evidence.
- **Network / Transport Adversary**: A man-in-the-middle attacker intercepting dashboard sessions, replaying field signatures, or carrying out directory traversal attacks on web assets.

---

## 3. In-Scope vs. Out-of-Scope Risks

### In-Scope Vulnerabilities (Eligible for Report & Remediation):
- **Smart Contract Vulnerabilities**:
  - Reentrancy, logic bugs, integer overflows (Solidity 0.8+ checked arithmetic bypass).
  - Access control bypasses in `ChainCustody.sol`, `ChainCustodyCommit.sol`, or `RoleCouncil.sol`.
  - Signature replay or malleability in EIP-712 structured data custody transfers.
  - Bypass of evidentiary retention hold (`placeEvidentiaryHold`) or judicial seal (`sealEvidence`).
  - Unilateral execution of administrative actions bypassing the 2-of-3 `RoleCouncil` multi-sig.
  - Stale checkpoint or witness replay bypasses in `CheckpointWitness.sol`.
- **Server & Authentication Vulnerabilities**:
  - Sign-In with Ethereum (SIWE / EIP-4361) signature verification bypasses.
  - Nonce replay or reuse in `/auth/verify`.
  - Session hijacking, weak cookie flags, or session fixation in `scripts/auth.js`.
  - Path traversal, directory traversal, or file escape in `scripts/server.js`.
  - Rate-limit evasion on `/auth/` endpoints.
  - Content Security Policy (CSP) bypasses or cross-site scripting (XSS) vectors.
- **Client-Side Cryptographic Vulnerabilities**:
  - AES-256-GCM authentication tag bypass or nonce reuse in client encryption.
  - Flaws in Merkle tree inclusion proof generation (`client/merkle.js`).
  - Extractability or leakage of RSA-OAEP private keys from browser IndexedDB.
  - Bypassing the custody contract's `logAccess` audit rule before key unwrapping.

### Out-of-Scope Risks (Accepted Limitations / Operational Requirements):
- **Tampering Prior to Registration**:
  - The protocol guarantees integrity *from the instant of registration onward*. If physical evidence is tampered with, corrupted, or fabricated prior to digital acquisition and on-chain registration, the system will accurately anchor the tampered file. Cryptography proves that evidence has not changed since acquisition; it cannot verify physical reality prior to acquisition.
- **Keys Already Published or Compromised**:
  - If a recipient's asymmetric private key or an evidence item's AES decryption key was previously leaked or compromised off-platform, historical ciphertext encrypted under that key can be decrypted by the holder of that compromised key. On-chain revocation (`revokeAccess`) wipes the wrapped key from state to prevent future contract retrieval, but cannot retract or re-encrypt data already decrypted.
- **Public On-Chain Metadata**:
  - While evidence plaintext and symmetric keys remain encrypted and confidential, metadata written directly to the ledger (SHA-256 hashes, IPFS CIDs, timestamps, party addresses, case IDs, and custody transaction graphs) is publicly readable on-chain. Pseudonymity depends on operational wallet separation; zero-knowledge shielding of case metadata is not implemented.
- **Compromised Examiner Workstation**:
  - Malware, keyloggers, or unauthorized physical access to the examiner's local computer.
- **Underlying Blockchain Consensus Failure**:
  - 51% consensus reorganization attacks affecting both the custody chain and the external `CheckpointWitness` ledger simultaneously.
- **Social Engineering & Lost Keys**:
  - Compromised user passwords, phishing of MetaMask seed phrases, or lost private keys.

---

## 4. Key Architectural Defenses

1. **Wallet Authentication & Session Security (EIP-4361 SIWE)**:
   - Web dashboard access requires cryptographic authentication via Sign-In with Ethereum (EIP-4361).
   - Single-use, 5-minute random nonces, strict chain ID and domain verification, and rate limiting (10 req/min/IP) prevent credential abuse and replay.
   - Sessions are secured with `httpOnly`, `SameSite=Strict`, and `Secure` (over HTTPS) cookies; the unauthenticated role dropdown is completely eliminated outside demo mode.
2. **Two-Person Rule (`RoleCouncil.sol`)**:
   - Party registration and role assignments require M-of-N council approvals (default 2-of-3).
   - Proposals expire after 7 days (`PROPOSAL_LIFETIME = 7 days`).
   - Single admin address cannot unilaterally grant itself roles.
3. **Cross-Chain Checkpoint Witnessing (`CheckpointWitness.sol` & `scripts/witness.js`)**:
   - Block hashes from the custody chain are periodically checkpointed (every `WITNESS_K = 16` blocks) to an independent external chain.
   - Any reorganization or history rewrite is immediately detected when querying `verifyWitnessStatus()`.
4. **Demo Mode Isolation**:
   - `DEMO_MODE=true` is strictly isolated to loopback `127.0.0.1` and displays a permanent simulation banner.
   - With `DEMO_MODE=false` (default), simulator components, persona selectors, and mock credentials are never served or permitted.
5. **Non-Extractable Browser Encryption Keys**:
   - Asymmetric RSA-OAEP 2048-bit key pairs are generated using Web Crypto API and stored in browser IndexedDB with `extractable: false` on private keys.
   - When registering a party, their public key is signed by their wallet.
   - When inspecting evidence, the custody contract enforces `logAccess` on-chain *before* the browser unwraps decryption keys.
6. **Hardened Web Delivery**:
   - Static server binds to `127.0.0.1` by default.
   - `Content-Security-Policy: default-src 'self'; script-src 'self'; ... frame-ancestors 'none';`.
   - `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`.
   - Ethers.js is served locally from `node_modules/`, eliminating third-party CDN dependency risks.
