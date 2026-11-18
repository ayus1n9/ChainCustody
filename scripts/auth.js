/**
 * ChainCustody SIWE Authentication, Session Management & Rate Limiting Module
 * Implements EIP-4361 Sign-In with Ethereum
 */
const crypto = require("crypto");
const { ethers } = require("ethers");

const NONCE_TTL_MS = 5 * 60 * 1000;       // 5 minutes
const SESSION_TTL_MS = 30 * 60 * 1000;    // 30 minutes
const RATE_LIMIT_WINDOW_MS = 60 * 1000;   // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10;       // 10 requests per minute per IP

const ROLE_NAMES = ["None", "Investigator", "Lab", "Court", "Defense"];

// In-memory stores
const activeNonces = new Map(); // nonce -> { createdAt, ip }
const activeSessions = new Map(); // sessionId -> { address, createdAt, expiresAt }
const ipRateLimits = new Map(); // ip -> [timestamp, ...]

/**
 * Generate a random alphanumeric nonce (at least 8 chars)
 */
function generateNonce(ip = "unknown") {
  const nonce = crypto.randomBytes(16).toString("hex");
  activeNonces.set(nonce, { createdAt: Date.now(), ip });
  return nonce;
}

/**
 * Validate and consume a single-use nonce
 */
function consumeNonce(nonce) {
  if (!nonce || typeof nonce !== "string") return false;
  const entry = activeNonces.get(nonce);
  if (!entry) return false;
  activeNonces.delete(nonce); // Single-use consumption
  if (Date.now() - entry.createdAt > NONCE_TTL_MS) {
    return false; // Expired
  }
  return true;
}

/**
 * Clean up expired nonces and sessions periodically
 */
function pruneExpired() {
  const now = Date.now();
  for (const [nonce, data] of activeNonces.entries()) {
    if (now - data.createdAt > NONCE_TTL_MS) {
      activeNonces.delete(nonce);
    }
  }
  for (const [id, data] of activeSessions.entries()) {
    if (now > data.expiresAt) {
      activeSessions.delete(id);
    }
  }
  for (const [ip, timestamps] of ipRateLimits.entries()) {
    const valid = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (valid.length === 0) ipRateLimits.delete(ip);
    else ipRateLimits.set(ip, valid);
  }
}

/**
 * Rate limit check for /auth routes: max 10 requests per minute per IP
 */
function checkRateLimit(ip) {
  const now = Date.now();
  const timestamps = (ipRateLimits.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    ipRateLimits.set(ip, timestamps);
    return false; // Rate limit exceeded
  }
  timestamps.push(now);
  ipRateLimits.set(ip, timestamps);
  return true;
}

/**
 * Reset rate limit (useful for testing)
 */
function resetRateLimits() {
  ipRateLimits.clear();
  activeNonces.clear();
  activeSessions.clear();
}

/**
 * Parse an EIP-4361 SIWE formatted message
 */
function parseSiweMessage(message) {
  if (!message || typeof message !== "string") {
    throw new Error("Invalid SIWE message: empty or not a string");
  }

  // Regex according to EIP-4361 format
  const headerRegex = /^([^ \n]+) wants you to sign in with your Ethereum account:\n(0x[a-fA-F0-9]{40})\n\n(?:(.*)\n\n)?URI: ([^\n]+)\nVersion: ([^\n]+)\nChain ID: ([0-9]+)\nNonce: ([a-zA-Z0-9]+)\nIssued At: ([^\n]+)(?:\nExpiration Time: ([^\n]+))?(?:\nNot Before: ([^\n]+))?(?:\nRequest ID: ([^\n]+))?/;
  const match = message.match(headerRegex);

  if (!match) {
    throw new Error("Invalid EIP-4361 message format");
  }

  return {
    domain: match[1],
    address: ethers.getAddress(match[2]),
    statement: match[3] || "",
    uri: match[4],
    version: match[5],
    chainId: parseInt(match[6], 10),
    nonce: match[7],
    issuedAt: match[8],
    expirationTime: match[9] || null,
    notBefore: match[10] || null,
    requestId: match[11] || null
  };
}

/**
 * Format an EIP-4361 SIWE message
 */
