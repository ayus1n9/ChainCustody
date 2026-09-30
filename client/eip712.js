const { ethers } = require("ethers");

/**
 * EIP-712 Typed Structured Data Definition for Forensic Custody Handover
 */
const HANDOVER_TYPES = {
  CustodyHandover: [
    { name: "evidenceId", type: "uint256" },
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "wrappedKeyHash", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" }
  ]
};

function getDomain(chainId, contractAddress) {
  return {
    name: "ChainCustody",
    version: "1",
    chainId: Number(chainId),
    verifyingContract: contractAddress
  };
}

/**
 * Cryptographically sign a custody handover attestation under EIP-712.
 */
async function signCustodyHandover({
  signer,
  contractAddress,
  chainId,
  evidenceId,
  from,
  to,
  wrappedKey,
  nonce,
  deadline
}) {
  const domain = getDomain(chainId, contractAddress);
  const wrappedKeyHash = ethers.keccak256(wrappedKey);
  const value = {
    evidenceId,
    from,
    to,
    wrappedKeyHash,
    nonce,
    deadline
  };

  const signature = await signer.signTypedData(domain, HANDOVER_TYPES, value);
  return {
    signature,
    wrappedKeyHash,
    value,
    domain
  };
}

module.exports = {
  HANDOVER_TYPES,
  getDomain,
  signCustodyHandover
};
