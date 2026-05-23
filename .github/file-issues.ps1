# File GitHub issues from the audit punch list.
# Prerequisites: `gh auth login` completed; run from repo root.
# Each issue is created against the current repo (dirtcollins/Staker.Collins).

$ErrorActionPreference = "Stop"
$ghPath = "C:\Program Files\GitHub CLI\gh.exe"
if (-not (Test-Path $ghPath)) { $ghPath = "gh" }

function New-Issue {
    param([string]$Title, [string]$Body, [string[]]$Labels)
    $labelArgs = @()
    foreach ($l in $Labels) { $labelArgs += "--label"; $labelArgs += $l }
    & $ghPath issue create --title $Title --body $Body @labelArgs
}

# Ensure labels exist (silently swallow "already exists" errors)
$labels = @(
    @{ name = "severity:critical"; color = "B60205"; description = "Blocking; security or data integrity" },
    @{ name = "severity:high";     color = "D93F0B"; description = "Important; ships data or impacts UX" },
    @{ name = "severity:medium";   color = "FBCA04"; description = "Should fix; not blocking" },
    @{ name = "severity:low";      color = "0E8A16"; description = "Polish" },
    @{ name = "status:needs-account"; color = "5319E7"; description = "Code in; user must provision external service" },
    @{ name = "status:deferred";   color = "BFD4F2"; description = "Tracked for later" },
    @{ name = "area:auth";         color = "C2E0C6"; description = "Authentication / authorization" },
    @{ name = "area:storage";      color = "C2E0C6"; description = "Postgres / Vercel Blob" },
    @{ name = "area:frontend";     color = "C2E0C6"; description = "" },
    @{ name = "area:backend";      color = "C2E0C6"; description = "" },
    @{ name = "area:db";           color = "C2E0C6"; description = "" }
)
foreach ($lbl in $labels) {
    try {
        & $ghPath label create $lbl.name --color $lbl.color --description $lbl.description 2>$null
    } catch { }
}

# Issues that still need action (the "fixed" ones live in commit history)

New-Issue -Title "Wire Clerk JS SDK on the frontend (#1b)" -Labels @("severity:critical","status:needs-account","area:auth","area:frontend") -Body @"
The backend now verifies Clerk session tokens, but the frontend still
posts to the legacy /api/login. We need to:

1. Add @clerk/clerk-js to index.html.
2. Replace the login form (index.html:10-35) with a mounted ClerkJS
   <SignIn> component.
