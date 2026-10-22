# CodeGuard Chrome Extension

Manifest V3 extension with a popup, side panel, repository/link detection, scan actions, findings,
and local source uploads (files, folders, ZIP/TAR/TGZ archives).

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist`.
Start the API and scanner from their repositories, register at the dashboard, then sign in to the
extension. Default API: `http://localhost:4000`; dashboard: `http://localhost:3000`. Both can be
changed in extension Settings. The local API permits extension origins in development by default.

Click **Upload source code** from the popup or side panel, choose files/folder/archive, confirm
permission to upload, and click **Upload and scan**. A dedicated extension tab displays progress,
findings and the full-report link. Keep it open while uploading. Folder paths are preserved. The
background worker sends authenticated multipart requests; tokens never go to content scripts.

Other commands: `pnpm typecheck`, `pnpm dev` (watch page/background builds), `pnpm package` (release ZIP).
Rebuild for content-script changes and reload the extension in Chrome.

## Repository structure

This is an independent repository: no pnpm workspace, private npm package, sibling checkout, or
`@codeguard/*` dependency is required. API models and validation live in `src/contracts` as ordinary
local source files. Each frontend owns its UI components in `src/components/primitives`.

The four repositories are:
- https://github.com/netsetsoftwaresolutions/codeguard-extension
- https://github.com/netsetsoftwaresolutions/codeguard-dashboard
- https://github.com/netsetsoftwaresolutions/codeguard-api
- https://github.com/netsetsoftwaresolutions/codeguard-scanner

## Service compatibility

This initial split preserves the existing runtime protocol. The extension and dashboard call the
API over HTTP. The API queues jobs in Redis/BullMQ; the scanner consumes them and writes progress,
findings and reports to MongoDB. Both backend repositories currently own a local copy of the Prisma
schema, queue types, storage helpers, settings and rules needed for their responsibilities. There is
no shared package dependency. Changes to the queue contract or database schema must be coordinated
across the two backend repositories. API-only database ownership via internal scanner endpoints is
a future refactor, not part of this source split.

For local development, the API and scanner must use the same `DATABASE_URL`, `REDIS_URL`,
`CREDENTIALS_ENCRYPTION_KEY`, and uploaded-file storage. Set `STORAGE_LOCAL_DIR` in both to the same
absolute directory, or configure both for the same S3 bucket. On separate machines use S3 or a
shared mounted directory. Do not run an API production worker against an unrelated database.

## Configuration

Use Node.js 22 (`nvm use`) and pnpm 9.15.0. Commit only `.env.example`; keep credentials in local `.env`
or your deployment's secret configuration. AI, SMTP and provider OAuth are optional. Subscription
entitlements are implemented; online payment processing is not connected.

## CI template

`infrastructure/github-actions/ci.yml` is an inactive GitHub Actions template. The upload credential
does not have GitHub's `workflow` permission, so it cannot publish active workflows. To enable CI,
use an appropriately authorized credential and move this file to `.github/workflows/ci.yml`.
