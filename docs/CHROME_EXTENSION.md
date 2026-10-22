> This reference was carried over from the original project. Use the repository README for standalone setup and paths.

# CodeGuard Chrome Extension

Manifest V3 extension (React 19, TypeScript, Vite 6, Tailwind 3) located in `apps/chrome-extension`.
It recognises GitHub / GitLab / Bitbucket repositories and pull requests, and Dropbox / Google Drive
shared links, and lets a signed-in user start CodeGuard scans and review the results. **All analysis
happens on the CodeGuard API / scan workers** — the extension never downloads, executes or analyses
source code itself, and it never shows placeholder data: everything comes from the API.

The product name is configurable: the build-time default (`DEFAULT_PRODUCT_NAME` in
`src/shared/constants.ts`) is replaced at runtime with `productName` from `GET /api/meta`.

---

## 1. Install (unpacked, development)

```bash
npm install
npm run build
```

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select `apps/chrome-extension/dist`.
4. Pin the CodeGuard icon. Note the extension ID shown on the card (needed for CORS, below).

Other commands:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Rebuild pages + background on change (`vite build --watch --mode development`). The content script is built by the full `build`; re-run it after content-script changes. Click the reload icon on `chrome://extensions` after rebuilding. |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit + component tests |
| `npm run package` | Zips `dist/` into `apps/chrome-extension/release/codeguard-extension.zip` (uses the `zip` CLI; prints manual instructions if it is missing) |
| `node apps/chrome-extension/scripts/generate-icons.mjs` | Regenerates `public/icons/icon{16,32,48,128}.png` (pure Node + zlib) |

Minimum Chrome version: **116** (side panel `open()` API).

## 2. Configure the API

Defaults: API `http://localhost:4000`, dashboard `http://localhost:3000`. Change them in the popup → ⚙ **Settings** → *Connection*.

* `http://localhost:4000/*` is the only host permission granted at install time.
* For any other API URL the extension calls `chrome.permissions.request()` for that host (from the
  declared `optional_host_permissions`: `https://*/*`, `http://localhost/*`). HTTPS is mandatory
  except for `localhost`. If permission is denied the URL is not changed.
* **Changing the API URL signs you out** — a token issued by one server is never sent to another.

The API must accept requests from the extension's origin (`chrome-extension://<extension-id>`):

* Development: set `ALLOW_ANY_EXTENSION_ORIGIN=true` on the API, **or**
* Production: `CORS_ORIGINS=chrome-extension://<extension-id>` (comma-separate multiple origins).

If the API is unreachable the popup and side panel show a red banner
("Cannot reach the CodeGuard API at …") with a Retry button.

## 3. Permissions and why

| Permission | Why |
| --- | --- |
| `storage` | Settings, access token, consent records, automatic-mode log (`chrome.storage.local`); per-tab detection and tracked scans (`chrome.storage.session`, restricted to trusted contexts). |
| `activeTab` | Lets the popup read the URL of the current tab when the user clicks the toolbar icon, without the broad `tabs` permission. |
| `sidePanel` | The side panel with scan options and the findings list. |
| `host_permissions: http://localhost:4000/*` | The default API. |
| `optional_host_permissions: https://*/*, http://localhost/*` | Requested at runtime **only** for the API host the user configures. |
| Content scripts on `github.com`, `gitlab.com`, `bitbucket.org`, `www.dropbox.com`, `drive.google.com` | Page detection (URL + optional branch name) and the floating button on git repository pages. |

The `tabs` permission is **not** requested. Where `tab.url` is unavailable (e.g. side panel opened
from the in-page button), the extension uses the URL reported by its own content script for that tab.

Extension-page CSP: `script-src 'self'; object-src 'self'` (no inline scripts, no remote code; the
Vite module-preload polyfill is disabled for that reason).

## 4. Architecture

