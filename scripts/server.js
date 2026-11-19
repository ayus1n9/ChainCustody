// Hardened Node.js server for ChainCustody with SIWE Auth, Role Resolution & Security Headers
require("dotenv").config();
const http = require("http");
const fs = require("fs");
const path = require("path");
const auth = require("./auth");
const witness = require("./witness");

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "..", "frontend");
const NODE_MODULES_DIR = path.join(__dirname, "..", "node_modules");

// Resolve contract address if available
function getContractAddress() {
  if (process.env.CHAINCUSTODY_ADDRESS) {
    return process.env.CHAINCUSTODY_ADDRESS;
  }
  const deployDir = path.join(__dirname, "..", "deployments");
  const candidates = ["localhost.json", "hardhat.json", "amoy.json"];
  for (const c of candidates) {
    const p = path.join(deployDir, c);
    if (fs.existsSync(p)) {
      try {
        const data = JSON.parse(fs.readFileSync(p, "utf8"));
        if (data.address) return data.address;
      } catch (e) {}
    }
  }
  return null;
}

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, data, headers = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    ...headers
  });
  res.end(JSON.stringify(data));
}

function getClientIp(req) {
  if (req.headers["x-forwarded-for"]) {
    return req.headers["x-forwarded-for"].split(",")[0].trim();
  }
  return req.socket.remoteAddress || "127.0.0.1";
}

function isRequestSecure(req) {
  return Boolean(req.socket.encrypted || req.headers["x-forwarded-proto"] === "https");
}

function setSecurityHeaders(res, rpcUrl = "http://127.0.0.1:8545") {
  // Content Security Policy
  const rpcConnect = rpcUrl ? ` ${rpcUrl.replace(/\/$/, "")}` : "";
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'${rpcConnect} ws: http:; img-src 'self' data:; frame-ancestors 'none';`
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
}