3. Inject ``Authorization: Bearer `${await window.Clerk.session.getToken()}``
   on every fetch in app.js.
4. Expose CLERK_PUBLISHABLE_KEY to the client via /api/bootstrap or a
   window-injected snippet from server.js.

Provision steps:
- https://dashboard.clerk.com/ -> create application
- Copy ``sk_test_`` / ``sk_live_`` -> ``CLERK_SECRET_KEY`` env
- Copy ``pk_test_`` / ``pk_live_`` -> ``CLERK_PUBLISHABLE_KEY`` env

Acceptance: signing in via Clerk on the deployed app authenticates API
calls; /api/login returns 410 in non-bypass mode.
"@

New-Issue -Title "Provision Vercel Postgres (#5b)" -Labels @("severity:critical","status:needs-account","area:storage") -Body @"
Vercel Dashboard -> Storage -> Create Postgres -> connect to project.
This auto-populates DATABASE_URL in the project env.

Then run ``npm run db:migrate`` against the new DB and ``npm run db:seed``
once (with SEED_ALLOW_OVERWRITE=1 if it's a re-run).

Until this is done, the app refuses to boot on Vercel (memory mode is
blocked).
"@

New-Issue -Title "Provision Vercel Blob (#5c)" -Labels @("severity:critical","status:needs-account","area:storage") -Body @"
Vercel Dashboard -> Storage -> Create Blob -> connect to project.
Auto-populates BLOB_READ_WRITE_TOKEN.

Without this, /api/uploads/media returns 503 on Vercel. Local dev still
writes to ./uploads/media/ on disk.
"@

New-Issue -Title "Wrap persistScore + DELETE property in transactions (#8b)" -Labels @("severity:high","status:deferred","area:backend","area:db") -Body @"
saveUnderwriting and updatePropertyStatus are now transactional. Still
need:
- persistScore (server.js ~line 670): score insert + properties update
  should be atomic.
- DELETE /api/properties/:id: CASCADE handles related rows but the
  paired activity_log write isn't atomic with the delete.

Use the existing withTransaction(fn) helper.
"@

New-Issue -Title "Normalize money precision to BIGINT cents (#11)" -Labels @("severity:high","status:deferred","area:db") -Body @"
properties.list_price / target_offer_* are INTEGER dollars. Underwriting
rows use BIGINT cents. saveUnderwriting truncates between them.

Plan:
1. New migration 20260601_money_to_cents.sql:
   - Add list_price_cents / target_offer_low_cents / target_offer_high_cents
     BIGINT columns.
   - Backfill from existing INTEGER columns * 100.
   - Drop the INTEGER columns.
2. Update toClientProperty / seed.js / RentCast adapter / saveUnderwriting
   to read/write cents.
3. Frontend dollar formatting stays the same (centsToDollars in
   server.js already converts on response shape).

Risky on populated DB - schedule for a maintenance window.
"@

New-Issue -Title "Memory-mode JSON writes are lossy under concurrency (#12)" -Labels @("severity:high","status:deferred","area:backend") -Body @"
writeRuntimeChatMessages / writeRuntimeProspectMedia read-modify-write
the whole file with no lock. Mitigated for production by the Vercel +
memory mode boot guard, but local dev concurrent writes can still drop
messages.

Lowest-impact fix: add a per-file mutex (proper-lockfile or a custom
promise chain) around the read+serialize+write cycle.

Not a blocker since memory mode is local-only single-user. Track only.
"@

New-Issue -Title "Deep-merge jsonb on /hazards, /timeline, /owned (#19)" -Labels @("severity:medium","status:deferred","area:backend") -Body @"
``UPDATE ... SET source = source || `$2::jsonb`` is top-level concat,
not deep merge. Sending a partial ``source.hazards`` payload clobbers
sibling keys.

Options:
1. Deep-merge server-side (write a small jsonb deep-merge helper).
2. Require clients to send the full sub-object and document that
   semantic clearly.

(2) is simpler; (1) is more forgiving.
"@

New-Issue -Title "MEMORY_DB / Postgres chat list semantics diverge at >800 messages (#20)" -Labels @("severity:medium","status:deferred","area:backend") -Body @"
- Memory mode: filter then slice(-800).
- Postgres: ORDER BY created_at LIMIT 800 then filter deleted_at.

Different result sets when the table has >800 messages including soft-
deleted ones. Resolve by aligning the query: filter deleted_at in SQL
before applying LIMIT.
"@

New-Issue -Title "FK chat_messages.author -> users (after Clerk lands) (#22)" -Labels @("severity:medium","status:deferred","area:db","area:auth") -Body @"
Once Clerk is wired up, chat_messages.author should reference a stable
clerk_user_id rather than a free-form string (a typo currently bricks
the delete-author check). Migrate after #1b.
"@

New-Issue -Title "Listener thrash on 5s chat poll (#17)" -Labels @("severity:medium","status:deferred","area:frontend") -Body @"
renderChat is invoked by pollChatPresence every 5s and rebinds every
node by setting innerHTML + querySelectorAll(...).forEach(addEventListener).
For a chat with thousands of messages this is expensive.

Fix: cap chatMessages buffer (e.g. last 800), render diffs (compare
prev hash to current), only re-render when content actually changed.
"@

New-Issue -Title "Icon-only buttons missing aria-label audit (#28)" -Labels @("severity:low","status:deferred","area:frontend") -Body @"
Spot-audit app.js for glyph-only <button> tags (e.g. lines 4156, 1619)
and ensure every one has an accessible label.
"@

New-Issue -Title "Mobile pipeline board layout (#29)" -Labels @("severity:low","status:deferred","area:frontend") -Body @"
At <768px the selection logic switches without ensuring the property
detail route is reachable when no pipeline column is in viewport.
Walk through on mobile and either adjust the route or persist
horizontal-scroll position.
"@

New-Issue -Title "Clear chatPresenceSessionId on logout (#30)" -Labels @("severity:low","status:deferred","area:frontend") -Body @"
chatPresenceSessionId persists across logout, so the server-side
presence count drifts. Clear it in the logout handler.
"@

Write-Host "All issues filed. See .github/BUGS.md for the full punch list."