function formatSiweMessage({
  domain,
  address,
  statement = "Sign in to ChainCustody",
  uri,
  version = "1",
  chainId,
  nonce,
  issuedAt = new Date().toISOString(),
  expirationTime = null
}) {
  let msg = `${domain} wants you to sign in with your Ethereum account:\n${ethers.getAddress(address)}\n\n`;
  if (statement) msg += `${statement}\n\n`;
  msg += `URI: ${uri}\nVersion: ${version}\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
  if (expirationTime) msg += `\nExpiration Time: ${expirationTime}`;
  return msg;
}

/**
 * Verify SIWE message and signature
 */
async function verifySiwe({ message, signature, expectedDomain, expectedChainId }) {
  const parsed = parseSiweMessage(message);

  // 1. Verify cryptographic signature
  const recoveredAddress = ethers.verifyMessage(message, signature);
  if (ethers.getAddress(recoveredAddress) !== parsed.address) {
    throw new Error("Signature does not match message address");
  }

  // 2. Verify domain (allow host with or without port)
  if (expectedDomain) {
    const cleanExpected = expectedDomain.split(":")[0].toLowerCase();
    const cleanActual = parsed.domain.split(":")[0].toLowerCase();
    if (cleanExpected !== cleanActual && parsed.domain !== expectedDomain) {
      throw new Error(`Domain mismatch: expected ${expectedDomain}, got ${parsed.domain}`);
    }
  }

  // 3. Verify Chain ID if specified
  if (expectedChainId !== undefined && expectedChainId !== null) {
    if (Number(parsed.chainId) !== Number(expectedChainId)) {
      throw new Error(`Chain ID mismatch: expected ${expectedChainId}, got ${parsed.chainId}`);
    }
  }

  // 4. Verify Nonce (must be valid, within 5 minutes, single-use)
  if (!consumeNonce(parsed.nonce)) {
    throw new Error("Nonce is invalid, expired, or already used");
  }

  // 5. Verify Expiration Time
  if (parsed.expirationTime) {
    const exp = new Date(parsed.expirationTime).getTime();
    if (isNaN(exp) || Date.now() > exp) {
      throw new Error("SIWE message has expired");
    }
  }

  // 6. Verify Not Before
  if (parsed.notBefore) {
    const nb = new Date(parsed.notBefore).getTime();
    if (!isNaN(nb) && Date.now() < nb) {
      throw new Error("SIWE message cannot be used before " + parsed.notBefore);
    }
  }

  return { ok: true, address: parsed.address, parsed };
}

/**
 * Create a session for an authenticated address
 */
function createSession(address) {
  const sessionId = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  const session = {
    address: ethers.getAddress(address),
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS
  };
  activeSessions.set(sessionId, session);
  return { sessionId, session };
}

/**
 * Validate and get session by ID
 */
function getSession(sessionId) {
  if (!sessionId) return null;
  const session = activeSessions.get(sessionId);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(sessionId);
    return null;
  }
  return session;
}

/**
 * Invalidate a session
 */
function destroySession(sessionId) {
  if (!sessionId) return false;
  return activeSessions.delete(sessionId);
}

/**
 * Extract session ID from Cookie header
 */
function parseSessionCookie(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== "string") return null;
  const match = cookieHeader.match(/(?:^|;\s*)cc_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Generate Set-Cookie string for a session
 */
function formatSessionCookie(sessionId, isSecure = false) {
  let cookie = `cc_session=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=1800`;
  if (isSecure) cookie += "; Secure";
  return cookie;
}

/**
 * Generate Set-Cookie string to clear session
 */
function formatClearCookie(isSecure = false) {
  let cookie = "cc_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0";
  if (isSecure) cookie += "; Secure";
  return cookie;
}

/**
 * Read role directly from contract
 */
async function getRoleFromContract(address, rpcUrl, contractAddress, providerOverride = null) {
  if (!address || (!rpcUrl && !providerOverride) || !contractAddress) {
    return { role: 0, roleName: "None" };
  }
  try {
    let provider = providerOverride;
    if (!provider) {
      provider = typeof rpcUrl === "string" ? new ethers.JsonRpcProvider(rpcUrl) : rpcUrl;
    }
    const contract = new ethers.Contract(
      contractAddress,
      ["function roleOf(address) view returns (uint8)"],
      provider
    );
    const roleNum = Number(await contract.roleOf(address));
    return {
      role: roleNum,
      roleName: ROLE_NAMES[roleNum] || "Unknown"
    };
  } catch (err) {
    return { role: 0, roleName: "None", error: err.message };
  }
}

module.exports = {
  NONCE_TTL_MS,
  SESSION_TTL_MS,
  ROLE_NAMES,
  generateNonce,
  consumeNonce,
  checkRateLimit,
  resetRateLimits,
  pruneExpired,
  parseSiweMessage,
  formatSiweMessage,
  verifySiwe,
  createSession,
  getSession,
  destroySession,
  parseSessionCookie,
  formatSessionCookie,
  formatClearCookie,
  getRoleFromContract
};
