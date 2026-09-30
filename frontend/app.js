/**
 * ChainCustody Web Dashboard Engine
 * Browser-native Web Crypto API + Simulation & Web3 Provider Support
 */

// ---------------------------------------------------------------- Constants & Personas
const PERSONAS = {
  investigator: {
    role: "Investigator",
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    label: "👮 Police Investigator",
    badgeClass: "badge-investigator"
  },
  lab: {
    role: "Lab",
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    label: "🔬 Forensic Analyst",
    badgeClass: "badge-lab"
  },
  court: {
    role: "Court",
    address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    label: "⚖️ Court Magistrate / Judge",
    badgeClass: "badge-court"
  },
  defense: {
    role: "Defense",
    address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    label: "🛡️ Defense Counsel",
    badgeClass: "badge-defense"
  },
  outsider: {
    role: "None",
    address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4df",
    label: "👤 Unauthorized Outsider",
    badgeClass: "badge-outsider"
  }
};

const SAMPLE_TEXT = `DIGITAL FORENSIC EXAMINATION REPORT
Case: FIR-2026-0042 (Cyber Crime Unit)
Evidence: SanDisk Extreme SSD 1TB (Serial #SD-98214)
Seized from: Subject workstation at 10.0.4.12
Acquisition Hash: Verified unaltered
Status: INITIAL ACQUISITION COMPLETE
Date: 2026-09-30`;

const SAMPLE_TAMPERED = `DIGITAL FORENSIC EXAMINATION REPORT
Case: FIR-2026-0042 (Cyber Crime Unit)
Evidence: SanDisk Extreme SSD 1TB (Serial #SD-98214)
Seized from: Subject workstation at 10.0.4.12
Acquisition Hash: [MODIFIED BY ATTACKER]
Status: EVIDENCE PURGED
Date: 2026-09-30`;

// ---------------------------------------------------------------- State
let currentPersonaKey = "investigator";
let currentEvidenceId = 1;
let currentBlock = 18;

const state = {
  evidence: {
    1: {
      id: 1,
      title: "Disk Image - FIR-2026-0042 (Cyber Crime Unit)",
      fileHash: "0x90acf3be541bc1d27c273001ed756e4ed1eac3e6e14d16dcb484454038bccc68",
      cid: "sim-33e66ceb2ef22b66238d81ac98b15e478546b283d5a5747f3b89fa651f89",
      custodian: "investigator",
      registeredBy: "investigator",
      createdAtBlock: 6,
      isSealed: false,
      sealReason: "",
      isDisposed: false,
      disposalProposer: null,
      disposalReason: "",
      holdUntil: 0,
      holdReason: "",
      metadata: {
        deviceSerial: "SAMSUNG-980PRO-NVMe-1TB-SN5GANG0N10423",
        acquisitionTool: "FTK Imager v4.7.1.2 (Hardware Write-Blocker)",
        officerBadge: "DET-7749-CYBER",
        jurisdiction: "US-CA-SFO-CCU"
      },
      permissions: {
        investigator: true,
        lab: true,
        court: false,
        defense: false,
        outsider: false
      }
    }
  },
  auditTrail: [
    {
      block: 6,
      event: "EvidenceRegistered",
      by: "investigator",
      detail: "evidence registered by Investigator (hash 0x90acf3be...)",
      time: "2026-09-30 16:05:51"
    },
    {
      block: 6,
      event: "EvidenceMetadataAnchored",
      by: "investigator",
      detail: "Hardware Anchored: SAMSUNG-980PRO-NVMe-1TB-SN5GANG0N10423 | Tool: FTK Imager v4.7.1.2 | Officer: DET-7749-CYBER",
      time: "2026-09-30 16:05:51"
    },
    {
      block: 7,
      event: "AccessGranted",
      by: "investigator",
      to: "lab",
      detail: "Investigator granted access to Lab (AES key wrapped)",
      time: "2026-09-30 16:05:52"
    },
    {
      block: 8,
      event: "AccessLogged",
      by: "lab",
      detail: "Lab accessed and verified evidence integrity",
      time: "2026-09-30 16:05:53"
    }
  ]
};

// ---------------------------------------------------------------- Crypto Helpers
async function computeSha256(buffer) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return "0x" + hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function short(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

// ---------------------------------------------------------------- UI Updates
function toast(msg, type = "info") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = `toast show ${type}`;
  setTimeout(() => { el.className = "toast"; }, 4000);
}

function updatePersonaDisplay() {
  const p = PERSONAS[currentPersonaKey];
  document.getElementById("activeRoleDisplay").textContent = p.role;
  document.getElementById("activeAddressDisplay").textContent = short(p.address);

  // Update permissions display, seal banner, disposal, and hold controls
  renderAccessMatrix();
  renderAuditTrail();
  updateTopStats();
  updateSealControls();
  updateDisposalControls();
  updateHoldControls();
}

