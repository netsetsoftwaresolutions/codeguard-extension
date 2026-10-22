# Verification

After migration to npm, a clean `npm ci`, `npm run typecheck`, all 84 tests, and the production
build passed in this standalone repository. npm uses the committed `package-lock.json` (lockfile v3).

Docker image builds and live browser walkthroughs were not part of the npm migration verification.
CI remains an inactive template because the upload credential lacks GitHub's workflow permission.
