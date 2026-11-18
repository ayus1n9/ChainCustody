const { expect } = require("chai");
const { createServer, startServer } = require("../scripts/server");

describe("Demo Mode Separation", () => {
  const origEnv = process.env.DEMO_MODE;
  const origHost = process.env.HOST;

  afterEach(() => {
    process.env.DEMO_MODE = origEnv;
    process.env.HOST = origHost;
  });

  it("defaults to DEMO_MODE=false when unset", async () => {
    delete process.env.DEMO_MODE;
    const server = createServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/config`);
      const data = await res.json();
      expect(data.demoMode).to.be.false;
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("reports DEMO_MODE=true when DEMO_MODE=true", async () => {
    process.env.DEMO_MODE = "true";
    const server = createServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/config`);
      const data = await res.json();
      expect(data.demoMode).to.be.true;
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("forces host binding to 127.0.0.1 when DEMO_MODE=true even if HOST is 0.0.0.0", async () => {
    process.env.DEMO_MODE = "true";
    process.env.HOST = "0.0.0.0";
    const server = startServer(0, "0.0.0.0");
    await new Promise((resolve) => {
      if (server.listening) return resolve();
      server.on("listening", resolve);
    });

    try {
      const addr = server.address();
      expect(addr.address).to.equal("127.0.0.1");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
