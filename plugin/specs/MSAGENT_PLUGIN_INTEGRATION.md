# msAgent API support in the mstt plugin — integration design

Aligned with [`ms-agent/docs/MSTT_INTEGRATION_ARCHITECTURE.md`](../../../ms-agent/docs/MSTT_INTEGRATION_ARCHITECTURE.md) (sibling repo). **Agreed product decisions** are recorded there (§2); this spec focuses on **where to implement** in `plugin/src` and the **web** sanitizer sidebar.

---

## 1. Decisions applied here (summary)

- **Problems** → mstt only. **fixWithPayload** → not in v1; use **`fixProblem(index)`** only.
- After sanitizer success → **`msagent.parseLog`** automatically with **absolute** log path (`suppressMessage` recommended).
- **msAgent missing** → **hide** AI fix controls (no install prompt until msAgent is published).
- **No extension id** yet → detect msAgent without `extensionDependencies` (e.g. `getCommands` includes `msagent.parseLog`, or equivalent).
- **Index** = **0-based** sequential index matching **msAgent `logParser` order** for that log; mstt’s **duplicated parser** must match that order.
- **Paths** → **absolute** between plugins and for `Uri` in diagnostics.
- **AI fix entry (v1)** → **sanitizer sidebar only** (not Operate, not editor Quick Fix).
- **msAgent behavior** → unchanged; mstt does not alter msAgent error/LLM UX.
- **Parser** → duplicated in mstt for now.
- **Feature flag** → `op-devtools.sanitizer.enableMsAgentAiFix` (default `false`). Code: `isMsAgentSanitizerAiFixEnabled()` or `getFeatureFlag('ENABLE_MSAGENT_SANITIZER_AI_FIX')` in `plugin/src/feature-flags.ts`.
- **Telemetry** → out of scope (msAgent team).

---

## 2. Integration layers

| Layer | Role |
|-------|------|
| **Feature flag** | Enable integration only for users who opt in and have msAgent installed manually. |
| **Bridge service** (new) | `parseLog` / `loadMsAgentLog(absolutePath)`, `fixProblem(index)`; **presence check** (no hard-coded marketplace id). |
| **`sanitizer-service.ts`** | On successful `mssanitizer`, call bridge **`loadMsAgentLog`** (automatic). |
| **`ms-sanitizer-panel-view.ts`** | `postMessage` handlers: **AI fix** → `fixProblem(index)` only for v1. |
| **`mstt/web` sanitizer sidebar** | Show AI fix **only if** host reports msAgent available + flag on; send **absolute** paths and **index** per §1. |

**v1:** Do **not** require **`ms-sanitizer-controller` / ApiServer** for AI fix unless you prefer one code path; sidebar uses **postMessage** today — **panel + bridge** is sufficient. Optional: mirror methods on `msSanitizer` API for future Operate reuse.

---

## 3. Bridge module (new)

**Suggested path:** `plugin/src/service/ms-agent-bridge.service.ts`

| Method | Behavior |
|--------|----------|
| `isMsAgentIntegrationAvailable(): boolean` | Feature flag **on** **and** msAgent commands appear to exist (see §4). |
| `loadMsAgentLog(absoluteLogPath: string, options?: { suppressMessage?: boolean })` | `vscode.Uri.file(absoluteLogPath)` → `executeCommand('msagent.parseLog', uri, options)`. |
| `fixMsAgentProblem(index: number)` | `executeCommand('msagent.fixProblem', index)`. |

All paths use **absolute** `fsPath` / `Uri.file` as agreed.

---

## 4. Detecting msAgent without a marketplace extension id

Until publication, **do not** rely on `extensionDependencies` or a fixed `getExtension('publisher.name')` id.

**Options (pick one in implementation):**

- After workspace activation, `(await vscode.commands.getCommands(true)).includes('msagent.parseLog')`, or  
- Try/catch around `executeCommand('msagent.parseLog', ...)` and treat failure as unavailable.

Re-check when the user installs/uninstalls the development VSIX (may require window reload — document for testers).

---

## 5. Index and duplicate parser

- mstt parses the **same** log file msAgent loads (absolute path).
- Enumeration of findings in the **sidebar** and in **Problems** must use the **same order** as `ms-agent/src/parser/logParser.ts` produces in `diagnostics[]` for that file.
- Row / finding at UI position **i** calls **`fixProblem(i)`** (0-based).

If orders diverge, the wrong issue will be fixed — **treat order parity as a test requirement** (golden log fixture).

---

## 6. Where to wire (files)

| Task | Location |
|------|----------|
| Feature flag constant / config | `plugin/src/feature-flags.ts` or settings contribution |
| Bridge | `plugin/src/service/ms-agent-bridge.service.ts` |
| Auto `parseLog` after run | `plugin/src/service/sanitizer-service.ts` (success path, after log file exists) |
| Resolve **absolute** log path | Same place you already build `mindstudio_sanitizer_log` + filename; `path.resolve` / `Uri.fsPath` |
| Sidebar `postMessage` + AI fix | `plugin/src/class/ms-sanitizer-panel-view.ts` |
| Sidebar UI (buttons) | `mstt/web/...` sanitizer sidebar routes/components |
| Duplicate parser | New module under e.g. `plugin/src/.../memcheck-log-parser.ts` (copy semantics from msAgent) |
| Problems `DiagnosticCollection` | New registration in `extension.ts` or dedicated provider + update when log parsed |

---

## 7. UX (v1)

- User runs sanitizer → log loads into msAgent in the background → Problems update from mstt parser.
- If integration available: sidebar shows **AI fix** per finding (or per row). If not: **no** button.
- Click **AI fix** → `fixProblem(index)` → msAgent WebView / notifications as today (**no mstt changes to msAgent**).

---

## 8. Implementation checklist

1. Feature flag + settings (optional).
2. Duplicate **ordered** memcheck parser + tests vs msAgent fixtures.
3. mstt **DiagnosticCollection** + clear on workspace/log change as needed.
4. Bridge + presence detection (§4).
5. **`sanitizer-service`**: absolute log path → `loadMsAgentLog` when flag + available.
6. Panel **postMessage** + web UI for **AI fix** with **index**; hide when `!isMsAgentIntegrationAvailable()`.
7. **Later:** marketplace id → optional install prompt + `extensionDependencies`; **`fixWithPayload`**; Quick Fix; shared parser removal from msAgent.

---

## 9. Summary

| Action | Where |
|--------|--------|
| Auto **parseLog** | **`sanitizer-service.ts`** → bridge |
| **AI fix** (v1) | **Sanitizer sidebar** web → **`ms-sanitizer-panel-view.ts`** → bridge → **`fixProblem`** |
| **Problems** | mstt parser + **`DiagnosticCollection`** |
| **msAgent changes** | **None required** for v1 |