```
 ┌────────────────────────── web page (github.com, …) ──────────────────────────┐
 │  content.js (IIFE, isolated world)                                           │
 │   • reads location.href + branch name hint only                              │
 │   • closed Shadow-DOM floating button ("Scan with CodeGuard")                │
 └────────────┬─────────────────────────────────────────────────────────────────┘
              │ chrome.runtime.sendMessage  (PAGE_DETECTED | OPEN_SIDE_PANEL | DISMISS_BUTTON)
              ▼
 ┌──────────────────────── background.js (MV3 service worker, ES module) ────────┐
 │  validateMessage()  →  BackgroundService (router)                            │
 │   • Store: chrome.storage.local / .session                                   │
 │   • CodeGuardApi → ApiClient (fetch, Bearer token, timeout, error mapping)    │──► CodeGuard API
 │   • consent gate, automatic-mode logic, ScanTracker (toolbar badge)          │    /api/*
 └────────────▲─────────────────────────────────────────────────────────────────┘
              │ chrome.runtime.sendMessage  (GET_STATE, LOGIN, INSPECT_SOURCE, START_SCAN, …)
 ┌────────────┴──────────────┐      ┌──────────────────────────────┐
 │ popup.html (380px)        │      │ sidepanel.html               │
 │ AppShell → Workspace      │      │ AppShell → Workspace         │
 │ (compact, recent scans)   │      │ (findings list + filters)    │
 └───────────────────────────┘      └──────────────────────────────┘
```

Source layout (`apps/chrome-extension/src`):

| Path | Contents |
| --- | --- |
| `shared/messages.ts` | Typed message union, response types, `validateMessage()` |
| `shared/capabilities.ts` | `getScanActions()` — inspection capabilities → buttons |
| `shared/source.ts` | Repository URL / source key, ref+path resolution, branch-hint validation, labels (uses `parseSourceUrl` from `@codeguard/shared-types`) |
| `shared/consent.ts`, `shared/auto-scan.ts` | Consent and automatic-mode rules (pure functions) |
| `shared/branch-hint.ts` | GitHub / GitLab branch-name extraction |
| `shared/settings.ts`, `shared/constants.ts` | Settings model, defaults, URL normalisation |
| `background/` | `index.ts` (Chrome wiring), `service.ts` (router + logic), `api-client.ts`, `store.ts`, `badge.ts` |
| `content/` | `index.ts` (detection + SPA navigation), `floating-button.ts` |
| `ui/` | React components and hooks shared by the popup and side panel |

Build: `vite.config.ts` builds `popup.html`, `sidepanel.html` and `src/background/index.ts` →
`dist/background.js` (stable name, ES module; code shared with the pages lives in a DOM-free
`assets/shared-*.js` chunk). `vite.content.config.ts` builds `src/content/index.ts` in library mode
as a single IIFE `dist/content.js` (MV3 content scripts cannot be ES modules), with `emptyOutDir: false`.

## 5. Message security model

* Every message is validated in `validateMessage()` before anything else runs:
  * `sender.id` must equal `chrome.runtime.id` (no `externally_connectable` is declared, so web pages cannot message the extension at all).
  * **Extension pages** are identified by `sender.url` starting with `chrome-extension://<id>/` and may send UI messages.
  * **Anything else with a `sender.tab`** is treated as a content script and may only send `PAGE_DETECTED`, `OPEN_SIDE_PANEL` and `DISMISS_BUTTON`. A content script trying `GET_STATE`, `LOGIN`, `START_SCAN`, `UPDATE_SETTINGS`, … is rejected with `FORBIDDEN_SENDER`.
  * `PAGE_DETECTED.url` must have the same origin as the sending frame.
  * Unknown types, extra fields and malformed values (ids must match `[A-Za-z0-9_-]{1,64}`, URLs must be http(s), refs ≤ 255, paths ≤ 1024 chars, settings keys whitelisted) are rejected.
* Content scripts never receive the token or API data: `PAGE_DETECTED` answers only `{ showButton, productName }`.
* There is no "call arbitrary API path" message. Each message maps to a fixed endpoint built inside `api-client.ts`, with ids URL-encoded.
* Branch hints from pages are accepted only if they are a plain ref name that is a prefix of the URL's `ref/path`, so a page can only choose where to split the URL — never inject a different ref.
* The access token is stored in `chrome.storage.local` and read only by the service worker; it is sent only as `Authorization: Bearer` to the configured API (`credentials: 'omit'`). On any `401` it is deleted and the UI switches to the signed-out state. Changing the API URL deletes it.
* The floating button lives in a **closed** Shadow DOM, uses only `textContent` for dynamic text and does not touch page DOM or storage.
* Extension pages broadcast-listeners accept only `SOURCE_CHANGED` / `AUTH_CHANGED` from the extension itself (`isBroadcastFromBackground`).

