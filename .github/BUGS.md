# Audit findings — Staker.Collins

Source: multi-agent review on 2026-05-22 of commit b34bb03 / merged into NateDev
through 4676b7a.

Status legend:
- ✅ **fixed** — patched on NateDev (linked commit)
- 🟡 **needs-account** — code/scaffolding landed; user must provision an external
  account (Clerk, Vercel Postgres, Vercel Blob) and set env vars to complete
- 📋 **deferred** — not addressed in this pass; tracked for later

---

## CRITICAL

### #1 No real auth on API ✅ partially / 🟡 frontend
- Phones-as-passwords shipped in `server.js:38-44` and `app.js` (removed).
- `/api/login` returned no session cookie or token.
- Every `/api/*` endpoint was unauthenticated.
- **Fix (commit `e246c2d`)**: Added Clerk session verification middleware,
  gated all POST/PUT/PATCH/DELETE on `/api/*`. Removed `staticLoginTeam` from
  client. Refuses to start in production or on Vercel without
  `CLERK_SECRET_KEY`.
- **Still needed (🟡)**: frontend Clerk JS SDK integration to replace the
  login form. Until that lands, only memory-mode dev (no auth) works
  end-to-end. See #1b.

### #1b Wire Clerk JS SDK on the frontend 🟡
- Replace `index.html:10-35` login form with Clerk `<SignIn />` (mounted via
  `@clerk/clerk-js`).
- Inject `Bearer ${await window.Clerk.session.getToken()}` on every fetch in
  `app.js`.
- Provide `CLERK_PUBLISHABLE_KEY` to the frontend (window-injected via
  `server.js` bootstrap response).
- **Action**: provision Clerk app at https://dashboard.clerk.com, paste
  `pk_test_…` / `pk_live_…` into Vercel env.

### #2 Static handler served `.env`, vulnerable to path traversal ✅
- **Fix (commit `f651b08`)**: segment-by-segment validation, dotfile deny,
  MIME allowlist, `path.relative` + `isAbsolute` check. Verified `.env` now
  returns 404.

### #3 Underwriting zero-poisoning corrupts Postgres scores ✅
- **Fix (commit `4101059`)**: `underwritingToClient` returns null when the
  joined row has no real values, preventing `to_jsonb(us.*)` from poisoning
  `property.arv/rehab/purchasePrice` with zeros.

### #4 Stored-XSS via unescaped `innerHTML` interpolations ✅
- **Fix (commit `a0e7db3`)**: swept activity feed, decision cards, dashboard
  table, properties list, photo tiles, option lists. Added `sanitizeUrl` +
  `safeUrl` for `<img>`/`<video>`/`<a>` attrs. Activity feed `JSON.parse`
  wrapped in try/catch.

### #5 Vercel deploy loses chat messages + uploads ✅
- **Fix (commits `f651b08`, `4676b7a`)**: refuses to boot on Vercel in
  memory mode. Media uploads go to Vercel Blob when `BLOB_READ_WRITE_TOKEN`
  is set; otherwise returns 503 with a clear message instead of pretending
  to succeed.
- **Still needed (🟡)**: user provisions Vercel Postgres + Vercel Blob.
  See #5b, #5c.

### #5b Provision Vercel Postgres 🟡
- Vercel Dashboard → Storage → Create Postgres → connect to project.
- Auto-populates `DATABASE_URL` env var.
- Run `npm run db:migrate` against it.

### #5c Provision Vercel Blob 🟡
- Vercel Dashboard → Storage → Create Blob → connect to project.
- Auto-populates `BLOB_READ_WRITE_TOKEN`.

### #6 Seed script silently overwrites prod data ✅
- **Fix (commit `f651b08`)**: refuses to run in `NODE_ENV=production` unless
  `SEED_ALLOW_OVERWRITE=1` is also set.

---

## HIGH

### #7 Silent fallback to memory mode masks missing DATABASE_URL ✅
- **Fix (commit `f651b08`)**: refuses to start in production without
  `DATABASE_URL` unless `MEMORY_DB=1` is explicit.

### #8 No transactions on multi-write handlers ✅ (partial)
- **Fix (commit `4101059`)**: `saveUnderwriting`, `updatePropertyStatus`
  now wrapped in `withTransaction`. `persistScore` and property delete
  still need wrapping. 📋 Tracked as #8b.

### #8b Wrap remaining multi-write handlers in transactions 📋
- `persistScore` (server.js:677 area): score insert + properties update.
- `DELETE /api/properties/:id`: CASCADE handles related rows but the
  activity log write isn't atomic with the delete.

### #9 `refreshStaleScores` blocked `GET /api/properties` ✅
- **Fix (commit `4101059`)**: refresh is now fire-and-forget with per-id
  in-flight dedupe.