function createServer(options = {}) {
  const isDemoMode = process.env.DEMO_MODE === "true";
  const rpcUrl = options.rpcUrl || process.env.RPC_URL || "http://127.0.0.1:8545";
  const contractAddress = options.contractAddress || getContractAddress();
  const provider = options.provider || null;

  const server = http.createServer(async (req, res) => {
    const rawUrl = req.url.split("?")[0];
    const clientIp = getClientIp(req);
    const isSecure = isRequestSecure(req);

    // Apply security headers
    setSecurityHeaders(res, rpcUrl);

    // ------------------------------------------------------------- Auth Routes
    if (rawUrl.startsWith("/auth/")) {
      // Rate limiting: 10 req/min per IP
      if (!auth.checkRateLimit(clientIp)) {
        return sendJson(res, 429, { error: "Too many requests. Rate limit is 10 requests per minute." }, {
          "Retry-After": "60"
        });
      }

      // 1. GET /auth/nonce
      if (req.method === "GET" && rawUrl === "/auth/nonce") {
        const nonce = auth.generateNonce(clientIp);
        return sendJson(res, 200, { nonce });
      }

      // 2. POST /auth/verify
      if (req.method === "POST" && rawUrl === "/auth/verify") {
        try {
          const body = await parseJsonBody(req);
          const { message, signature } = body;
          if (!message || !signature) {
            return sendJson(res, 400, { error: "Missing message or signature" });
          }

          const verifyRes = await auth.verifySiwe({
            message,
            signature,
            expectedDomain: req.headers.host
          });

          // Create session
          const { sessionId } = auth.createSession(verifyRes.address);
          const cookieHeader = auth.formatSessionCookie(sessionId, isSecure);

          // Resolve role from contract
          const roleInfo = await auth.getRoleFromContract(verifyRes.address, rpcUrl, contractAddress, provider);

          return sendJson(res, 200, {
            ok: true,
            address: verifyRes.address,
            role: roleInfo.role,
            roleName: roleInfo.roleName
          }, {
            "Set-Cookie": cookieHeader
          });
        } catch (err) {
          return sendJson(res, 400, { error: err.message || "SIWE verification failed" });
        }
      }

      // 3. POST /auth/logout
      if (req.method === "POST" && rawUrl === "/auth/logout") {
        const sessionId = auth.parseSessionCookie(req.headers.cookie);
        if (sessionId) {
          auth.destroySession(sessionId);
        }
        return sendJson(res, 200, { ok: true }, {
          "Set-Cookie": auth.formatClearCookie(isSecure)
        });
      }

      // 4. GET /auth/session (read current session and role from contract)
      if (req.method === "GET" && (rawUrl === "/auth/session" || rawUrl === "/auth/me")) {
        const sessionId = auth.parseSessionCookie(req.headers.cookie);
        const session = auth.getSession(sessionId);
        if (!session) {
          return sendJson(res, 401, { authenticated: false });
        }

        const roleInfo = await auth.getRoleFromContract(session.address, rpcUrl, contractAddress, provider);
        return sendJson(res, 200, {
          authenticated: true,
          address: session.address,
          role: roleInfo.role,
          roleName: roleInfo.roleName
        });
      }

      return sendJson(res, 404, { error: "Auth endpoint not found" });
    }

    // ------------------------------------------------------------- Config API
    if (req.method === "GET" && rawUrl === "/api/config") {
      return sendJson(res, 200, {
        demoMode: isDemoMode,
        rpcUrl,
        contractAddress: contractAddress || null
      });
    }

    // ------------------------------------------------------------- Witness Status API
    if (req.method === "GET" && rawUrl === "/api/witness/status") {
      try {
        const custodyProvider = provider || new (require("ethers").JsonRpcProvider)(rpcUrl);
        const witnessStatus = await witness.verifyWitnessStatus(custodyProvider, options.witnessContract || null, {
          chainTag: options.chainTag || witness.CHAIN_TAG,
          k: options.witnessK || witness.WITNESS_K
        });
        return sendJson(res, 200, witnessStatus);
      } catch (err) {
        return sendJson(res, 200, {
          available: false,
          verified: false,
          statusText: "Witness: Unverified"
        });
      }
    }

    // ------------------------------------------------------------- Serve Local Ethers
    if (rawUrl === "/js/ethers.umd.min.js") {
      const ethersPath = path.join(NODE_MODULES_DIR, "ethers", "dist", "ethers.umd.min.js");
      if (fs.existsSync(ethersPath)) {
        res.writeHead(200, { "Content-Type": "application/javascript" });
        return fs.createReadStream(ethersPath).pipe(res);
      }
    }

    // ------------------------------------------------------------- Path Traversal Check
    let decodedUrl;
    try {
      decodedUrl = decodeURIComponent(rawUrl);
    } catch (e) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      return res.end("400 Bad Request");
    }

    if (decodedUrl.includes("..") || rawUrl.includes("..")) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      return res.end("403 Forbidden");
    }

    // ------------------------------------------------------------- Static Files
    let safeUrl = decodedUrl;
    if (safeUrl === "/") safeUrl = "/index.html";
    const filePath = path.normalize(path.join(PUBLIC_DIR, safeUrl));

    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      return res.end("403 Forbidden");
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        if (err.code === "ENOENT") {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("404 Not Found");
        } else {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("500 Internal Server Error");
        }
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": contentType });
      res.end(data);
    });
  });

  return server;
}

function startServer(port = PORT, host = HOST) {
  const isDemo = process.env.DEMO_MODE === "true";
  // In demo mode, force listen on 127.0.0.1 only
  const bindHost = isDemo ? "127.0.0.1" : host;

  const server = createServer();
  server.listen(port, bindHost, () => {
    console.log(`\n======================================================`);
    console.log(`ChainCustody Web Dashboard running at:`);
    console.log(`    http://${bindHost}:${port}`);
    console.log(`    Mode: ${isDemo ? "DEMO SIMULATION (127.0.0.1 only)" : "PRODUCTION (SIWE Wallet Auth)"}`);
    console.log(`======================================================\n`);
  });
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createServer,
  startServer,
  getContractAddress,
  PORT,
  HOST
};