## 6. Data flow & consent

1. The content script (or `activeTab`) provides the page URL; `parseSourceUrl()` from `@codeguard/shared-types` classifies it.
2. The popup / side panel asks the background to `POST /api/sources/inspect { url, organizationId }` (no source download) and renders visibility, default branch, branch count, `messages` and the buttons allowed by `capabilities`.
3. On **Scan**, the background re-parses the URL, determines visibility (from the inspection) and:
   * `public` → scans immediately.
   * `private` / `unknown` without stored consent → returns `CONSENT_REQUIRED`; nothing is sent. The UI shows:
     > *CodeGuard will download this source to the CodeGuard server at &lt;API host&gt; for analysis. Source code is never executed. Uploaded copies are deleted after scanning.*
   * After **I agree, scan**, the request is repeated with `consent: true`; consent is stored per source (repository URL, or canonical share link) and the scan body carries `consent: true`.
   Consent is enforced in the background, not just in the UI.
4. Progress is polled every 2 s (`GET /api/scans/:id/status`) until a terminal status, then the full scan (`GET /api/scans/:id`) and — in the side panel — findings (`GET /api/scans/:id/findings?pageSize=100`) are loaded.
5. The toolbar badge for the originating tab shows `…` while running, then the number of CRITICAL + HIGH findings (red if > 0, green if 0) or `!` on failure.

AI: off by default. When enabled in Settings, scan requests send `options.enableAi: true`; the UI
states that masked snippets of non-secret findings are sent to the configured AI provider and that
secrets are never sent. AI explanations are labelled "AI explanation — verify before acting".

## 7. Manual vs automatic mode

* **Manual (default):** scans start only from a button click.
* **Automatic (opt-in):** in Settings choose *Automatic*, then on a repository page enable
  *Auto-scan this repository*. That exact repository URL is added to the allowlist (managed in Settings).
  When you later visit an allowlisted repository, the background:
  1. checks the local auto-scan log (no network) — skip if scanned by automatic mode in the last 24 h;
  2. `POST /api/sources/inspect` — skip unless `visibility === 'public'` and the repository is scannable;
  3. `GET /api/scans/by-source?url=` (plus `previousScans`) — skip if any non-failed scan was created in the last 24 h;
  4. records the attempt, then `POST /api/scans/repository` (default branch).
  Private / unknown-visibility sources and Dropbox / Drive links are **never** scanned automatically.

## 8. Popup and side panel

Popup: logo + product name, user email, organization switcher, theme toggle (dark default, persisted),
settings, sign-out; current-site card (provider, "Repository detected" / "Shared folder detected" /
"Shared file detected" / "Pull request detected" / "Not a supported page", repository name, branch,
path, visibility, default branch, branch count, API messages); scan buttons; live progress; summary
(risk badge, severity counts/bar, classification counts, risk categories, coverage limitations, and
the note that "Suspicious" ≠ confirmed malware and that no scan guarantees malware-free code);
**Open full report** (`<dashboard>/scans/<id>`, or `<dashboard>/scans/groups/<groupId>` for
multi-branch scans); **Open side panel**; previous scans of this source; recent organization scans.

Side panel: the same workspace following the active tab (tab switches and SPA navigation), plus the
findings list grouped by severity with severity filter, classification badge, file:line, masked
evidence, "How to fix", AI explanation, link to the exact source line (`sourceLink`) and to the report.

Scan buttons and the endpoints they call (every body includes `target: { organizationId }` and `options: { enableAi }`):

