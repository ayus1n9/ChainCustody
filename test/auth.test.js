const { expect } = require("chai");
const { ethers } = require("hardhat");
const http = require("http");
const auth = require("../scripts/auth");
const { createServer } = require("../scripts/server");

describe("SIWE Authentication & Server Hardening", function () {
  let server;
  let baseUrl;
  let port;
  let wallet;
  let chainCustody;

  before(async function () {
    const signers = await ethers.getSigners();
    wallet = signers[1]; // Test user wallet

    // Deploy ChainCustody to test role resolution
    chainCustody = await ethers.deployContract("ChainCustody");
    await chainCustody.waitForDeployment();
    // Register wallet as Investigator (Role = 1)
    await chainCustody.registerParty(wallet.address, 1);

    const contractAddress = await chainCustody.getAddress();
    server = createServer({
      contractAddress,
      provider: ethers.provider
    });

    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(function (done) {
    auth.resetRateLimits();
    server.close(done);
  });

  beforeEach(function () {
    auth.resetRateLimits();
  });

  function makeRequest(method, reqPath, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
      const reqHeaders = { ...headers };
      let payload = null;
      if (body) {
        payload = JSON.stringify(body);
        reqHeaders["Content-Type"] = "application/json";
        reqHeaders["Content-Length"] = Buffer.byteLength(payload);
      }
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: port,
          path: reqPath,
          method,
          headers: reqHeaders
        },
        (res) => {
          let resData = "";
          res.on("data", (chunk) => (resData += chunk));
          res.on("end", () => {
            let json = null;
            try {
              json = JSON.parse(resData);
            } catch (e) {}
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: json || resData
            });
          });
        }
      );
      req.on("error", reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  it("GET /auth/nonce returns a random nonce and sets rate limit tracking", async function () {
    const res = await makeRequest("GET", "/auth/nonce");
    expect(res.statusCode).to.equal(200);
    expect(res.body).to.have.property("nonce");
    expect(typeof res.body.nonce).to.equal("string");
    expect(res.body.nonce.length).to.be.at.least(16);
  });

  it("POST /auth/verify succeeds with valid SIWE signature and sets session cookie", async function () {
    const nonceRes = await makeRequest("GET", "/auth/nonce");
    const nonce = nonceRes.body.nonce;

    const domain = `127.0.0.1:${port}`;
    const message = auth.formatSiweMessage({
      domain,
      address: wallet.address,
      statement: "Sign in to ChainCustody",
      uri: `http://${domain}`,
      chainId: 31337,
      nonce
    });

    const signature = await wallet.signMessage(message);

    const verifyRes = await makeRequest("POST", "/auth/verify", {
      message,
      signature
    }, {
      host: domain
    });

    expect(verifyRes.statusCode).to.equal(200);
    expect(verifyRes.body.ok).to.equal(true);
    expect(verifyRes.body.address.toLowerCase()).to.equal(wallet.address.toLowerCase());
    expect(verifyRes.body.role).to.equal(1); // Investigator
    expect(verifyRes.body.roleName).to.equal("Investigator");

    // Check Set-Cookie
    const cookie = verifyRes.headers["set-cookie"];
    expect(cookie).to.be.an("array");
    const cookieStr = cookie[0];
    expect(cookieStr).to.include("cc_session=");
    expect(cookieStr).to.include("HttpOnly");
    expect(cookieStr).to.include("SameSite=Strict");
    expect(cookieStr).to.include("Max-Age=1800");
  });

  it("POST /auth/verify rejects replayed/reused nonce", async function () {
    const nonceRes = await makeRequest("GET", "/auth/nonce");
    const nonce = nonceRes.body.nonce;
    const domain = `127.0.0.1:${port}`;

    const message = auth.formatSiweMessage({
      domain,
      address: wallet.address,
      statement: "Sign in to ChainCustody",
      uri: `http://${domain}`,
      chainId: 31337,
      nonce
    });
    const signature = await wallet.signMessage(message);

    // First attempt succeeds
    const res1 = await makeRequest("POST", "/auth/verify", { message, signature }, { host: domain });
    expect(res1.statusCode).to.equal(200);

    // Second attempt fails because nonce was consumed
    const res2 = await makeRequest("POST", "/auth/verify", { message, signature }, { host: domain });
    expect(res2.statusCode).to.equal(400);
    expect(res2.body.error).to.include("Nonce");
  });

  it("POST /auth/verify rejects tampered message or invalid signature", async function () {
    const nonceRes = await makeRequest("GET", "/auth/nonce");
    const nonce = nonceRes.body.nonce;
    const domain = `127.0.0.1:${port}`;

    const message = auth.formatSiweMessage({
      domain,
      address: wallet.address,
      statement: "Sign in to ChainCustody",
      uri: `http://${domain}`,
      chainId: 31337,
      nonce
    });
    const signature = await wallet.signMessage(message);

    // Tamper message
    const tampered = message.replace("Sign in to ChainCustody", "Attacker message");
    const res = await makeRequest("POST", "/auth/verify", { message: tampered, signature }, { host: domain });
    expect(res.statusCode).to.equal(400);
  });

  it("GET /auth/session validates active session and POST /auth/logout destroys it", async function () {
    const nonceRes = await makeRequest("GET", "/auth/nonce");
    const domain = `127.0.0.1:${port}`;
    const message = auth.formatSiweMessage({
      domain,
      address: wallet.address,
      statement: "Sign in to ChainCustody",
      uri: `http://${domain}`,
      chainId: 31337,
      nonce: nonceRes.body.nonce
    });
    const signature = await wallet.signMessage(message);

    const verifyRes = await makeRequest("POST", "/auth/verify", { message, signature }, { host: domain });
    const cookieHeader = verifyRes.headers["set-cookie"][0].split(";")[0];

    // Check session
    const sessionRes = await makeRequest("GET", "/auth/session", null, { Cookie: cookieHeader });
    expect(sessionRes.statusCode).to.equal(200);
    expect(sessionRes.body.authenticated).to.equal(true);
    expect(sessionRes.body.address.toLowerCase()).to.equal(wallet.address.toLowerCase());
    expect(sessionRes.body.role).to.equal(1);

    // Logout
    const logoutRes = await makeRequest("POST", "/auth/logout", {}, { Cookie: cookieHeader });
    expect(logoutRes.statusCode).to.equal(200);
    expect(logoutRes.headers["set-cookie"][0]).to.include("Max-Age=0");

    // Session no longer valid
    const afterLogout = await makeRequest("GET", "/auth/session", null, { Cookie: cookieHeader });
    expect(afterLogout.statusCode).to.equal(401);
  });

  it("Enforces rate limiting on /auth routes (10 requests per minute)", async function () {
    const fakeIp = "192.168.1.100";
    for (let i = 0; i < 10; i++) {
      const res = await makeRequest("GET", "/auth/nonce", null, { "x-forwarded-for": fakeIp });
      expect(res.statusCode).to.equal(200);
    }

    // 11th request should be rate-limited
    const blockedRes = await makeRequest("GET", "/auth/nonce", null, { "x-forwarded-for": fakeIp });
    expect(blockedRes.statusCode).to.equal(429);
    expect(blockedRes.body.error).to.include("Too many requests");
    expect(blockedRes.headers["retry-after"]).to.equal("60");
  });

  it("Blocks path traversal attacks with 403 Forbidden", async function () {
    const res = await makeRequest("GET", "/../package.json");
    expect(res.statusCode).to.equal(403);
    const resEncoded = await makeRequest("GET", "/%2e%2e/package.json");
    expect(resEncoded.statusCode).to.equal(403);
  });

  it("Sets hardened security headers on responses", async function () {
    const res = await makeRequest("GET", "/index.html");
    expect(res.headers["x-content-type-options"]).to.equal("nosniff");
    expect(res.headers["referrer-policy"]).to.equal("no-referrer");
    expect(res.headers["x-frame-options"]).to.equal("DENY");
    expect(res.headers["content-security-policy"]).to.include("default-src 'self'");
    expect(res.headers["content-security-policy"]).to.include("frame-ancestors 'none'");
  });
});
