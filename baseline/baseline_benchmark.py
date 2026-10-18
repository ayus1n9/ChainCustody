"""
Baseline implementations of EXISTING chain-of-custody approaches + benchmark.

Baseline A: Centralized evidence store (SQLite metadata + files on disk, admin-controlled)
Baseline B: Hash-chained append-only ledger, single node (Forensic-chain style)

Run:    python3 baseline_benchmark.py      (needs: pip install cryptography)
Output: results.json  (comparative baseline benchmark for centralized vs decentralized audit trails)
"""
import hashlib, json, os, platform, sqlite3, statistics, tempfile, time, random
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import cryptography

SIZES = {"1 KB": 1024, "100 KB": 100 * 1024, "1 MB": 1024**2, "10 MB": 10 * 1024**2, "50 MB": 50 * 1024**2}
FILES_PER_BUCKET, TRIALS = 5, 5
CHAIN_LENGTHS = [100, 1000, 10000, 100000]
SCENARIO_RUNS = 1000
sha = lambda b: hashlib.sha256(b).hexdigest()

# ---------------- Baseline A: centralized store ----------------
class CentralStore:
    def __init__(self, folder):
        self.folder = folder
        self.db = sqlite3.connect(":memory:")
        self.db.execute("CREATE TABLE evidence(id INTEGER PRIMARY KEY, path TEXT, sha TEXT)")
        self.db.execute("CREATE TABLE audit(id INTEGER PRIMARY KEY, event TEXT)")
    def add(self, i, data):
        p = os.path.join(self.folder, f"e{i}.bin")
        open(p, "wb").write(data)
        self.db.execute("INSERT INTO evidence VALUES(?,?,?)", (i, p, sha(data)))
        self.db.execute("INSERT INTO audit(event) VALUES(?)", (f"add {i}",))
    def verify(self, i):
        p, h = self.db.execute("SELECT path, sha FROM evidence WHERE id=?", (i,)).fetchone()
        return sha(open(p, "rb").read()) == h          # True = intact
    def admin_update_hash(self, i, new_hash):
        self.db.execute("UPDATE evidence SET sha=? WHERE id=?", (new_hash, i))

# ---------------- Baseline B: hash-chained ledger (single node) ----------------
class Ledger:
    def __init__(self):
        self.blocks = []
    @staticmethod
    def _bh(idx, prev, ev, actor):
        return sha(f"{idx}|{prev}|{ev}|{actor}".encode())
    def append(self, evidence_hash, actor="lab"):
        prev = self.blocks[-1]["hash"] if self.blocks else "0" * 64
        idx = len(self.blocks)
        self.blocks.append({"idx": idx, "prev": prev, "ev": evidence_hash, "actor": actor,
                            "hash": self._bh(idx, prev, evidence_hash, actor)})
    def verify_chain(self):
        prev = "0" * 64
        for b in self.blocks:
            if b["prev"] != prev or b["hash"] != self._bh(b["idx"], b["prev"], b["ev"], b["actor"]):
                return False
            prev = b["hash"]
        return True
    def rewrite_all(self):                             # single admin recomputes every link
        prev = "0" * 64
        for b in self.blocks:
            b["prev"] = prev
            b["hash"] = self._bh(b["idx"], prev, b["ev"], b["actor"])
            prev = b["hash"]

def rnd(n=4096): return os.urandom(n)

