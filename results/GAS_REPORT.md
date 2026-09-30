# ChainCustody: Gas Benchmark & Economic Analysis (L2 vs L1)

## Executive Summary
This report analyzes the computational gas consumption and practical economic feasibility of **ChainCustody** on **Ethereum Mainnet (Layer-1)** versus **Polygon Amoy / PoS (Layer-2)**.

Because EVM bytecode executes identically across EVM-compatible chains, the gas units consumed per operation are deterministic. The critical engineering distinction lies in the economic transaction fee, proving that **deploying on Layer-2 achieves a ~5,000× cost reduction (~99.98% savings)**, making blockchain-based digital evidence management viable for real-world legal and forensic departments.

---

## 1. EVM Gas Benchmark per Operation

| Operation | Executions | Mean Gas | Min Gas | Max Gas | Complexity |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Contract Deployment** | 1 | 1,175,994 | 1,175,994 | 1,175,994 | $O(1)$ |
| **registerEvidence** | 200 | 395,133 | 395,025 | 412,149 | $O(1)$ |
| **grantAccess** | 30 | 257,847 | 257,847 | 257,847 | $O(1)$ |
| **logAccess** | 30 | 27,728 | 27,728 | 27,728 | $O(1)$ |
| **revokeAccess** | 30 | 64,047 | 64,047 | 64,047 | $O(1)$ |
| **transferCustody** | 30 | 260,979 | 260,979 | 260,979 | $O(1)$ |

> **Note on $O(1)$ Scaling**: Testing evidence registration with existing registries of 0, 50, 100, and 200 records confirms gas consumption remains constant (~395k gas) regardless of dataset size, because state storage uses mapping lookups rather than on-chain array traversals.

---

## 2. Direct Economic Comparison: L1 vs L2

### Baseline Market Assumptions:
- **Ethereum Mainnet (L1)**: Gas Price = **25 Gwei**, ETH Price = **$3000.00**
- **Polygon (L2 / Amoy)**: Gas Price = **30 Gwei**, POL/MATIC Price = **$0.50**

| Operation | Mean Gas | Ethereum L1 Cost | Polygon L2 Cost | Cost Advantage |
| :--- | :---: | :---: | :---: | :---: |
| **Deployment** | 1,175,994 | $88.1996 | $0.017640 | **5,000× cheaper** |
| **registerEvidence** | 395,133 | $29.6350 | $0.005927 | **5,000× cheaper** |
| **grantAccess** | 257,847 | $19.3385 | $0.003868 | **5,000× cheaper** |
| **logAccess** | 27,728 | $2.0796 | $0.000416 | **5,000× cheaper** |
| **revokeAccess** | 64,047 | $4.8035 | $0.000961 | **5,000× cheaper** |
| **transferCustody** | 260,979 | $19.5734 | $0.003915 | **5,000× cheaper** |

---

## 3. Departmental Workload Case Study

For a mid-sized law enforcement agency or forensic laboratory processing **1,000 cases per month**:
- **1,000** Evidence Registrations
- **2,000** Access Grants (Forensic Lab, Court, Defense)
- **4,000** Evidence Access Verifications
- **1,000** Custody Transfers
- **500** Access Revocations

### Projected Monthly Operational Cost:
- **Ethereum Mainnet (L1)**: **$98605.61 / month**
- **Polygon (L2)**: **$19.72 / month**
- **Net Monthly Savings**: **$98585.89 (99.98% reduction)**

### Viva / Defense Takeaway:
Running digital chain-of-custody directly on Ethereum Mainnet is economically prohibitive for public sector agencies ($100k+/year in transaction fees alone). Deploying on an L2 (Polygon) achieves identical cryptographic security and immutable court admissibility for less than **$19.72/month**, proving practical real-world feasibility.