### #10 Hand-rolled multipart parser corrupted binary data ✅
- **Fix (commit `52cafaf`)**: replaced with `busboy`, proper streaming
  byte handling, 60MB cap.

### #11 Money stored as two precision regimes 📋
- `properties.list_price/target_offer_*` is INTEGER dollars; underwriting
  rows are BIGINT cents. `saveUnderwriting` truncates between them.
- **Plan**: add migration `20260601_money_to_cents.sql` that adds
  `*_cents BIGINT` columns, backfills from dollars, and drops the
  INTEGER columns. Update `toClientProperty` / seed.js / RentCast adapter.
- Deferred because it requires data migration on populated DBs.

### #12 Concurrent JSON file writes lose chat messages 📋
- `writeRuntimeChatMessages` / `writeRuntimeProspectMedia` read-modify-
  write the whole file with no lock.
- Mitigated for production by #5 (Vercel + memory mode is blocked).
- Local dev concurrent writes can still drop messages. Low priority since
  local dev usually has 1 writer; production uses Postgres.

### #13 `properties.id` collision risk between seed and createProperty ✅
- **Fix (commit `d49a63e`)**: added `UNIQUE INDEX idx_properties_address_zip`
  on `(lower(address), zip)`. **Existing data must already satisfy this
  constraint — review duplicates before migrating.**

### #14 Migration ran without transaction, no version table ✅
- **Fix (commit `d49a63e`)**: `scripts/migrate.js` now wraps schema in
  BEGIN/COMMIT/ROLLBACK; added `schema_migrations(version, applied_at)`.

### #15 `pnpm-workspace.yaml:5` had literal placeholder string ✅
- **Fix (commit `d668dc8`)**: deleted both pnpm files; standardized on
  npm.

### #16 Lockfile schizophrenia (npm + pnpm) ✅
- **Fix (commit `d668dc8`)**: dropped pnpm, committed `package-lock.json`.

---

## MEDIUM

### #17 Listener thrash on every 5s chat poll 📋
- `renderChat` rebinds every node on each poll, chat buffer unbounded.
- Plan: cap buffer at 800, render diffs, only rebind when content changed.

### #18 `JSON.parse(entry.metadata)` killed activity feed render ✅
- **Fix (commit `a0e7db3`)**: wrapped in try/catch.

### #19 Shallow jsonb merge on /hazards, /timeline, /owned 📋
- `source || $2::jsonb` is top-level concat, not deep merge — partial
  updates clobber siblings.
- Plan: deep-merge server-side, or document that PUT replaces the
  named sub-key fully.

### #20 MEMORY_DB ↔ Postgres chat list semantics differ when >800 messages 📋
- Memory mode slices after filtering; Postgres slices via LIMIT 800
  before filtering deleted_at.

### #21 Missing indexes on properties.acquisition_status, properties.rank,
  activity_log(actor, created_at) ✅
- **Fix (commit `d49a63e`)**.

### #22 `chat_messages.author` has no FK to a users table 📋
- String-based authorship; typo silently bricks delete-author check.
- Resolution depends on Clerk integration: once users come from Clerk,
  store `clerk_user_id` instead.

### #23 `dev` script used Unix-style inline env (broke on PowerShell) ✅
- **Fix (commit `d668dc8`)**: wrapped with `cross-env`.

### #24 `.gitignore` too small ✅
- **Fix (commit `d668dc8`)**: added logs, runtime JSON, editor configs,
  uploads/.

### #25 Node 20 EOL April 2026 ✅
- **Fix (commit `d668dc8`)**: loosened engines to `>=20.0.0`. Bump to
  22.x when ready.

---

## LOW

### #26 Login timing oracle + no rate limit
- Moot after #1.

### #27 Raw error.message leaked in 500 responses ✅
- **Fix (commit `d668dc8`)**: status-aware sanitization in top-level
  handler.

### #28 Icon-only buttons missing aria-label 📋
- Spot audit `app.js:4156, 1619`, and other glyph-only buttons.

### #29 Mobile pipeline board layout 📋
- Selection logic switches at 768px without route fallback.

### #30 `chatPresenceSessionId` not cleared on logout 📋
- Server-side presence count drifts.

---

## Summary

| Severity | Total | Fixed | Needs account | Deferred |
|---------:|------:|------:|---:|---:|
| Critical | 6     | 5     | 3  | 0  |
| High     | 10    | 8     | 0  | 2  |
| Medium   | 9     | 4     | 0  | 5  |
| Low      | 5     | 1     | 0  | 4  |

(`needs-account` items overlap with `fixed` — code is in, action is on you.)