def scenarios():
    res = {"central": {}, "ledger": {}}
    tmp = tempfile.mkdtemp()
    # A-S1 file altered only
    d = a = 0
    for k in range(SCENARIO_RUNS):
        s = CentralStore(tmp); s.add(k, rnd()); open(s.db.execute("SELECT path FROM evidence").fetchone()[0], "ab").write(b"x")
        d += (not s.verify(k))
    res["central"]["S1 Evidence file altered"] = d / SCENARIO_RUNS
    # A-S2 admin alters file AND updates stored hash
    d = 0
    for k in range(SCENARIO_RUNS):
        s = CentralStore(tmp); s.add(k, rnd()); p = s.db.execute("SELECT path FROM evidence").fetchone()[0]
        new = rnd(); open(p, "wb").write(new); s.admin_update_hash(k, sha(new))
        d += (not s.verify(k))
    res["central"]["S2 Admin alters file + stored hash"] = d / SCENARIO_RUNS
    # A-S3 admin deletes an audit row -> no integrity mechanism exists to notice
    res["central"]["S3 Admin deletes audit record"] = 0.0   # no verification mechanism exists; nothing can flag it

    # Ledger scenarios
    def mk(n=20):
        L = Ledger(); files = [rnd() for _ in range(n)]
        for f in files: L.append(sha(f))
        return L, files
    d = 0
    for _ in range(SCENARIO_RUNS):
        L, files = mk(); files[3] += b"x"
        d += (sha(files[3]) != L.blocks[3]["ev"])
    res["ledger"]["S1 Evidence file altered"] = d / SCENARIO_RUNS
    d = 0
    for _ in range(SCENARIO_RUNS):
        L, files = mk(); files[3] += b"x"; L.blocks[3]["ev"] = sha(files[3])   # edit ledger entry
        d += (not L.verify_chain())
    res["ledger"]["S2 Admin alters file + ledger entry"] = d / SCENARIO_RUNS
    d = 0
    for _ in range(SCENARIO_RUNS):
        L, _f = mk(); del L.blocks[random.randint(1, 15)]
        d += (not L.verify_chain())
    res["ledger"]["S3 Admin deletes audit record"] = d / SCENARIO_RUNS
    d = 0
    for _ in range(SCENARIO_RUNS):
        L, files = mk(); files[3] += b"x"; L.blocks[3]["ev"] = sha(files[3]); L.rewrite_all()
        d += (not L.verify_chain())
    res["ledger"]["S4 Admin rewrites entire chain (single node)"] = d / SCENARIO_RUNS
    d = 0
    for _ in range(SCENARIO_RUNS):
        L, files = mk(); anchor = L.blocks[-1]["hash"]                 # head hash held by an independent party
        files[3] += b"x"; L.blocks[3]["ev"] = sha(files[3]); L.rewrite_all()
        d += (L.blocks[-1]["hash"] != anchor)
    res["ledger"]["S5 Full rewrite, head hash anchored by 2nd party"] = d / SCENARIO_RUNS
    return res

def perf():
    out = {}
    key = AESGCM.generate_key(bit_length=256); aes = AESGCM(key)
    for name, size in SIZES.items():
        sh, en, de = [], [], []
        for _ in range(TRIALS):
            for _f in range(FILES_PER_BUCKET):
                data = os.urandom(size); nonce = os.urandom(12)
                t = time.perf_counter(); sha(data); sh.append((time.perf_counter() - t) * 1e3)
                t = time.perf_counter(); ct = aes.encrypt(nonce, data, None); en.append((time.perf_counter() - t) * 1e3)
                t = time.perf_counter(); aes.decrypt(nonce, ct, None); de.append((time.perf_counter() - t) * 1e3)
        f = lambda x: {"mean": statistics.mean(x), "std": statistics.pstdev(x)}
        out[name] = {"bytes": size, "sha256_ms": f(sh), "aes_enc_ms": f(en), "aes_dec_ms": f(de)}
    return out

def chain_scaling():
    out = {}
    for n in CHAIN_LENGTHS:
        L = Ledger(); t = time.perf_counter()
        for i in range(n): L.append(sha(str(i).encode()))
        app = (time.perf_counter() - t) / n * 1e6
        ts = []
        for _ in range(TRIALS):
            t = time.perf_counter(); assert L.verify_chain(); ts.append((time.perf_counter() - t) * 1e3)
        out[str(n)] = {"verify_ms": statistics.mean(ts), "verify_std": statistics.pstdev(ts), "append_us": app}
    return out

def env():
    cpu = next((l.split(":")[1].strip() for l in open("/proc/cpuinfo") if "model name" in l), platform.processor())
    mem = next((int(l.split()[1]) / 1e6 for l in open("/proc/meminfo") if l.startswith("MemTotal")), 0)
    return {"python": platform.python_version(), "os": platform.platform(), "cpu": cpu,
            "cores": os.cpu_count(), "ram_gb": round(mem, 1), "cryptography": cryptography.__version__}

if __name__ == "__main__":
    random.seed(7)
    r = {"env": env(), "scenarios": scenarios(), "perf": perf(), "chain": chain_scaling(),
         "config": {"files_per_bucket": FILES_PER_BUCKET, "trials": TRIALS, "scenario_runs": SCENARIO_RUNS}}
    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results.json")
    json.dump(r, open(out_path, "w"), indent=2)
    print(json.dumps(r, indent=2))