| Button | Shown when | Request |
| --- | --- | --- |
| Scan current file | git file view, `capabilities.scanFile` | `POST /api/scans/repository { url: <repo>, ref, path }` |
| Scan this folder | git tree view with a path, `capabilities.scanFolder` | `POST /api/scans/repository { url: <repo>, ref, path }` |
| Scan current branch | git (non-PR), `capabilities.scanBranch`, branch known | `POST /api/scans/branch { url: <repo>, ref }` |
| Scan entire repository | git, `capabilities.scanRepository` | `POST /api/scans/repository { url: <repo> }` |
| Scan all accessible branches | git, `capabilities.scanAllBranches` | `POST /api/scans/repository { url: <repo>, branches: "ALL" }` |
| Scan this pull request | PR / MR page, `capabilities.scanPullRequest` | `POST /api/scans/pull-request { url: <PR canonical URL> }` |
| Scan accessible folder contents | Dropbox/Drive **folder** link, `capabilities.scanFolder` | `POST /api/scans/url { url: <canonical link> }` |
| Scan this file | Dropbox/Drive **file** link, `capabilities.scanFile` | `POST /api/scans/url { url: <canonical link> }` |

A single-file share link never offers a folder scan. Buttons whose capability is `false` are shown
disabled with the reason. Each click sends a fresh `Idempotency-Key`.

Branch detection: for ambiguous GitHub/GitLab `tree|blob/<ref>/<path>` URLs the ref is resolved from
(1) the page hint (`script[data-target="react-app.embeddedData"]` → `payload.refInfo.name` on GitHub;
`data-ref` on GitLab), validated as described above, (2) the longest matching branch from the
inspection's branch list, (3) the first path segment, flagged with "?" as uncertain.

## 9. API contract relied on

| Endpoint | Fields used |
| --- | --- |
| `GET /api/meta` | `productName`, `features.ai` |
| `POST /api/auth/login` `{ email, password, client: "extension" }` | `AuthResponse.accessToken`, `expiresIn` (seconds), `user.email`, `organizations[].{id,name}` |
| `POST /api/auth/logout` | 204 |
| `GET /api/auth/me` | `{ user, organizations }` |
| `POST /api/sources/inspect` `{ url, organizationId }` | `visibility`, `accessible`, `defaultBranch`, `branches`, `capabilities.*`, `messages`, `previousScans` |
| `POST /api/scans/repository`, `/branch`, `/pull-request`, `/url` | request bodies above (+ `consent: true` for consented private/unknown sources); response `ScanCreatedResponse.{scans[].id, scanGroupId}` |
| `GET /api/scans?organizationId=&page=1&pageSize=5` | `Paginated<ScanView>.items` |
| `GET /api/scans/by-source?url=` | `ScanView[].{createdAt,status}` |
| `GET /api/scans/:id` | `ScanView` incl. `summary.{severityCounts, categoryCounts, classificationCounts, totalFindings, risk.{score,level}, coverage.{filesScanned, filesDiscovered, limitations, truncated}, aiUsed}` |
| `GET /api/scans/:id/status` | `{ id, status, stage, progress, errorMessage }` |
| `GET /api/scans/:id/findings?page=1&pageSize=100[&severity=]` | `Paginated<FindingView>` (`items`, `total`) |

Errors: `401` → token cleared, signed-out UI; `403` / `400` messages are shown; `413` → "larger than
your plan allows"; `429` → "rate limit or plan quota"; `5xx` → generic server error (no server
details shown); network failure / 20 s timeout → "Cannot reach the API at …".

Dashboard routes linked: `/register`, `/scans/:id`, `/scans/:id?finding=:findingId`, `/scans/groups/:groupId`, `/`.

## 10. Testing

`npm test` (Vitest, jsdom):