function updateHoldControls() {
  const ev = state.evidence[currentEvidenceId];
  if (!ev) return;

  const banner = document.getElementById("holdStatusBanner");
  const icon = document.getElementById("holdStatusIcon");
  const text = document.getElementById("holdStatusText");
  const btnPlace = document.getElementById("btnPlaceHold");
  const btnRelease = document.getElementById("btnReleaseHold");
  if (!banner) return;

  const nowSec = Math.floor(Date.now() / 1000);
  const isHoldActive = ev.holdUntil && ev.holdUntil > nowSec;

  if (ev.isDisposed) {
    banner.className = "seal-banner disposed";
    icon.textContent = "🔥";
    text.textContent = "Status: Evidence Expunged (Holds Irrelevant)";
    btnPlace.disabled = true;
    btnRelease.disabled = true;
  } else if (isHoldActive) {
    banner.className = "seal-banner sealed";
    icon.textContent = "⏳";
    const dateStr = new Date(ev.holdUntil * 1000).toLocaleString();
    text.textContent = `Status: TIME-LOCKED HOLD ACTIVE until ${dateStr} ("${ev.holdReason}")`;
    btnPlace.disabled = false;
    btnRelease.disabled = false;
  } else if (ev.holdUntil > 0) {
    banner.className = "seal-banner unsealed";
    icon.textContent = "🟢";
    text.textContent = `Status: Evidentiary Hold Expired (Was: "${ev.holdReason}")`;
    btnPlace.disabled = false;
    btnRelease.disabled = true;
  } else {
    banner.className = "seal-banner unsealed";
    icon.textContent = "🟢";
    text.textContent = "Status: No Active Hold (Standard Retention)";
    btnPlace.disabled = false;
    btnRelease.disabled = true;
  }
}

function updateDisposalControls() {
  const ev = state.evidence[currentEvidenceId];
  if (!ev) return;

  const banner = document.getElementById("disposalStatusBanner");
  const icon = document.getElementById("disposalStatusIcon");
  const text = document.getElementById("disposalStatusText");
  const btnProp = document.getElementById("btnProposeDisposal");
  const btnConf = document.getElementById("btnConfirmDisposal");
  const btnCanc = document.getElementById("btnCancelDisposal");

  if (ev.isDisposed) {
    banner.className = "seal-banner disposed";
    icon.textContent = "🔥";
    text.textContent = `Status: LAWFULLY EXPUNGED — Keys Shredded pursuant to Court Order`;
    btnProp.disabled = true;
    btnConf.disabled = true;
    btnCanc.disabled = true;
  } else if (ev.disposalProposer) {
    banner.className = "seal-banner pending";
    icon.textContent = "⚠️";
    text.textContent = `Status: Court Expungement Order Pending Custodian Concurrence ("${ev.disposalReason}")`;
    btnProp.disabled = true;
    btnConf.disabled = false;
    btnCanc.disabled = false;
  } else {
    banner.className = "seal-banner unsealed";
    icon.textContent = "🟢";
    text.textContent = "Status: Active Record (Not Expunged)";
    btnProp.disabled = false;
    btnConf.disabled = true;
    btnCanc.disabled = true;
  }
}

function updateSealControls() {
  const ev = state.evidence[currentEvidenceId];
  if (!ev) return;

  const banner = document.getElementById("sealStatusBanner");
  const icon = document.getElementById("sealStatusIcon");
  const text = document.getElementById("sealStatusText");
  const btnSeal = document.getElementById("btnSealEvidence");
  const btnUnseal = document.getElementById("btnUnsealEvidence");

  if (ev.isDisposed) {
    banner.className = "seal-banner disposed";
    icon.textContent = "🔥";
    text.textContent = "Status: Evidence Expunged (Cannot Seal/Unseal)";
    btnSeal.disabled = true;
    btnUnseal.disabled = true;
  } else if (ev.isSealed) {
    banner.className = "seal-banner sealed";
    icon.textContent = "🔒";
    text.textContent = `Status: JUDICIALLY SEALED — ${ev.sealReason || "Court Order"}`;
    btnSeal.disabled = true;
    btnUnseal.disabled = false;
  } else {
    banner.className = "seal-banner unsealed";
    icon.textContent = "🟢";
    text.textContent = "Status: Unsealed (Active Chain of Custody)";
    btnSeal.disabled = false;
    btnUnseal.disabled = true;
  }
}

function updateTopStats() {
  const ev = state.evidence[currentEvidenceId];
  if (!ev) return;

  const custPersona = PERSONAS[ev.custodian];
  document.getElementById("currentCustodianDisplay").textContent = custPersona ? custPersona.role : ev.custodian;
  document.getElementById("evidenceCountDisplay").textContent = Object.keys(state.evidence).length + " Item(s)";
  document.getElementById("auditLogCountDisplay").textContent = state.auditTrail.length + " Events";
  document.getElementById("onChainHashDisplay").textContent = ev.fileHash;

  // Provenance Card (ISO/IEC 27037)
  const provCard = document.getElementById("provenanceCard");
  if (provCard) {
    if (ev.metadata && ev.metadata.deviceSerial) {
      provCard.style.display = "block";
      document.getElementById("dispDeviceSerial").textContent = ev.metadata.deviceSerial;
      document.getElementById("dispAcquisitionTool").textContent = ev.metadata.acquisitionTool || "Standard Bit-Stream Imager";
      document.getElementById("dispOfficerBadge").textContent = `${ev.metadata.officerBadge || "Officer"} [${ev.metadata.jurisdiction || "Default"}]`;
    } else {
      provCard.style.display = "none";
    }
  }

  const legalStatus = document.getElementById("legalStatusDisplay");
  const legalSub = document.getElementById("legalStatusSub");
  if (legalStatus && legalSub) {
    const nowSec = Math.floor(Date.now() / 1000);
    if (ev.isDisposed) {
      legalStatus.textContent = "EXPUNGED";
      legalStatus.style.color = "var(--danger)";
      legalSub.textContent = "Keys Shredded & Closed";
    } else if (ev.isSealed) {
      legalStatus.textContent = "SEALED";
      legalStatus.style.color = "var(--warning)";
      legalSub.textContent = "Court Frozen";
    } else if (ev.holdUntil && ev.holdUntil > nowSec) {
      legalStatus.textContent = "HOLD ACTIVE";
      legalStatus.style.color = "var(--primary)";
      legalSub.textContent = "Statutory Retention Lock";
    } else {
      legalStatus.textContent = "ACTIVE";
      legalStatus.style.color = "var(--success)";
      legalSub.textContent = "Normal Chain of Custody";
    }
  }
}

