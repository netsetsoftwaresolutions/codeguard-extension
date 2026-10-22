# Service contracts — initial split (2026-10-22)

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


The HTTP API is documented by the API service at `/api/docs`. Frontend validation models are local snapshots in `src/contracts`; update them when API request/response shapes change.
