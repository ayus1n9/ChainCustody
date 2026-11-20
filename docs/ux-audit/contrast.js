// WCAG 2.x contrast for every text/background pair used by ChainCustody's dashboard.
// Reads the real :root tokens from frontend/style.css (read-only), resolves var() aliases,
// composites alpha backgrounds over their actual parent stack, prints a markdown table.
// Usage (from the repo root): node docs/ux-audit/contrast.js [path/to/style.css]
const fs = require("fs");
const cssPath = process.argv[2] || "frontend/style.css";
const css = fs.readFileSync(cssPath, "utf8");
const root = css.match(/:root\s*{([\s\S]*?)}/)[1];
const tok = {};
for (const m of root.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) tok[m[1]] = m[2].trim();

function resolve(v, depth = 0) {
  if (depth > 10) throw new Error("var loop " + v);
  const m = v.match(/^var\(--([\w-]+)\)$/);
  if (m) {
    if (!(m[1] in tok)) throw new Error("undefined token --" + m[1]);
    return resolve(tok[m[1]], depth + 1);
  }
  return v;
}
function parse(c) {
  c = resolve(c.trim());
  let m;
  if ((m = c.match(/^#([0-9a-f]{6})$/i))) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  if ((m = c.match(/^#([0-9a-f]{3})$/i))) {
    return [...m[1]].map(h => parseInt(h + h, 16)).concat(1);
  }
  if ((m = c.match(/^rgba?\(([^)]+)\)$/))) {
    const p = m[1].split(",").map(s => parseFloat(s));
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  throw new Error("cannot parse " + c);
}
// composite list bottom-first; first must be opaque
function stack(list) {
  let [r, g, b] = parse(list[0]);
  for (const c of list.slice(1)) {
    const [r2, g2, b2, a] = parse(c);
    r = r2 * a + r * (1 - a); g = g2 * a + g * (1 - a); b = b2 * a + b * (1 - a);
  }
  return [r, g, b];
}
function withOpacity(fgRgb, bgRgb, o) { return fgRgb.map((v, i) => v * o + bgRgb[i] * (1 - o)); }
function lum([r, g, b]) {
  const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a, b) { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }
const hex = rgb => "#" + rgb.map(v => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();

// Background stacks (bottom-first)
const PAGE = ["var(--bg-dark)"];
const HEADER = [...PAGE, "rgba(25, 38, 51, 0.95)"];                // style.css:77
const CARD = ["var(--bg-card)"];
const INPUT = ["var(--bg-input)"];                                  // file-details / comparison-box / timeline-item
const DROP = [...CARD, "rgba(19, 28, 38, 0.6)"];                    // style.css:343
const HASH_IN_INPUT = [...INPUT, "rgba(0, 0, 0, 0.35)"];            // style.css:400
const HASH_IN_CARD = [...CARD, "rgba(0, 0, 0, 0.35)"];              // council list (item bg var(--bg-elevated) undefined -> transparent)
const PERM = [...CARD, "rgba(0, 0, 0, 0.25)"];                      // style.css:646
const TAMPER_RES = [...CARD, "rgba(0, 0, 0, 0.4)"];                 // style.css:774
const PROV = [...CARD, "rgba(25, 38, 51, 0.4)"];                    // index.html:162 inline
const DEF = [...CARD, "rgba(255, 255, 255, 0.04)"];                 // style.css:783
const CARD_BADGE = [...CARD, "rgba(177, 138, 96, 0.15)"];           // style.css:323
const S = "var(--success-bg)", D = "var(--danger-bg)", W = "var(--warning-bg)";

// [label, fg, bgStack, where, size]  size: N normal (4.5), L large (3), X non-text (3)
const pairs = [
  ["Body text on page", "var(--text-main)", PAGE, "style.css:66", "N"],
  ["Body text on card (h3, stat values, inputs labels' values)", "var(--text-main)", CARD, "style.css:202,306", "N"],
  ["h1 on header", "var(--text-main)", HEADER, "style.css:96", "L"],
  ["Input text on --bg-input", "var(--text-main)", INPUT, "style.css:602-603", "N"],
  ["Event tag on --bg-card-hover", "var(--text-main)", ["var(--bg-card-hover)"], "style.css:982-983", "N"],
  ["Subtitle (muted) on header", "var(--text-muted)", HEADER, "style.css:101", "N"],
  ["Muted on page (panel-desc, select-wrapper label)", "var(--text-muted)", PAGE, "style.css:277,621", "N"],
  ["Muted on card (card-desc, form labels, btn-outline, tab-btn idle)", "var(--text-muted)", CARD, "style.css:312,541,598", "N"],
  ["Muted on --bg-input (hash-label, timeline-desc, persona label)", "var(--text-muted)", INPUT, "style.css:123,427,728", "N"],
  ["Muted on defense-badge", "var(--text-muted)", DEF, "style.css:782-783", "N"],
  ["Dim on card (stat-label, 'No active proposals', council meta)", "var(--text-dim)", CARD, "style.css:196; index.html:512; app.js:770", "N"],
  ["Dim on --bg-input (timeline-meta: block, time, Tx)", "var(--text-dim)", INPUT, "style.css:712", "N"],
  ["Dim on drop zone (file-hint)", "var(--text-dim)", DROP, "style.css:369", "N"],
  ["Dim on tamper-result ('Status: Ready to test')", "var(--text-dim)", TAMPER_RES, "style.css:775", "N"],
  ["Primary on card (stat-sub, Layer N, active tab, viewer h4)", "var(--primary)", CARD, "style.css:207,242,753; index.html:184", "N"],
  ["Primary on page (n/a check)", "var(--primary)", PAGE, "-", "N"],
  ["Primary on drop zone ('[ SELECT ... ]', 'browse')", "var(--primary)", DROP, "style.css:355,361", "N"],
  ["Primary hash-code in --bg-input", "var(--primary)", HASH_IN_INPUT, "style.css:400-403", "N"],
  ["Primary hash-code on card (council list)", "var(--primary)", HASH_IN_CARD, "app.js:766", "N"],
  ["Primary on card-badge tint", "var(--primary)", CARD_BADGE, "style.css:323-324", "N"],
  ["Primary '(Custodian)' on permission row", "var(--primary)", PERM, "app.js:669", "N"],
  ["Success on card (Legal Status ACTIVE, toast success)", "var(--success)", CARD, "index.html:92; style.css:814", "L"],
  ["Success toast text (0.875rem) on card", "var(--success)", CARD, "style.css:804,814", "N"],
  ["Success on tint in header (mode badge, witness verified)", "var(--success)", [...HEADER, S], "style.css:141-143,930-932", "N"],
  ["Success on tint on card (seal-banner unsealed, retention card-badge)", "var(--success)", [...CARD, S], "style.css:846-849; index.html:358", "N"],
  ["Success status-indicator ACTIVE inside unsealed banner", "var(--success)", [...CARD, S, S], "style.css:953-955", "N"],
  ["Success on tint in comparison box (result-box verified)", "var(--success)", [...INPUT, S], "style.css:446-449", "N"],
  ["Success VERIFIED badge inside verified result-box", "var(--success)", [...INPUT, S, S], "style.css:468-470", "N"],
  ["Success GRANTED badge on permission row", "var(--success)", [...PERM, S], "style.css:652-656", "N"],
  ["Danger on card (btn-outline-danger, toast error, EXPUNGED)", "var(--danger)", CARD, "style.css:552,815; app.js:638", "N"],
  ["Danger on tint in header (Witness: Unverified - seen at runtime)", "var(--danger)", [...HEADER, D], "style.css:936-939", "N"],
  ["Danger on tint in comparison box (result-box tampered)", "var(--danger)", [...INPUT, D], "style.css:452-455", "N"],
  ["Danger TAMPER DETECTED badge inside tampered result-box", "var(--danger)", [...INPUT, D, D], "style.css:474-477", "N"],
  ["Danger NO ACCESS badge on permission row", "var(--danger)", [...PERM, D], "style.css:661-665", "N"],
  ["Danger on tint on card (disposal card-badge, disposed banner)", "var(--danger)", [...CARD, D], "index.html:335; style.css:875", "N"],
  ["Danger REJECTED text in tamper-result", "var(--danger)", TAMPER_RES, "app.js:1549,1556,1563", "N"],
  ["Warning on card (register h4, Legal SEALED)", "var(--warning)", CARD, "index.html:224; app.js:642", "N"],
  ["Warning provenance h4 on inline tint", "var(--warning)", PROV, "index.html:162-163", "N"],
  ["Warning on tint on card (Court Order card-badge, sealed banner, PENDING)", "var(--warning)", [...CARD, W], "index.html:313; style.css:852; app.js:747", "N"],
  ["Warning status-indicator inside sealed/pending banner", "var(--warning)", [...CARD, W, W], "style.css:959-969", "N"],
  ["Warning not-registered banner on page", "var(--warning)", [...PAGE, W], "style.css:905-907", "N"],
  ["#131C26 on --warning (sim banner, btn-warning)", "#131C26", ["var(--warning)"], "style.css:893-894,825-826", "N"],
  ["#131C26 on #d4ae6d (btn-warning:hover)", "#131C26", ["#d4ae6d"], "style.css:831", "N"],
  ["#131C26 on --primary (btn-primary)", "#131C26", ["var(--primary)"], "style.css:518-519", "N"],
  ["#131C26 on --primary-hover", "#131C26", ["var(--primary-hover)"], "style.css:524", "N"],
  ["#131C26 on --success (btn-success Grant Access)", "#131C26", ["var(--success)"], "style.css:560-561", "N"],
  ["#fff on --danger (btn-danger Revoke, btn-danger-shred)", "#ffffff", ["var(--danger)"], "style.css:566-567,882-883", "N"],
  ["#fff on #a8625b (btn-danger-shred:hover)", "#ffffff", ["#a8625b"], "style.css:888", "N"],
  ["Muted on toast info? (toast info uses text-main) on card", "var(--text-main)", CARD, "style.css:816", "N"],
];

// Non-text (WCAG 1.4.11, 3:1)
const nontext = [
  ["Field edge --border vs --bg-input (inside)", "var(--border)", INPUT, "style.css:603"],
  ["Field edge --border vs card (outside)", "var(--border)", CARD, "style.css:603"],
  ["Focus edge --border-focus vs card (only focus cue on .input-field)", "var(--border-focus)", CARD, "style.css:608,613"],
  ["Focus edge change: --border-focus vs --border (state change)", "var(--border-focus)", ["var(--border)"], "style.css:613"],
  ["Drop-zone dashed edge vs card", "var(--border)", CARD, "style.css:337"],
  ["Active tab top bar --primary vs page", "var(--primary)", PAGE, "style.css:244"],
  ["Active tab fill card vs page (only other active cue)", "var(--bg-card)", PAGE, "style.css:243"],
  ["Pulse dot --success vs mode-badge tint", "var(--success)", [...HEADER, S], "style.css:153"],
  ["Timeline dot --primary vs --bg-input", "var(--primary)", INPUT, "style.css:704"],
];

const rows = [];
for (const [label, fg, bg, where, size] of pairs) {
  const b = stack(bg); const f = stack([...bg, fg]);
  const r = ratio(f, b); const need = size === "L" ? 3 : 4.5;
  rows.push(`| ${label} | ${hex(f)} | ${hex(b)} | ${r.toFixed(2)} | ${need} | ${r >= need ? "pass" : "**FAIL**"} | ${where} |`);
}
console.log("### Text (1.4.3)\n\n| pair | fg | bg (composited) | ratio | need | result | where |\n|---|---|---|---|---|---|---|");
console.log(rows.join("\n"));

const nrows = [];
for (const [label, fg, bg, where] of nontext) {
  const b = stack(bg); const f = stack([...bg, fg]); const r = ratio(f, b);
  nrows.push(`| ${label} | ${hex(f)} | ${hex(b)} | ${r.toFixed(2)} | 3 | ${r >= 3 ? "pass" : "**FAIL**"} | ${where} |`);
}
console.log("\n### Non-text (1.4.11)\n\n| pair | mark | bg | ratio | need | result | where |\n|---|---|---|---|---|---|---|");
console.log(nrows.join("\n"));

// Disabled (opacity .5, style.css:512-513) - exempt from 1.4.3 but shows legibility of the explanation-less disabled buttons
const dis = [
  ["Disabled btn-outline (Unseal, Cancel Proposal, Release Hold)", "var(--text-muted)", CARD, null],
  ["Disabled btn-danger-shred (Execute Key Shredding)", "#ffffff", CARD, "var(--danger)"],
  ["Disabled btn-primary lg (Encrypt & Anchor)", "#131C26", CARD, "var(--primary)"],
];
console.log("\n### Disabled buttons at opacity .5 (exempt from 1.4.3; informational)\n\n| button | fg | bg | ratio |\n|---|---|---|---|");
for (const [label, fg, parent, btnBg] of dis) {
  const p = stack(parent);
  const bgFull = btnBg ? stack([...parent, btnBg]) : p;
  const bg = withOpacity(bgFull, p, 0.5);
  const fgFull = stack([...parent, fg]);
  const f = withOpacity(fgFull, p, 0.5);
  console.log(`| ${label} | ${hex(f)} | ${hex(bg)} | ${ratio(f, bg).toFixed(2)} |`);
}
console.log("\nUndefined tokens referenced in app.js: --bg-elevated ->", "bg-elevated" in tok ? "defined" : "NOT DEFINED (inline background falls back to transparent)");