function renderAccessMatrix() {
  const ev = state.evidence[currentEvidenceId];
  const list = document.getElementById("accessStatusList");
  list.innerHTML = "";

  const roles = ["investigator", "lab", "court", "defense"];
  roles.forEach(r => {
    const li = document.createElement("li");
    li.className = "permission-item";
    const has = !ev.isDisposed && ev.permissions[r];
    const isCust = ev.custodian === r;

    li.innerHTML = `
      <span>${PERSONAS[r].label} ${isCust ? '<strong style="color:var(--primary); font-size:0.75rem;">(Custodian)</strong>' : ''}</span>
      <span class="${has ? 'badge-granted' : 'badge-denied'}">${has ? 'GRANTED' : (ev.isDisposed ? 'SHREDDED' : 'NO ACCESS')}</span>
    `;
    list.appendChild(li);
  });
}

function renderAuditTrail() {
  const timeline = document.getElementById("auditTimeline");
  timeline.innerHTML = "";

  const icons = {
    EvidenceRegistered: "📦",
    EvidenceMetadataAnchored: "🏷️",
    AccessGranted: "🔑",
    AccessLogged: "👁️",
    CustodyTransferred: "🔄",
    AccessRevoked: "🚫",
    EvidenceSealed: "⚖️",
    EvidenceUnsealed: "🔓",
    DisposalProposed: "📜",
    DisposalCancelled: "↩️",
    EvidenceDisposed: "🔥",
    EvidentiaryHoldPlaced: "⏳",
    EvidentiaryHoldReleased: "🔓"
  };

  [...state.auditTrail].reverse().forEach((l, idx) => {
    const item = document.createElement("div");
    item.className = "timeline-item";

    const actor = PERSONAS[l.by] ? PERSONAS[l.by].role : l.by;
    const icon = icons[l.event] || "⚡";

    item.innerHTML = `
      <div class="timeline-dot"></div>
      <div class="timeline-meta">
        <span>Block #${l.block} &bull; ${l.time || 'Confirmed'}</span>
        <span>Tx: 0x${Math.random().toString(16).slice(2, 10)}...</span>
      </div>
      <div class="timeline-title">${icon} ${l.event} by ${actor}</div>
      <div class="timeline-desc">${l.detail}</div>
    `;
    timeline.appendChild(item);
  });
}

// ---------------------------------------------------------------- Core Workflows
async function handleFileVerification(buffer, fileName, fileSize) {
  const computedHash = await computeSha256(buffer);

  document.getElementById("verifyFileDetails").classList.remove("hidden");
  document.getElementById("vFileName").textContent = fileName;
  document.getElementById("vFileSize").textContent = `${fileSize} bytes`;
  document.getElementById("vFileHash").textContent = computedHash;
  document.getElementById("uploadedHashDisplay").textContent = computedHash;

  const ev = state.evidence[currentEvidenceId];
  const resultBox = document.getElementById("verificationResultBox");

  if (computedHash.toLowerCase() === ev.fileHash.toLowerCase()) {
    resultBox.className = "result-box verified";
    resultBox.innerHTML = `
      <div class="result-icon">✅</div>
      <div class="result-text">
        <h4>INTEGRITY VERIFIED &bull; 100% BIT-FOR-BIT MATCH</h4>
        <p>The cryptographic SHA-256 fingerprint matches the immutable record anchored on-chain.</p>
      </div>
    `;
    toast("Integrity confirmed: File matches on-chain anchor!", "success");
  } else {
    resultBox.className = "result-box tampered";
    resultBox.innerHTML = `
      <div class="result-icon">🚨</div>
      <div class="result-text">
        <h4>TAMPER DETECTED &bull; CRYPTOGRAPHIC HASH MISMATCH</h4>
        <p>This file does not match the on-chain evidence hash. Evidence has been modified or forged!</p>
      </div>
    `;
    toast("ALERT: File hash does not match blockchain anchor!", "error");
  }
}

