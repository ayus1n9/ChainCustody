# ChainCustody dashboard - UI/UX audit against the promised outcomes

Audit date: 2026-11-20 · Commit audited: `71b1f58` (main) · Scope: the web dashboard (`frontend/index.html`, `frontend/app.js`, `frontend/style.css`, served by `scripts/server.js`) in **demo mode** (`DEMO_MODE=true`), at 1440 px and 390 px.

This report changes no code. Every finding carries evidence (file:line, a screenshot, or a measurement) and says how it was verified.

## Contents
1. [Verdict](#1-verdict)
2. [How the audit was done](#2-how-the-audit-was-done)
3. [Outcome matrix](#3-outcome-matrix)
4. [S1 - misleads on the outcome](#4-s1---misleads-on-the-outcome)
5. [S2 - excludes users or invites a consequential misreading](#5-s2---excludes-users-or-invites-a-consequential-misreading)
6. [S3 - friction](#6-s3---friction)
7. [S4 - polish](#7-s4---polish)
8. [Fix the class, not the instance - suggested order](#8-fix-the-class-not-the-instance---suggested-order)
9. [What works - keep it](#9-what-works---keep-it)
10. [Not checked](#10-not-checked)

## 1. Verdict

The dashboard's promise (README "Core Protocols" 1-9) is integrity you can show in court: verify a file against its anchored SHA-256, see who holds it, see its legal state, and read an immutable audit trail. Today the UI **contradicts that promise in its headline flow and in the artefacts it hands out**:

- **The authentic file is reported as forged.** "Load Original Sample" and the DEMO_GUIDE's "authentic original" both show *TAMPER DETECTED - Evidence has been modified or forged!* The seeded anchor hash matches neither (UX-01).
- **Nothing reaches a chain.** `app.js` sends no transaction and reads no contract, in demo *or* real mode. Every action is a change to an in-memory object, but the copy says "anchored on-chain", "immutable" and `[REVERT]`. The audit trail's transaction hashes come from `Math.random()` (UX-02, UX-03).
- **The exported "court certificate" asserts FRE 902 compliance and an "unbroken, cryptographically verified chain of custody" unconditionally.** It does so for the Unauthorized Observer, after a failed verification and after expungement, with no demo marker. That contradicts the project's own disclaimer in `docs/ARCHITECTURE.md:81` (UX-04).

Underneath, the structure is sound: real in-browser SHA-256, a role and rule model that mirrors the contract's custom errors, a clean Register screen and a readable timeline (section 9). Most problems fall into seven classes that can each be fixed once (section 8).

**Counts after merging duplicates across the four lanes:** S1 = 10 · S2 = 20 · S3 = 32 · S4 = 8.

## 2. How the audit was done

Four parallel, read-only review lanes ran against the same evidence. Each lane's significant findings were then **re-checked in code by the lead** before being merged here; one lane claim was corrected on re-check (see UX-01, line endings).

| Lane | Lens | Method |
|---|---|---|
| Outcomes & flows | Does each promised capability work, for each persona, and is what it shows true? | Drove the running app (Playwright, 1440x900) through every persona and protocol; read back DOM state, toasts and console after each action |
| Accessibility | WCAG 2.2 AA, keyboard, screen reader, low vision, touch | Code + accessibility-tree snapshots of all 6 tabs at both widths; contrast computed from the real tokens with [`contrast.js`](contrast.js) |
| Visual & responsive | Hierarchy, status encoding, colour meaning, token discipline, phone layout | All 12 screenshots + `style.css` / inline styles |
| Copy, IA & trust | Every user-facing string vs what the code actually does; naming; legal claims; tab grouping | `index.html`, `app.js`, `server.js`, `auth.js`, `witness.js`, the contracts and the docs |

Severity is judged against the outcome, not taste:
- **S1** - a promised capability fails, or the UI states something false about integrity, custody, access, legal status or audit history.
- **S2** - a user group cannot complete a task (keyboard, screen reader, phone), or a likely misreading with legal consequence.
- **S3** - friction; completable but slower, harder or inconsistent.
- **S4** - polish.

Personas: Investigator (Police), Forensic Lab, Court (Magistrate), Defense Counsel, Unauthorized Observer.

**Evidence in this folder**
- `screens/desktop-1440-*.jpg`, `screens/phone-390-*.jpg` - every tab, initial state, full page.
- `screens/flows/out-01..06*.png` - states reached by driving the flows (named in findings).
- [`contrast.js`](contrast.js) - re-run with `node docs/ux-audit/contrast.js` from the repo root; prints every text/background pair with its WCAG ratio (26 failing pairs on 2026-11-20).

## 3. Outcome matrix

Result of driving each promised outcome in the running demo. I = Investigator, L = Lab, C = Court, D = Defense, O = Unauthorized Observer.

| Promised outcome (source) | Result | Evidence |
|---|---|---|
| Verify: original file → VERIFIED (README #9, DEMO_GUIDE §2B) | **Fails** | UX-01; `flows/out-01` |
| Verify: tampered file → TAMPER DETECTED | Works, but every input gives this result | UX-01 |
| Verify a newly registered item | **Fails** - always compared with Evidence #1 | UX-05; `flows/out-02` |
| Register evidence with ISO/IEC 27037 metadata (README #1) | Partly - creates #2, but it can't be verified or managed; duplicates accepted | UX-05, UX-16 |
| Audit-first access: logAccess before decrypt (SECURITY §4.5) | Partly - logged, but as actor "None"; nothing is decrypted | UX-06, UX-07 |
| Two-step handover, propose → accept (README #3) | **Not offered** | UX-08 |
| EIP-712 signed handover (README #4) | Partly - custody moves; no signature exists, toast says "verified" | UX-11 |
| Grant / revoke access | Works for I as custodian; Court can't be a grantee | UX-46 |
| Seal / unseal (README #5) | Works | - |
| Evidentiary hold place / release (README #6) | Works; hidden by Legal Status when sealed | UX-13 |
| Multi-party disposal / key shredding (README #7) | Partly - one party can do both steps; overclaims what is deleted | UX-09 |
| Court certificate (README #8) | **Fails on honesty** | UX-04 |
| Immutable audit trail (README overview) | Partly - random tx hashes, wrong actor, mixed items, resets on reload | UX-03, UX-07, UX-18, UX-45 |
| 3-layer tamper detection demo | Partly - fixed strings, nothing computed | UX-11 |
| Two-person role council (SECURITY §4.2) | Partly - reaches EXECUTED, target's role unchanged | UX-11 |
| Witness status (SECURITY §4.3) | Partly - "Unverified" without the reason; hard-coded "Verified" fallback in code | UX-10 |
| Role-based access, Outsider shut out (DEMO_GUIDE §2A) | **Fails** - O sees every tab, card, enabled button and decrypted text | UX-06, UX-12 |
| Simulation banner always visible (SECURITY §4.4) | Partly - scrolls away; absent from exports | UX-04, UX-47 |
| Merkle bulk dossiers (README #2) | Not offered in the UI | - |
| Works on a phone | **Fails** - page is 789 px wide at 390 px; 4 of 6 tabs off-screen | UX-27, UX-28 |
| Works without a mouse / with a screen reader | **Fails** for file selection and for all feedback | UX-24, UX-25 |

## 4. S1 - misleads on the outcome

| id | Finding | Evidence | Suggested fix | Verified |
|---|---|---|---|---|
| UX-01 | **The authentic file verifies as forged.** The seeded anchor for Evidence #1 is `0x90acf3be…` (`app.js:138`). "Load Original Sample" hashes `SAMPLE_TEXT` (`app.js:40`) to `0x96aeda5a…`. The DEMO_GUIDE's "Authentic Original Evidence" `sample/case_FIR_2026_042_cctv_log.txt` hashes to `0xf233aa24…` as committed (LF) and `0x6e33d32a…` on a Windows checkout (CRLF). Both show *"TAMPER DETECTED … Evidence has been modified or forged!"*. Only `sample/evidence_report.txt` matches, and **only with LF line endings**: on a Windows checkout with `core.autocrlf=true` it becomes `0xb7b95b3f…` and also fails, because the repo has no `.gitattributes`. | `flows/out-01`; hashes computed with Node `crypto` and `sha256sum` | Anchor the seed from the exact bytes the sample button hashes (or make the button fetch `sample/evidence_report.txt`). Add `.gitattributes` with `sample/** -text` so sample bytes never change on checkout. Add a test: "original sample verifies, tampered sample doesn't" | Clicked + computed |
| UX-02 | **No action reaches a chain, but the UI says it did - in both modes.** `app.js` has no `sendTransaction`, `ethers.Contract` or `eth_call`; its only network calls are `/api/config`, `/auth/*`, `/api/witness/status`. Register, transfer, grant, seal, hold, dispose, log-access and council all mutate `state` (`app.js:133-221`), which is lost on reload. The copy still says "SHA-256 anchored on-chain", "Immutable on-chain history", "Encrypt & Anchor on Blockchain", "Access recorded in on-chain audit log (Block #19)", "Role changes enforced on-chain", and ~41 toasts begin `[REVERT]`. In real mode (no banner), the seeded case FIR-2026-0042, its audit trail and a 2-of-3 council of Hardhat addresses render as if read from the contract, and actions are attributed to `currentPersonaKey` ("investigator") whatever the signed-in role. | grep of `app.js`; `app.js:63, 133-221, 1736-1745` | One `chainStatus` (`demo` / `connected` / `none`) that every copy helper reads. Demo: "Simulated - …". Real mode: start empty and disable writes with the reason until contract calls exist; show success only after a mined receipt | Code. Real mode not run |
| UX-03 | **Audit-trail transaction hashes are invented.** `Tx: 0x${Math.random().toString(16).slice(2, 10)}...` is rendered for every event and regenerated on every re-render; the same three rows showed different ids before and after one persona switch. | `app.js:708`; `screens/desktop-1440-timeline.jpg` | Render the event's real tx hash; in demo a stable id labelled "simulated", or `—` | Clicked + code |
| UX-04 | **The court certificate asserts legal facts unconditionally and can't be told from a real one.** It prints "Legal Standard: Compliant with Federal Rules of Evidence 902(13)/(14) & ISO/IEC 27037:2012", "has maintained an unbroken, cryptographically verified chain of custody" and "Electronic Signature: [VERIFIED ON-CHAIN …]" (`app.js:1803, 1820-1821`) with no conditions: it was exported by the Unauthorized Observer, after every verification failed, and after expungement. It has no demo marker, uses the CLI's file name `CERTIFICATE_EVIDENCE_1.md`, lists other items' and council events, has no tx hashes (README #8 promises them), and its Markdown table is broken (5 header columns, 4 separator columns). `docs/ARCHITECTURE.md:81` says the system provides "not formal legal certification". | `app.js:1795-1831`; exported file inspected | Build it from data: this item's events only, the last verification result and time (or "not verified in this session"), seal/hold/disposal state, the ARCHITECTURE disclaimer verbatim, a "SIMULATION - NOT EVIDENCE" header and footer and `SIMULATION_` file prefix in demo. Refuse (disabled, with reason) for roles without access | Clicked + code |
| UX-05 | **Every screen acts on Evidence #1 only.** The "Evidence Record" select has no `change` listener and `currentEvidenceId` is never reassigned (`app.js:64`). Choosing #2 changes nothing; uploading the exact file just registered as #2 gives TAMPER DETECTED against #1's hash; stat cards, provenance, custody, seal, hold, disposal and the certificate all stay on #1. Card headings hard-code "Evidence #1" (`index.html:267, 304`). | `flows/out-02`, `flows/out-06` (Legal Status shows #1's EXPUNGED while #2 is selected) | Wire the select → set the id → re-render every panel from one `selectedEvidence()` accessor; derive "Evidence #n" in copy | Clicked + code |
| UX-06 | **Decrypted content leaks across roles and survives expungement - and nothing was decrypted.** After the Investigator decrypts, switching to Defense (no access) or Unauthorized Observer leaves the plaintext on screen; it also stays after the item is expunged. The text shown is the constant `SAMPLE_TEXT` for any item ("SanDisk Extreme SSD … #SD-98214"), contradicting the provenance card beside it (Samsung 980 PRO). The toast says "RSA-OAEP private key unwrapped AES key from IndexedDB. File decrypted." | `flows/out-03`, `flows/out-06`; `app.js:970-1022` | Clear and hide the viewer on persona change, evidence change, seal and disposal. Until real decryption exists, label it "Sample content - not decrypted" or disable the button with the reason | Clicked + code |
| UX-07 | **The audit trail names the wrong actor.** In demo `userRole` is 0, so `ROLE_NAMES[0]` = "None" wins the `\|\|`: the Investigator's decrypt is recorded as "None invoked logAccess() on-chain prior to key unwrap", and that line is copied into the certificate. Defense's refusal reads "None has not been granted access". | `app.js:990, 1003` | One `activeRoleLabel()` helper for every actor string; never fall through to `ROLE_NAMES[0]` | Clicked + code |
| UX-08 | **The promised two-step handover is missing.** README #3 promises propose → accept, which "eliminates unilateral push vulnerabilities", and DEMO_GUIDE tells the presenter to show the Lab accepting. "Execute Custody Transfer" sets `ev.custodian = target` in one click; no Accept control exists anywhere. | `app.js:1026-1062`; `index.html:279` | "Propose handover" for the custodian → pending notice + "Accept custody" / "Decline" for the named recipient, matching `proposeCustodyTransfer` / `acceptCustody` | Clicked + code |
| UX-09 | **Disposal ("key shredding") can be done by one party and overclaims what it destroys.** Once Court is custodian it proposed *and* confirmed alone; the audit says "Multi-party expungement confirmed". The irreversible "Execute Key Shredding" has no confirm step. The copy says "permanently shred AES keys", shows SHREDDED for every party and "LAWFULLY EXPUNGED", but the contract deletes only the confirming custodian's wrapped key (`ChainCustody.sol:483`), and `getWrappedKey` (`:513`) has no disposed check, so other recipients' wrapped keys stay readable. "Lawfully" is a legal judgement the software can't make. | `app.js:552, 670, 1253-1333`; `ChainCustody.sol:470-486, 513-515` | Warn or block when proposer == custodian; add a confirm step that names the item and what can't come back; copy states exactly what was deleted ("Storage pointer and custodian key deleted; keys already issued to other parties are not affected"); use "Disposed". Raise the `getWrappedKey` gap as a contract issue | Clicked + contract read |
| UX-10 | **The witness badge can show a fabricated green "Verified".** If `/api/witness/status` fails in demo mode the error is swallowed (`catch (e) {}`) and the badge is forced to `witness-badge verified` "Witness: Verified (block #16)". The real states are also collapsed: "not configured" (today's actual server answer), "no checkpoints" and "history mismatch at block N" (a detected rewrite) all render as the same "Witness: Unverified"; the server's `statusText` is ignored. | `app.js:1776-1791` | Delete the fallback; render `statusText` with three distinct looks (not configured / behind / mismatch); `—` when unknown | Code; the fallback branch was not triggered at runtime |

## 5. S2 - excludes users or invites a consequential misreading

| id | Finding | Evidence | Suggested fix | Verified |
|---|---|---|---|---|
| UX-11 | **Simulated operations are announced as real.** "Gasless EIP-712 signature verified!" with no signature created; the "Live Tamper Sandbox" returns fixed strings (0 network requests, no crypto); council "Role changes enforced on-chain" while the target's role stayed "None"; "Evidence #2 successfully encrypted and anchored" while `handleRegFile` only hashes. | `app.js:835, 1104, 1455-1471, 1542, 1547-1566` | Mark every simulated result inline; reserve "verified/enforced" for code that actually checked. Rename "Tamper demonstration (scripted)" or run the real checks on the sample | Clicked + code |
| UX-12 | **Refusals come after the click, never up front - and the demo hides role separation.** In demo every persona, including the Unauthorized Observer, sees all 6 tabs, every card and enabled buttons; the DEMO_GUIDE §2A promise ("all action cards disappear… warning banner") is not met (`notRegisteredBanner` is forced hidden, `app.js:399`). Refusal is a 4-second toast. In real mode the opposite gap: a fixed role→card table hides the Disposal and Hold cards from Investigator and Lab, so a custodian can never "Execute Key Shredding (Custodian)" and expungement can't complete. | `app.js:399-454`; `flows/out-04` | Render each control's enabled state and a visible reason from the same predicate the click handler uses (role **and** state, e.g. "Only the custodian (Lab) can transfer", "Disabled while sealed"). Derive card visibility from the contract rules (court OR current custodian) | Clicked (demo) + code (real) |
| UX-13 | **Legal Status shows one state and hides the rest.** A single if/else: sealed *and* under a 7-year hold shows only "SEALED"; a pending disposal still shows "ACTIVE / Normal Chain of Custody". The card also never names which evidence it describes. | `app.js:636-652`; `flows/out-04` | List every active flag ("Sealed · Hold until 20 Nov 2033 · Disposal proposed"), prefixed with the evidence id | Clicked + code |
| UX-14 | **Status words and colours say the opposite of the state.** The hold card shows a green "ACTIVE" pill next to "Status: No Active Hold"; "ACTIVE" also means unsealed and not-disposed on neighbouring cards. Absence states (unsealed, no hold, not expunged) are green success banners; an *expired* hold is a green "EXPIRED"; the same "hold active" is brass in the stat strip and amber in the pill. | `app.js:519-533, 565-569, 600-603, 644-647`; `screens/desktop-1440-custody.jpg` | Each pill names its own control's state ("Not sealed", "No hold", "Hold until …", "Hold expired", "Disposal proposed"); neutral grey for "none"; one colour per state everywhere | Screenshot + code |
| UX-15 | **The mode badge is always green and pulsing**, even when it says "Disconnected" or "Sign-In Required"; JS only changes its text. | `index.html:43-46`; `app.js:1703, 1745`; `style.css:137-163` | Class per state; remove the pulse (no state turns it off) | Code |
| UX-16 | **The same file registers twice.** Re-registering produced "Evidence #3" with #2's hash; the contract would revert `AlreadyRegistered`. Two custody records for one artefact. | `app.js:1473-1544`; `ChainCustody.sol:168` | Check the hash before enabling the button: "Already registered as Evidence #2" | Clicked |
| UX-17 | **Legal and forensic presets are entered as real values, and reasons are reused for the opposite action.** Court order "Order 2026-CR-8921: Impounded by Judicial Order", decree, hold basis, FIR, serial, badge and jurisdiction are `value=` not placeholders, unlabelled as presets; the "reason required" check can never fire. Unseal and Release reuse the seal/hold reason, so the audit records *"Court unsealed Evidence #1: 'Order 2026-CR-8921: Impounded by Judicial Order'"*. A new registration silently inherits #1's provenance. | `index.html:219, 227-240, 324, 346, 375, 380`; `app.js:1234, 1419` | Empty values with examples in `placeholder`; a demo-only "Fill demo values" button; a separate required reason for unseal and release; reset the form after success | Clicked + code |
| UX-18 | **One global audit log for everything.** `state.auditTrail` mixes all evidence items and council actions; it feeds the timeline, the "Audit Log Count" card and the certificate for "Evidence #1". Council events show the generic tag "EVENT". | `app.js:680-714, 1814-1817` | Store the evidence id on each event; filter by selected item; separate council log | Code |
| UX-19 | **Legal authority is misattributed and jurisdictions are mixed.** "Pursuant to FRE 902 … the Court Magistrate can freeze" (FRE 902 is self-authentication, not sealing); FRCP 37(e) (civil ESI sanctions) as the basis for criminal holds; "7 Years (Statutory Evidence Mandate)" and "1 Year (Grand Jury Investigation)" name no statute; Indian FIR numbering next to US badge/jurisdiction codes. | `index.html:315, 360, 373-375, 380` | Remove statute citations from control copy, or drive them from a jurisdiction setting; flag for legal review. *(This is a reading of the strings, not legal advice.)* | Strings |
| UX-20 | **A network error is reported as "not registered".** `getRoleFromContract` returns role 0 on any error; the UI then says "this address is not registered on the ChainCustody smart contract" and "Signed in as None". | `scripts/auth.js:279-281`; `index.html:60` | Return the error; say "Could not read your role (network error) - Retry" | Code |
| UX-21 | **One case, three different seized devices.** FIR-2026-0042 is a SanDisk SSD #SD-98214 (sample text), a Samsung 980 PRO (provenance card) and a laptop drive SN-778-AX (sample file) - the inconsistency defence counsel would challenge first. | `app.js:40-46`; `index.html:164`; `sample/evidence_report.txt` | One consistent fictional dataset, marked fictional | Read |
| UX-22 | **Unexplained jargon for magistrates and counsel.** EIP-712, gasless, relay, nonce, SIWE, witness, CID, IPFS, RSA-OAEP, IndexedDB, `logAccess()`, M-of-N multi-sig, "Execute on Chain". The only tooltips are also jargon. | `index.html:170, 184, 280, 414-446, 455` | Plain outcome first ("Sign handover now, submit later - no fee"), mechanism in small text or a "Technical details" disclosure | Strings |
| UX-23 | **Verification copy accuses on mismatch and overstates on match.** Mismatch: "Evidence has been modified or forged!" (it may simply be a different file - and UX-05 makes that common). Match: "100% BIT-FOR-BIT MATCH" when a SHA-256 comparison was done. | `app.js:856, 867` | "This file's SHA-256 does not match Evidence #1 - it is not the registered file." / "SHA-256 matches the hash registered for Evidence #1" | Code |
| UX-24 | **Keyboard and screen-reader users can't choose a file.** Both drop zones are `<div>`s with a click listener; the file inputs have the `hidden` attribute; "browse" is a `<span>`. Keyboard users can't register evidence at all (the Register button stays disabled) and can only verify the two built-in samples. | `index.html:125-130, 203-208`; a11y snapshots show no file control | Make "browse" a real `<button>` / `<label for>`; hide the input visually, not with `hidden`. WCAG 2.1.1, 4.1.2 | Code + a11y tree |
| UX-25 | **No live regions anywhere** (0 `aria-` / `role=` attributes in all three files). The VERIFIED / TAMPER DETECTED verdict, all 85 toasts (61 errors, including every revert) and the tamper results are never announced; the verdict also sits *above* its trigger buttons in DOM order. A screen-reader user can't tell success from failure. | `index.html:64, 151-178`; `app.js:343-348, 852-870` | One persistent `role="status"` and one `role="alert"` region written by an `announce()` helper wherever `toast()` is called. WCAG 4.1.3 | Code |
| UX-26 | **The status words that carry integrity and legal meaning fail contrast.** VERIFIED / TAMPER DETECTED badges 3.03:1; GRANTED 3.89, NO ACCESS 3.85; ACTIVE / SEALED / HOLD chips 2.80-3.33; witness badge 3.69; white on the danger buttons 3.45; success / error toasts 4.18 / 4.07 (need 4.5). Cause: mid-tone status hues used as text on their own 15% tint, sometimes tint on tint. | [`contrast.js`](contrast.js) output | Add `--success-ink` / `--danger-ink` / `--warning-ink` that reach ≥ 4.5:1 (e.g. `#8DB096`, `#D99089`, `#D4AE6D`), drop the tint fills, dark text on danger buttons; re-run `contrast.js`. WCAG 1.4.3 | Computed from tokens |
| UX-27 | **The page doesn't fit a phone.** At 390x844 `scrollWidth` = 789: `.app-header` and `.header-controls` are flex rows that can't wrap, and `style.css` has a single media query (900 px). The witness badge and Sign In are off-screen; "Connect Wallet & Sign In" wraps to 4 lines. | `style.css:72-83, 104-108, 288`; `screens/phone-390-*.jpg` | A 720 px breakpoint: header wraps (`flex-wrap: wrap`), secondary controls on their own row, header static on phones. WCAG 1.4.10 | Measured |
| UX-28 | **On a phone only 2 of 6 tabs are visible** with no scroll cue, and the active tab is cut off at the left edge ("dy & Access", "ail"). Defense's main task, the Audit Trail, is the hidden third tab. Card badges ("COURT ORDER ONLY", "DUAL AUTHORIZATION PROTOCOL") are absolutely positioned and sit on top of the card titles - exactly the who-may-act information. | `style.css:212-219, 316-328`; `screens/phone-390-custody.jpg`, `phone-390-timeline.jpg`, `phone-390-council.jpg` | Wrap the tabs to two rows under 720 px (or `scrollIntoView` the active tab); put `.card-badge` in normal flow above the heading | Screenshots |
| UX-29 | **The three selects that decide which evidence, whose custody and whose access have no accessible name** (`<label>` without `for`). A screen reader announces only "Court (Judge), combobox". | `index.html:115-116, 270-271, 291-292`; a11y snapshot refs e54, e134, e144 | Add `for=` to each; check that every `<label>` has `for` or wraps its control. WCAG 1.3.1, 4.1.2 | Code + a11y tree |
| UX-30 | **Action colours don't carry one meaning.** The Custody tab has 11 buttons, 7 filled in 5 hues. Amber is used for reversible Seal and for Propose Expungement; red fill for reversible Revoke and irreversible Key Shredding; green fill for an action (Grant). Brass primary vs amber warning is 1.20:1 in luminance, green vs red fills 1.03:1. Red also marks harmless demo buttons. | `index.html:278-386`; `style.css:517-569, 824-889` | Filled red = irreversible only; outline-danger for reversible removals; one primary per card; neutral outline for demo loaders; drop `.btn-success` / `.btn-warning` | Screenshot + computed |

## 6. S3 - friction

| id | Area | Finding | Where | Fix |
|---|---|---|---|---|
| UX-31 | Flows | "Refresh Trail" has no listener - nothing happens | `index.html:399` | Wire it or remove it |
| UX-32 | Flows | Unauthorized Observer's own address (`app.js:34`) fails the EIP-55 checksum; pasting it into Council gives "InvalidMember()" with no mention of the checksum | `app.js:34` | Fix the constant; explain checksum errors |
| UX-33 | Flows | The UI blocks decryption while sealed, but the contract's `logAccess` has no seal check - the UI states a rule the contract doesn't enforce | `app.js:979-981`; `ChainCustody.sol:380` | Align UI and contract (either way), and say which |
| UX-34 | Flows | Council M, N, members, "7 Days" and "Council Contract: -" are hard-coded, not read from `RoleCouncil`; approvers shown as bare addresses | `app.js:199-227`; `index.html:500-503` | Read from the contract or show `—` "not connected"; show role names |
| UX-35 | Flows | No busy guard: a double press of "Decrypt & View" writes `AccessLogged` twice; "Connect Wallet" can start two sign-in flows | `app.js:971-1022, 1629-1691` | Busy flag + `aria-busy`; ~600 ms repeat window |
| UX-36 | A11y | Role switcher has `outline: none` and no focus style; text fields replace the outline with a 1 px border-colour change; no `:focus-visible` rule anywhere | `style.css:134, 608` | One global `:focus-visible` ring ≥ 3:1. WCAG 2.4.7 |
| UX-37 | A11y | Tab bar exposes no state (no `aria-selected` / `aria-pressed` / `aria-current`) and switching gives no focus move or announcement | `index.html:98-105` | Full ARIA tabs pattern or `aria-pressed` + focus the panel's `h2`; never half a pattern |
| UX-38 | A11y | Focus drops to `<body>` when a focused button disables itself (Seal, Unseal, Propose, Shred, Cancel, Release, Register), when Close hides its own card, and when council rows are rebuilt with `innerHTML` | `app.js:526-605, 734, 966, 1543` | `restoreFocus(preferred, fallback)` after every re-render. WCAG 2.4.3 |
| UX-39 | A11y | Disabled buttons give no reason and leave the tab order; enabled-but-forbidden buttons fail silently | `index.html:246, 329, 351-352, 386` | `aria-disabled` + one line of reason via `aria-describedby` |
| UX-40 | A11y | "Audit-first" (opening records your access first) is explained only in a hover `title`; the viewer opens with no focus move; Esc does nothing (no `keydown` handler in `app.js`) | `index.html:170, 173, 280` | Visible consequence text; focus the viewer heading; Esc closes and returns focus |
| UX-41 | A11y | No `prefers-reduced-motion`; infinite pulse, tab fade-in and toast slide ignore it | `style.css:150-163, 250, 807` | Reduced-motion block; remove the pulse. WCAG 2.2.2 |
| UX-42 | A11y | Secondary text fails contrast: `--text-dim` 3.43-4.24:1 (stat labels, timeline meta, hints); brass small text 4.46:1; field and drop-zone edges 1.36-1.49:1; active tab fill vs page 1.22:1 | `contrast.js` | `--text-dim: #8E9A99`; `--primary-ink`; `--field-line` ≥ 3:1. WCAG 1.4.3, 1.4.11 |
| UX-43 | A11y | Touch targets under 44 px: `.btn-sm` ≈ 33 px (tamper buttons, Sign Approval), viewer Close ≈ 28 px, role switcher ≈ 20 px tall (computed) | `style.css:498-510, 578-581`; `index.html:185` | `(pointer: coarse)` min-height 44 px |
| UX-44 | A11y | Toast: one element, 4 s, no pause; timers aren't cleared so a second toast is cut short; `warning` type has no style; may sit off-screen at 400% zoom | `app.js:343-348`; `style.css:795-816` | Persistent status line near the acted-on card; clear timers |
| UX-45 | A11y / Flows | Sticky header can cover focused controls (no `scroll-padding-top`); reload silently resets all demo state while the UI says "Immutable" | `style.css:72-83`; `app.js:133-221` | `scroll-padding-top`; "Demo state resets on reload" + a Reset button |
| UX-46 | IA | Court can't be granted read access (target list is Lab and Defense only) with no explanation | `index.html:292-295` | Offer every registered party or say why not |
| UX-47 | Visual | Simulation banner is an all-caps inverted brass band that scrolls away; on a phone it wraps to 2 lines | `style.css:892-902`; `flows/out-01` | Compact, persistent "Demo data" marker in the header row |
| UX-48 | Visual | No hero on Verify: the verdict starts at the fold, same size as the provenance box; 5 buttons in 3 rows; primary is "Decrypt & View", not verification; demo loaders sit beside legal actions | `index.html:122-189`; `screens/desktop-1440-verify.jpg` | Full-width verdict row; demo samples as a quiet demo-only row |
| UX-49 | Visual | Custody tab stacks 5 cards and 4 protocols with no hero and nothing marking which card is the current persona's | `screens/desktop-1440-custody.jpg` | Current legal state first; the persona's card expanded, others one line each |
| UX-50 | Visual | Five equal stat cards: "Legal Status" wraps alone onto row 2 at 1440 (5×240 + gaps = 1280 > 1232 px); on phone the cards fill the first screen; "Active Role" repeats the header | `style.css:173-178`; `index.html:69-95` | One status line: "Evidence #1 · FIR-2026-0042 · Custodian: Investigator · Legal: Active · 4 events" |
| UX-51 | Visual | Decorative surface effects that report no state: 6 accent side stripes (`index.html:182, 312, 334, 357`; `style.css:786, 790`), glass header (`backdrop-filter: blur(12px)`, `style.css:78`), brass hover glow (`:525`), perpetual pulse dot (`:156`), 15 tinted pill/banner classes (several tint-in-tint), border + shadow on every card | `style.css` | Remove; status = coloured word on the plain surface |
| UX-52 | Visual | Token discipline: 32 colour literals outside `:root`, 27 visual inline `style=""` in `index.html`, 25 inline styles in `app.js`; `var(--bg-elevated)` used but never defined (`app.js:757`) | `style.css`, `index.html`, `app.js` | Tokens + classes; JS toggles classes only |
| UX-53 | Visual | No type or spacing scale: 16 font sizes (0.7-1.5 rem), 800 weights, 22 spacing values; no `tabular-nums` on blocks, counts, dates | `style.css` | 5-step type scale, 4/8/12/16/24/32 spacing, tabular figures |
| UX-54 | Visual / privacy | Google Fonts are loaded and allowed in the CSP but never used (neither family is in `--font-sans` / `--font-mono`); every visitor's IP still goes to Google from a forensic tool | `index.html:8-10`; `style.css:52-53`; `server.js:89` | Remove the links and CSP entries, or self-host and use them |
| UX-55 | Visual | Phone layout details: provenance label and value collide ("AcquisitionFTK Imager"); "EvidenceMetadataAnchored" overflows the timeline card; council addresses break into a 4-character column; button labels squeeze to 3-4 lines | `style.css:386-391, 404, 583-586, 716-723`; `phone-390-*` | `gap` + `min-width: 0` + `flex-wrap`; `overflow-wrap: anywhere` instead of `break-all` |
| UX-56 | Visual | Dark only; no light or print styles although certificates and screens get printed and projected in court | `style.css` | `color-scheme: dark` now; print stylesheet; light theme later |
| UX-57 | Copy | One party has up to four names: "Court (Magistrate)" / "Court (Judge)" / "Court Magistrate / Judge" / "Court"; "Forensic Lab" / "Lab" / "Forensic Analyst"; "Unauthorized Observer" / "None" / "Unregistered" | `index.html:34-38, 272-274, 293, 483-486`; `app.js:7-38` | One `ROLES` table drives every label |
| UX-58 | Copy | One protocol has several names: Disposal / Expungement / Key Shredding / destruction; Hold / Evidentiary Hold / Statutory Retention Lock / Litigation Hold; Seal / Impoundment / freeze | `index.html`, `app.js` | A glossary with one noun per protocol |
| UX-59 | Copy | Errors are developer revert dumps ending in "!": `[REVERT] NotCustodian(): Only current custodian (Investigator) can transfer custody!` - cause but no next step; the successful expungement toast uses the red error style | ~41 toasts in `app.js`; `:1332` | `explainError(code, ctx)` → cause + what to do; code in small text |
| UX-60 | Copy | Times: seeded events have no zone, new ones are UTC without saying so, holds use local time, the certificate `toUTCString` | `app.js:171, 516, 773, 810, 1057, 1396, 1797` | One formatter, e.g. `2026-11-20 09:06:14 UTC` |
| UX-61 | Copy | Timeline titles are raw event names ("CustodyTransferredWithSignature"); "Lab accessed and verified evidence integrity" claims a verification `logAccess` doesn't do | `app.js:192, 681-695, 949` | Human titles, event name in small mono |
| UX-62 | IA | Tabs don't match jobs: Verify mixes integrity with decrypt, record-access and certificate export; Custody mixes routine handover with court orders and a destructive action, ordered … Disposal → Hold (the hold that blocks disposal comes after it); no evidence list | `index.html:98-391` | Evidence (list → item) · Custody & access · Court orders (seal, hold, disposal last) · Audit trail & export · Administration · demo-only Tamper demonstration |

## 7. S4 - polish

| id | Finding | Where |
|---|---|---|
| UX-63 | "7 Years" is 2555 days - a hold placed 2026-11-20 ends 11/18/2033 | `index.html:375` |
| UX-64 | Static placeholders before JS runs disagree with the data ("6 Events" vs 4, "0xInvestigator...", "Item(s)") | `index.html:73, 77, 87` |
| UX-65 | Bracketed all-caps mono eyebrow "[ SELECT OR DROP EVIDENCE FILE ]" (read aloud with brackets), all-caps headings, mono used for prose captions | `index.html:126, 204`; `style.css:205-209, 351-358` |
| UX-66 | Every timeline event has the same brass dot and grey tag - SEAL and EXPUNGE look like routine access | `style.css:697-706` |
| UX-67 | Register metadata heading jumps h2 → h4; timeline isn't an `<ol>`; page title never names the view | `index.html:224`; `app.js:697-714` |
| UX-68 | Tamper tab: three equal cards with numbered kickers and identical red buttons | `index.html:418-448` |
| UX-69 | Certificate reference `CC-CERT-2026-000${id}` hard-codes the year and padding | `app.js:1801` |
| UX-70 | `.badge-sealed` is dead CSS; a 13-line alias layer (`--courtroom-slate` …) is mostly unused | `style.css:18-30, 858-867` |

## 8. Fix the class, not the instance - suggested order

Most findings collapse into seven root causes. Fixing them in this order removes the S1s first and makes later fixes smaller:

1. **Make the demo's data true** (UX-01, UX-21). Anchor the seed from the real sample bytes, add `.gitattributes` (`sample/** -text`), one consistent fictional case. Add a test that the original verifies and the tampered sample doesn't.
2. **One source for "where did this come from"** (UX-02, UX-03, UX-04, UX-06, UX-10, UX-11, UX-45). A `chainStatus` that every copy helper reads: demo results say "simulated", real mode shows only what a mined receipt or contract read returned, and no random or hard-coded success values remain. Rebuild the certificate from data with the ARCHITECTURE.md disclaimer.
3. **One selected evidence item, one scoped log** (UX-05, UX-13, UX-18, UX-50). A `selectedEvidence()` accessor, events tagged with their evidence id, every panel re-rendered on change.
4. **One permission predicate, rendered up front** (UX-08, UX-09, UX-12, UX-16, UX-33, UX-39). The same role + state check drives each control's enabled state, its visible reason, and the click handler. Add propose → accept handover and a confirm step for disposal.
5. **One feedback channel** (UX-25, UX-38, UX-40, UX-44, UX-59). `announce()` writing to persistent `status` / `alert` regions, `restoreFocus()`, `explainError()`.
6. **One state → word → colour table** (UX-14, UX-15, UX-26, UX-30, UX-42, UX-51). Ink tokens that pass 4.5:1, status as a coloured word on the plain surface, filled red only for the irreversible action. Re-run `contrast.js` until it reports 0 FAIL.
7. **One phone breakpoint** (UX-27, UX-28, UX-43, UX-55). A 720 px block that wraps the header, tabs, button groups and detail rows; badges in normal flow; coarse-pointer target sizes. Test at 320 and 390 px.

Then the copy pass: role table and glossary (UX-57, UX-58), plain language for court users (UX-19, UX-22, UX-23), presets as placeholders (UX-17).

## 9. What works - keep it

- **Real in-browser SHA-256.** The computed hashes matched `sha256sum` for every sample tried, and the anchored and uploaded hashes sit side by side in full, in mono, wrapping instead of overflowing - the right evidence layout once the anchor is correct.
- **The rule model mirrors the contract.** `NotCustodian`, `EvidenceIsSealed`, `EvidentiaryHoldActive`, `NothingToRevoke`, `CannotRevokeCustodian` all fire where the contract would revert, and seal and hold correctly block transfer, grant and disposal.
- **Stat cards update immediately and correctly** for Evidence #1 across grant, revoke, transfer, seal, hold, propose, cancel and confirm.
- **The Register tab is the model screen:** one drop zone, labelled fields, one full-width primary that stays disabled until a file is chosen.
- **Status is never colour alone** - every state has a word (VERIFIED, SEALED, NO ACCESS …).
- **Sound page skeleton:** `lang="en"`, one `<h1>`, one `<main>`, `<header>`, `<nav>`, an `h2` per panel; every action is a real `<button>`; no invalid ARIA; 12 of 15 fields correctly labelled; primary text contrast 11-14:1; all sizes in `rem`; pinch-zoom allowed.
- **The council enforces membership and threshold** (Execute appears only at 2/2).
- **The timeline structure is right:** a spine, newest first, block, time, tag, actor and detail per row.
- **Role limits named on some controls** ("Court Order Only", "Release Hold (Court Only)", "Execute Key Shredding (Custodian)") - extend this pattern everywhere.
- **The server's rate-limit message is a model error:** cause, limit and `Retry-After`.
- **Zero console errors or warnings** across all flows.
- **SECURITY.md §3 is candid about limits** (pre-registration tampering, leaked keys). That text deserves a place in the UI and the certificate.

## 10. Not checked

- **Real (non-demo) mode** - needs a wallet, a deployed contract and a server restart. Every real-mode finding (UX-02, UX-12 second half, UX-20, UX-34) comes from reading the code.
- **The witness "Verified (block #16)" fallback** (UX-10) was read in code, not triggered.
- **Screen readers and keyboard-only runs** (NVDA, JAWS, VoiceOver) were not performed; accessibility findings come from code, the accessibility tree and computed contrast. Contrast was computed from tokens, not sampled from pixels.
- **Widths other than 1440 and 390 px**, 200%/400% zoom, and touch emulation. The 320 px overflow is computed.
- **Personas other than Investigator in the static screenshots** - other personas were exercised in the flows (`screens/flows/`).
- **Large files** - `FileReader.readAsArrayBuffer` loads the whole file with no progress state; not tried with a disk image.
- **`scripts/certify.js`** (the CLI certificate) was not audited line by line, only the dashboard export.
- **Legal applicability** of the cited rules is a reading of the strings, not legal advice.