| File | Covers |
| --- | --- |
| `tests/messages.test.ts` | Unknown types, foreign senders, malformed payloads, content-script privilege escalation, origin mismatch, broadcast validation |
| `tests/api-client.test.ts` | Bearer header, no token on public endpoints, 401 clears token, login 401, network/timeout errors, 413/429/403/400/500 mapping, query encoding |
| `tests/capabilities.test.ts` | Dropbox file link never offers folder scan, Dropbox/Drive folder/file, PR page shows PR scan, slash-branch resolution, disabled capabilities |
| `tests/consent.test.ts` | Private/unknown sources require consent (scan API not called), consent stored per source, public needs none, `consent: true` in body, endpoint mapping |
| `tests/auto-scan.test.ts` | Allowlist / mode / sign-in checks, 24 h dedupe (local log and API), private never auto-scanned |
| `tests/branch-hint.test.ts` | GitHub embedded JSON extraction, hint validation, ref/path resolution |
| `tests/settings.test.ts` | URL rules, permission patterns, API change clears token, org membership, token never in responses, content-script responses |
| `tests/components.test.tsx` | ScanActions, ScanSummary (disclaimer, categories, limitations), FindingItem, ConsentDialog text, LoginForm |

Manual end-to-end check: run the API + worker, load the extension, sign in, open a public GitHub
repository, scan, watch the badge and progress, open the side panel, and open a private repository
to confirm the consent dialog.

## Local source uploads

Click **Upload source code** in the signed-in popup or side panel to open a dedicated extension tab.
Choose **Files**, **Folder**, or **Archive** (ZIP, TAR, TAR.GZ, TGZ), select the source, confirm
permission to send it to the configured API, then click **Upload and scan**. Folder relative paths
are preserved. Keep the tab open until the upload finishes. The page shows scan progress, findings,
and the full-report link. The selected organization and extension AI setting apply; the API enforces
plan quotas and upload limits. No additional extension permissions are needed.

The page stages blobs in extension-origin IndexedDB and sends only a random upload ID through
validated runtime messages. The background consumes and deletes the staged record before posting
multipart data to `/api/scans/upload`; bearer tokens remain in the background. Failed submissions
also clean up their staged record. Abandoned records expire after ten minutes and are purged when
the upload page next opens or stages files. Content scripts cannot initiate uploads. Upload requests
have a two-minute timeout. There is an uploading indicator, rather than byte-level progress.

Validation, sender restrictions and multipart transport have automated tests. Live Chrome file/folder
picker, IndexedDB handoff, and upload-to-report verification remain manual QA tasks.

## 11. Status

| Feature | Status | Notes |
| --- | --- | --- |
| MV3 manifest, minimal permissions, strict CSP, icons | Implemented | No `tabs` permission |
| Background-only API access, typed + validated messages | Implemented | |
| Login / logout / 401 handling / org switcher | Implemented | Token in `chrome.storage.local` |
| Configurable API & dashboard URL with runtime host permission | Implemented | Changing API signs out |
| Product name from `/api/meta` | Implemented | Build-time default fallback |
| Site detection (GitHub, GitLab, Bitbucket, Dropbox, Drive) via `parseSourceUrl` | Implemented | |
| GitHub/GitLab branch hint, SPA navigation handling | Implemented (best effort) | Depends on GitHub/GitLab markup; falls back to branch list |
| Capability-driven scan buttons (file, folder path, branch, repo, all branches, PR, shared folder/file) | Implemented | |
| Consent for private/unknown sources (enforced in background) | Implemented | Remembered per source |
| Live progress, summary, previous / recent scans, report links, group links | Implemented | |
| Side panel findings list with severity filter, evidence, fix, AI explanation, source links | Implemented | First 100 findings; link to full report for the rest |
| Floating in-page button (Shadow DOM, dismissible per site) | Implemented | Git repository pages only |
| Toolbar badge with scan state | Implemented | Polls while the service worker is alive; resumes on restart |
| Automatic mode (allowlist, public only, 24 h dedupe) | Implemented | |
| Dark / light theme | Implemented | |
| Bitbucket branch hint | Not implemented | Bitbucket `src/<ref>/` URLs are unambiguous enough via the branch list |
| Multi-branch progress for every branch in a group | Partial | Popup/side panel follow the first scan; the badge tracks all; the comparison page shows all |
| Cancel / rescan / finding status changes from the extension | Not implemented | Available in the dashboard |
| OAuth (GitHub login) in the extension | Not implemented | Email/password only |
| Chrome Web Store publishing assets | Not implemented | `package` script produces the zip |