// ---------------------------------------------------------------- Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  // Tabs Navigation
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

      btn.classList.add("active");
      const target = btn.dataset.tab;
      document.getElementById(`tab-${target}`).classList.add("active");
    });
  });

  // Persona Switcher
  const pSelect = document.getElementById("personaSelect");
  pSelect.addEventListener("change", (e) => {
    currentPersonaKey = e.target.value;
    updatePersonaDisplay();
    toast(`Active Role switched to: ${PERSONAS[currentPersonaKey].label}`);
  });

  // Verification Drop Zone
  const vDrop = document.getElementById("verifyDropZone");
  const vInput = document.getElementById("verifyFileInput");

  vDrop.addEventListener("click", () => vInput.click());
  vDrop.addEventListener("dragover", (e) => { e.preventDefault(); vDrop.classList.add("dragover"); });
  vDrop.addEventListener("dragleave", () => vDrop.classList.remove("dragover"));
  vDrop.addEventListener("drop", (e) => {
    e.preventDefault();
    vDrop.classList.remove("dragover");
    if (e.dataTransfer.files.length) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = () => handleFileVerification(reader.result, file.name, file.size);
      reader.readAsArrayBuffer(file);
    }
  });
  vInput.addEventListener("change", (e) => {
    if (e.target.files.length) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => handleFileVerification(reader.result, file.name, file.size);
      reader.readAsArrayBuffer(file);
    }
  });

  // Quick Samples
  document.getElementById("quickSampleBtn").addEventListener("click", async () => {
    const enc = new TextEncoder();
    const buf = enc.encode(SAMPLE_TEXT);
    await handleFileVerification(buf, "evidence_report.txt", buf.length);
  });

  document.getElementById("quickTamperBtn").addEventListener("click", async () => {
    const enc = new TextEncoder();
    const buf = enc.encode(SAMPLE_TAMPERED);
    await handleFileVerification(buf, "evidence_report_TAMPERED.txt", buf.length);
  });

  // Log Access Button
  document.getElementById("logAccessBtn").addEventListener("click", () => {
    const ev = state.evidence[currentEvidenceId];
    if (!ev.permissions[currentPersonaKey]) {
      toast(`[REVERT] AccessDenied(): ${PERSONAS[currentPersonaKey].role} has not been granted access!`, "error");
      return;
    }

    currentBlock++;
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    state.auditTrail.push({
      block: currentBlock,
      event: "AccessLogged",
      by: currentPersonaKey,
      detail: `${PERSONAS[currentPersonaKey].role} verified and logged access to Evidence #${currentEvidenceId}`,
      time: now
    });

    renderAuditTrail();
    updateTopStats();
    toast(`Access recorded in on-chain audit log (Block #${currentBlock})`, "success");
  });

  // Custody Transfer
  document.getElementById("btnTransferCustody").addEventListener("click", () => {
    const ev = state.evidence[currentEvidenceId];
    if (ev.isDisposed) {
      toast(`[REVERT] EvidenceIsDisposed(): Evidence #${currentEvidenceId} is expunged and keys are shredded!`, "error");
      return;
    }
    if (ev.isSealed) {
      toast(`[REVERT] EvidenceIsSealed(): Evidence #${currentEvidenceId} is judicially sealed by court order! Custody transfers are frozen.`, "error");
      return;
    }
    if (ev.custodian !== currentPersonaKey) {
      toast(`[REVERT] NotCustodian(): Only current custodian (${PERSONAS[ev.custodian].role}) can transfer custody!`, "error");
      return;
    }

    const target = document.getElementById("transferTargetSelect").value;
    if (target === currentPersonaKey) {
      toast(`[REVERT] InvalidInput(): Cannot transfer custody to yourself!`, "error");
      return;
    }

    ev.custodian = target;
    ev.permissions[target] = true;
    currentBlock++;

    state.auditTrail.push({
      block: currentBlock,
      event: "CustodyTransferred",
      by: currentPersonaKey,
      to: target,
      detail: `Custody transferred from ${PERSONAS[currentPersonaKey].role} to ${PERSONAS[target].role}`,
      time: new Date().toISOString().replace("T", " ").slice(0, 19)
    });

    updatePersonaDisplay();
    toast(`Custody successfully transferred to ${PERSONAS[target].role}!`, "success");
  });

  // Grant Access
  document.getElementById("btnGrantAccess").addEventListener("click", () => {
    const ev = state.evidence[currentEvidenceId];
    if (ev.isDisposed) {
      toast(`[REVERT] EvidenceIsDisposed(): Evidence #${currentEvidenceId} is expunged! Access grants prohibited.`, "error");
      return;
    }
    if (ev.isSealed) {
      toast(`[REVERT] EvidenceIsSealed(): Evidence #${currentEvidenceId} is judicially sealed! Access grants are frozen.`, "error");
      return;
    }
    if (ev.custodian !== currentPersonaKey) {
      toast(`[REVERT] NotCustodian(): Only current custodian (${PERSONAS[ev.custodian].role}) can grant access!`, "error");
      return;
    }

    const target = document.getElementById("accessTargetSelect").value;
    ev.permissions[target] = true;
    currentBlock++;

    state.auditTrail.push({
      block: currentBlock,
      event: "AccessGranted",
      by: currentPersonaKey,
      to: target,
      detail: `${PERSONAS[currentPersonaKey].role} granted access to ${PERSONAS[target].role} (AES key re-encrypted)`,
      time: new Date().toISOString().replace("T", " ").slice(0, 19)
    });

    updatePersonaDisplay();
    toast(`Access granted to ${PERSONAS[target].role}!`, "success");
  });

  // Revoke Access
  document.getElementById("btnRevokeAccess").addEventListener("click", () => {
    const ev = state.evidence[currentEvidenceId];
    if (ev.isDisposed) {
      toast(`[REVERT] EvidenceIsDisposed(): Evidence #${currentEvidenceId} is expunged! Access modifications prohibited.`, "error");
      return;
    }
    if (ev.isSealed) {
      toast(`[REVERT] EvidenceIsSealed(): Evidence #${currentEvidenceId} is judicially sealed! Access modifications are frozen.`, "error");
      return;
    }
    if (ev.custodian !== currentPersonaKey) {
      toast(`[REVERT] NotCustodian(): Only current custodian (${PERSONAS[ev.custodian].role}) can revoke access!`, "error");
      return;
    }

    const target = document.getElementById("accessTargetSelect").value;
    if (target === ev.custodian) {
      toast(`[REVERT] CannotRevokeCustodian(): Cannot revoke access of current custodian!`, "error");
      return;
    }

    if (!ev.permissions[target]) {
      toast(`[REVERT] NothingToRevoke(): ${PERSONAS[target].role} does not currently have access!`, "error");
      return;
    }

    ev.permissions[target] = false;
    currentBlock++;

    state.auditTrail.push({
      block: currentBlock,
      event: "AccessRevoked",
      by: currentPersonaKey,
      to: target,
      detail: `${PERSONAS[currentPersonaKey].role} revoked access of ${PERSONAS[target].role} (key wiped)`,
      time: new Date().toISOString().replace("T", " ").slice(0, 19)
    });

    updatePersonaDisplay();
    toast(`Access revoked for ${PERSONAS[target].role}. Wrapped key wiped from state.`, "warning");
  });

  // Judicial Sealing Handlers
  document.getElementById("btnSealEvidence").addEventListener("click", () => {
    const ev = state.evidence[currentEvidenceId];
    if (ev.isDisposed) {
      toast(`[REVERT] EvidenceIsDisposed(): Evidence #${currentEvidenceId} is expunged and cannot be sealed!`, "error");
      return;
    }
    if (currentPersonaKey !== "court") {
      toast(`[REVERT] NotAuthorized(): Only Court (Judge) can issue sealing orders! Active role: ${PERSONAS[currentPersonaKey].role}`, "error");
      return;
    }
    if (ev.isSealed) {
      toast(`[REVERT] EvidenceIsSealed(): Evidence #${currentEvidenceId} is already sealed!`, "error");
      return;
    }
    const reason = document.getElementById("sealReasonInput").value.trim();
    if (!reason) {
      toast(`[REVERT] InvalidInput(): Court order docket or rationale is required!`, "error");
      return;
    }

    ev.isSealed = true;
    ev.sealReason = reason;
    currentBlock++;

    state.auditTrail.push({
      block: currentBlock,
      event: "EvidenceSealed",
      by: currentPersonaKey,
      detail: `Court sealed Evidence #${currentEvidenceId}: "${reason}"`,
      time: new Date().toISOString().replace("T", " ").slice(0, 19)
    });

    updatePersonaDisplay();
    toast(`⚖️ Evidence #${currentEvidenceId} judicially sealed. Custody & access frozen.`, "warning");
  });

  document.getElementById("btnUnsealEvidence").addEventListener("click", () => {
    const ev = state.evidence[currentEvidenceId];
    if (ev.isDisposed) {
      toast(`[REVERT] EvidenceIsDisposed(): Evidence #${currentEvidenceId} is expunged and cannot be unsealed!`, "error");
      return;
    }
    if (currentPersonaKey !== "court") {
      toast(`[REVERT] NotAuthorized(): Only Court (Judge) can unseal evidence! Active role: ${PERSONAS[currentPersonaKey].role}`, "error");
      return;
    }
    if (!ev.isSealed) {
      toast(`[REVERT] EvidenceNotSealed(): Evidence #${currentEvidenceId} is not sealed!`, "error");
      return;
    }
    const reason = document.getElementById("sealReasonInput").value.trim() || "Released by Court Order";

    ev.isSealed = false;
    ev.sealReason = reason;
    currentBlock++;

    state.auditTrail.push({
      block: currentBlock,
      event: "EvidenceUnsealed",
      by: currentPersonaKey,
      detail: `Court unsealed Evidence #${currentEvidenceId}: "${reason}"`,
      time: new Date().toISOString().replace("T", " ").slice(0, 19)
    });

    updatePersonaDisplay();
    toast(`🔓 Evidence #${currentEvidenceId} unsealed and returned to active custody.`, "success");
  });

  // Multi-Party Disposal & Key Shredding Handlers
  document.getElementById("btnProposeDisposal").addEventListener("click", () => {
    const ev = state.evidence[currentEvidenceId];
    if (currentPersonaKey !== "court") {
      toast(`[REVERT] NotAuthorized(): Only Court (Judge) can propose evidence expungement! Active role: ${PERSONAS[currentPersonaKey].role}`, "error");
      return;
    }
    if (ev.isDisposed) {
      toast(`[REVERT] EvidenceIsDisposed(): Evidence #${currentEvidenceId} is already expunged!`, "error");
      return;
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (ev.holdUntil && ev.holdUntil > nowSec) {
      const dateStr = new Date(ev.holdUntil * 1000).toLocaleString();
      toast(`[REVERT] EvidentiaryHoldActive(): Active evidentiary hold until ${dateStr} blocks expungement!`, "error");
      return;
    }
    if (ev.disposalProposer) {
      toast(`[REVERT] AlreadyProposed(): Expungement already proposed by Court!`, "error");
      return;
    }
    const reason = document.getElementById("disposalReasonInput").value.trim();
    if (!reason) {
      toast(`[REVERT] InvalidInput(): Expungement decree or legal basis is required!`, "error");
      return;
    }

    ev.disposalProposer = currentPersonaKey;
    ev.disposalReason = reason;
    currentBlock++;

    state.auditTrail.push({
      block: currentBlock,
      event: "DisposalProposed",
      by: currentPersonaKey,
      detail: `Court proposed expungement: "${reason}" (Awaiting Custodian concurrence)`,
      time: new Date().toISOString().replace("T", " ").slice(0, 19)
    });

    updatePersonaDisplay();
    toast(`📜 Expungement proposed by Court. Awaiting concurrence from Custodian (${PERSONAS[ev.custodian].role}).`, "info");
  });

  document.getElementById("btnConfirmDisposal").addEventListener("click", () => {
    const ev = state.evidence[currentEvidenceId];
    if (!ev.disposalProposer) {
      toast(`[REVERT] DisposalNotProposed(): No expungement proposal pending for Evidence #${currentEvidenceId}!`, "error");
      return;
    }
    if (currentPersonaKey !== ev.custodian) {
      toast(`[REVERT] NotCustodian(): Only current custodian (${PERSONAS[ev.custodian].role}) can confirm expungement!`, "error");
      return;
    }
    if (ev.isDisposed) {
      toast(`[REVERT] EvidenceIsDisposed(): Evidence #${currentEvidenceId} is already expunged!`, "error");
      return;
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (ev.holdUntil && ev.holdUntil > nowSec) {
      toast(`[REVERT] EvidentiaryHoldActive(): Active evidentiary hold blocks destruction!`, "error");
      return;
    }

    ev.isDisposed = true;
    const courtProposer = ev.disposalProposer;
    const reason = ev.disposalReason;
    ev.disposalProposer = null;
    ev.cid = "";
    Object.keys(ev.permissions).forEach(k => { ev.permissions[k] = false; });
    currentBlock++;

    state.auditTrail.push({
      block: currentBlock,
      event: "EvidenceDisposed",
      by: currentPersonaKey,
      detail: `Multi-party expungement confirmed: Keys shredded and CID purged ("${reason}")`,
      time: new Date().toISOString().replace("T", " ").slice(0, 19)
    });

    updatePersonaDisplay();
    toast(`🔥 Evidence #${currentEvidenceId} successfully expunged. AES keys permanently shredded!`, "error");
  });

  document.getElementById("btnCancelDisposal").addEventListener("click", () => {
    const ev = state.evidence[currentEvidenceId];
    if (!ev.disposalProposer) {
      toast(`[REVERT] DisposalNotProposed(): No pending expungement proposal to cancel!`, "error");
      return;
    }
    if (currentPersonaKey !== ev.disposalProposer && currentPersonaKey !== ev.custodian) {
      toast(`[REVERT] NotAuthorized(): Only proposing Court or active Custodian can cancel proposal!`, "error");
      return;
    }

    ev.disposalProposer = null;
    ev.disposalReason = "";
    currentBlock++;

    state.auditTrail.push({
      block: currentBlock,
      event: "DisposalCancelled",
      by: currentPersonaKey,
      detail: `${PERSONAS[currentPersonaKey].role} cancelled pending expungement proposal`,
      time: new Date().toISOString().replace("T", " ").slice(0, 19)
    });

    updatePersonaDisplay();
    toast(`↩️ Expungement proposal cancelled. Evidence remains active.`, "info");
  });

  // Evidentiary Hold Handlers
  document.getElementById("btnPlaceHold").addEventListener("click", () => {
    const ev = state.evidence[currentEvidenceId];
    if (ev.isDisposed) {
      toast(`[REVERT] EvidenceIsDisposed(): Cannot place hold on expunged evidence!`, "error");
      return;
    }
    if (currentPersonaKey !== "court" && currentPersonaKey !== ev.custodian) {
      toast(`[REVERT] NotAuthorized(): Only Court (Judge) or Active Custodian can place evidentiary hold! Active role: ${PERSONAS[currentPersonaKey].role}`, "error");
      return;
    }
    const duration = parseInt(document.getElementById("holdDurationSelect").value, 10);
    const nowSec = Math.floor(Date.now() / 1000);
    const targetTimestamp = nowSec + duration;

    if (ev.holdUntil && targetTimestamp <= ev.holdUntil) {
      toast(`[REVERT] InvalidHoldDuration(): New hold duration must extend past the current hold deadline!`, "error");
      return;
    }

    const reason = document.getElementById("holdReasonInput").value.trim();
    if (!reason) {
      toast(`[REVERT] InvalidInput(): Legal justification is required to place an evidentiary hold!`, "error");
      return;
    }

    ev.holdUntil = targetTimestamp;
    ev.holdReason = reason;
    currentBlock++;

    state.auditTrail.push({
      block: currentBlock,
      event: "EvidentiaryHoldPlaced",
      by: currentPersonaKey,
      detail: `${PERSONAS[currentPersonaKey].role} placed hold until ${new Date(targetTimestamp * 1000).toLocaleDateString()}: "${reason}"`,
      time: new Date().toISOString().replace("T", " ").slice(0, 19)
    });

    updatePersonaDisplay();
    toast(`⏳ Time-locked evidentiary hold active until ${new Date(targetTimestamp * 1000).toLocaleDateString()}. Evidence destruction blocked.`, "info");
  });

  document.getElementById("btnReleaseHold").addEventListener("click", () => {
    const ev = state.evidence[currentEvidenceId];
    if (ev.isDisposed) {
      toast(`[REVERT] EvidenceIsDisposed(): Evidence is expunged!`, "error");
      return;
    }
    if (currentPersonaKey !== "court") {
      toast(`[REVERT] NotAuthorized(): Only Court (Judge) can release an evidentiary hold early! Active role: ${PERSONAS[currentPersonaKey].role}`, "error");
      return;
    }
    if (!ev.holdUntil) {
      toast(`[REVERT] InvalidInput(): No evidentiary hold active on Evidence #${currentEvidenceId}!`, "error");
      return;
    }

    const reason = document.getElementById("holdReasonInput").value.trim() || "Dismissed by Court Order";
    ev.holdUntil = 0;
    ev.holdReason = reason;
    currentBlock++;

    state.auditTrail.push({
      block: currentBlock,
      event: "EvidentiaryHoldReleased",
      by: currentPersonaKey,
      detail: `Court released evidentiary hold: "${reason}"`,
      time: new Date().toISOString().replace("T", " ").slice(0, 19)
    });

    updatePersonaDisplay();
    toast(`🔓 Evidentiary hold released by Court order. Standard retention resumed.`, "success");
  });

  // Register Tab Drag & Drop
  const rDrop = document.getElementById("registerDropZone");
  const rInput = document.getElementById("registerFileInput");
  const btnReg = document.getElementById("btnRegisterOnChain");

  rDrop.addEventListener("click", () => rInput.click());
  rDrop.addEventListener("dragover", (e) => { e.preventDefault(); rDrop.classList.add("dragover"); });
  rDrop.addEventListener("dragleave", () => rDrop.classList.remove("dragover"));
  rDrop.addEventListener("drop", (e) => {
    e.preventDefault();
    rDrop.classList.remove("dragover");
    if (e.dataTransfer.files.length) handleRegFile(e.dataTransfer.files[0]);
  });
  rInput.addEventListener("change", (e) => {
    if (e.target.files.length) handleRegFile(e.target.files[0]);
  });

  let pendingRegData = null;

  async function handleRegFile(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      const hash = await computeSha256(reader.result);
      const simulatedCid = "sim-" + hash.slice(2, 26) + "...";

      document.getElementById("regDetails").classList.remove("hidden");
      document.getElementById("rFileName").textContent = file.name;
      document.getElementById("rFileSize").textContent = `${file.size} bytes`;
      document.getElementById("rFileHash").textContent = hash;
      document.getElementById("rFileCid").textContent = simulatedCid;

      pendingRegData = { name: file.name, hash, cid: simulatedCid, size: file.size };
      btnReg.disabled = false;
    };
    reader.readAsArrayBuffer(file);
  }

  btnReg.addEventListener("click", () => {
    if (currentPersonaKey !== "investigator") {
      toast(`[REVERT] NotAuthorized(): Only Investigator can register new evidence! Current role: ${PERSONAS[currentPersonaKey].role}`, "error");
      return;
    }
    if (!pendingRegData) return;

    const newId = Object.keys(state.evidence).length + 1;
    currentBlock++;

    const devSerial = document.getElementById("regDeviceSerial")?.value.trim() || "";
    const acqTool = document.getElementById("regAcquisitionTool")?.value.trim() || "";
    const offBadge = document.getElementById("regOfficerBadge")?.value.trim() || "";
    const juris = document.getElementById("regJurisdiction")?.value.trim() || "";

    state.evidence[newId] = {
      id: newId,
      title: document.getElementById("caseTitle").value || pendingRegData.name,
      fileHash: pendingRegData.hash,
      cid: pendingRegData.cid,
      custodian: "investigator",
      registeredBy: "investigator",
      createdAtBlock: currentBlock,
      isSealed: false,
      sealReason: "",
      isDisposed: false,
      disposalProposer: null,
      disposalReason: "",
      metadata: {
        deviceSerial: devSerial,
        acquisitionTool: acqTool,
        officerBadge: offBadge,
        jurisdiction: juris
      },
      permissions: {
        investigator: true,
        lab: false,
        court: false,
        defense: false
      }
    };

    state.auditTrail.push({
      block: currentBlock,
      event: "EvidenceRegistered",
      by: "investigator",
      detail: `Evidence #${newId} registered (hash ${pendingRegData.hash.slice(0, 12)}...)`,
      time: new Date().toISOString().replace("T", " ").slice(0, 19)
    });

    if (devSerial) {
      state.auditTrail.push({
        block: currentBlock,
        event: "EvidenceMetadataAnchored",
        by: "investigator",
        detail: `Hardware Anchored: ${devSerial} | Tool: ${acqTool} | Officer: ${offBadge} (${juris})`,
        time: new Date().toISOString().replace("T", " ").slice(0, 19)
      });
    }

    // Add to verify select
    const sel = document.getElementById("verifyEvidenceSelect");
    const opt = document.createElement("option");
    opt.value = newId;
    opt.textContent = `Evidence #${newId} (${pendingRegData.name})`;
    sel.appendChild(opt);

    updateTopStats();
    renderAuditTrail();
    toast(`Evidence #${newId} successfully encrypted and anchored on-chain!`, "success");
    btnReg.disabled = true;
  });

  // Tamper Sandbox simulation handlers
  document.getElementById("btnSim6a").addEventListener("click", () => {
    const el = document.getElementById("res6a");
    el.style.color = "var(--danger)";
    el.textContent = "🚨 REJECTED: CID mismatch detected! The stored content has been altered in disk/IPFS.";
    toast("Layer 1 defense: IPFS content addressing caught storage tamper!", "error");
  });

  document.getElementById("btnSim6b").addEventListener("click", () => {
    const el = document.getElementById("res6b");
    el.style.color = "var(--danger)";
    el.textContent = "🚨 REJECTED: AES-256-GCM authentication tag verification failed. Ciphertext was altered!";
    toast("Layer 2 defense: GCM authentication tag caught ciphertext tamper!", "error");
  });

  document.getElementById("btnSim6c").addEventListener("click", () => {
    const el = document.getElementById("res6c");
    el.style.color = "var(--danger)";
    el.textContent = "🚨 REJECTED: Decrypted file SHA-256 does NOT match on-chain hash! Rogue substitution caught.";
    toast("Layer 3 defense: Blockchain on-chain hash caught insider forgery!", "error");
  });

  // Wallet Connection
  document.getElementById("connectWalletBtn").addEventListener("click", async () => {
    if (typeof window.ethereum !== "undefined") {
      try {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        const provider = new ethers.BrowserProvider(window.ethereum);
        const network = await provider.getNetwork();
        document.getElementById("modeText").textContent = `Web3 (${network.name || 'chainId: ' + network.chainId})`;
        document.getElementById("activeAddressDisplay").textContent = short(accounts[0]);
        toast(`Connected to MetaMask: ${short(accounts[0])}`, "success");
      } catch (err) {
        toast("MetaMask connection rejected.", "error");
      }
    } else {
      toast("MetaMask not detected. Running in Demo Simulator mode.", "info");
    }
  });

  // Export Court Certificate
  document.getElementById("exportCertBtn").addEventListener("click", () => {
    const ev = state.evidence[currentEvidenceId];
    const now = new Date().toUTCString();

    let cert = `# CERTIFICATE OF DIGITAL EVIDENCE AUTHENTICITY\n`;
    cert += `## AND CONTINUOUS CHAIN OF CUSTODY\n\n`;
    cert += `**Certificate Reference**: CC-CERT-2026-000${currentEvidenceId}\n`;
    cert += `**Issuance Date**: ${now}\n`;
    cert += `**Legal Standard**: Compliant with Federal Rules of Evidence 902(13)/(14) & ISO/IEC 27037:2012\n\n`;
    cert += `### 1. EVIDENCE RECORD IDENTIFICATION\n`;
    cert += `- Item Identifier: Evidence #${ev.id} (${ev.title})\n`;
    cert += `- Anchored SHA-256 Digest: ${ev.fileHash}\n`;
    cert += `- Off-Chain Storage CID: ${ev.cid}\n`;
    cert += `- Current Legal Custodian: ${PERSONAS[ev.custodian].role} (${PERSONAS[ev.custodian].address})\n`;
    cert += `- Initial Seizure Block: #${ev.createdAtBlock}\n\n`;
    cert += `### 2. CONTINUOUS ON-CHAIN AUDIT TRAIL\n\n`;
    cert += `| Block | Event | Initiated By | Details | Timestamp |\n`;
    cert += `| :---: | :--- | :--- | :--- | :--- |\n`;

    state.auditTrail.forEach(l => {
      const actor = PERSONAS[l.by] ? PERSONAS[l.by].role : l.by;
      cert += `| #${l.block} | ${l.event} | ${actor} | ${l.detail} | ${l.time || 'Confirmed'} |\n`;
    });

    cert += `\n### 3. LEGAL ATTESTATION\n`;
    cert += `The digital item described above has maintained an unbroken, cryptographically verified chain of custody.\n`;
    cert += `Electronic Signature: [VERIFIED ON-CHAIN VIA CHAINCUSTODY DISTRIBUTED LEDGER]\n`;

    const blob = new Blob([cert], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `CERTIFICATE_EVIDENCE_${ev.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`Downloaded Certificate of Authenticity for Evidence #${ev.id}`, "success");
  });

  // Initialize display
  updatePersonaDisplay();
});
