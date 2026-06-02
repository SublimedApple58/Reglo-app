# Performance Playbook (Backend + Mobile)

Canonical guide for diagnosing and fixing slow screens/endpoints across **reglo**
(Next.js backend/web) and **reglo-mobile** (Expo). When a section feels slow, work
through the diagnosis first, then apply the relevant techniques below. Every
technique here is already used in the codebase — reuse the existing helpers, don't
reinvent them.

> Reference implementation: the student **Settings** screen was reduced from
> "several seconds, full-screen skeleton" to "instant UI, only one background
> field still loading". See the case study at the end.

---

## 0. Diagnose before optimizing

Always answer these two questions first — they change everything:

1. **First-time-only, or every time?**
   - Slow only on the *first* open after a reload/server restart, then fast →
     it's **Next.js dev-mode on-demand route compilation**. This does NOT exist
     in production. Don't rewrite endpoints for it — use Turbopack (§6) and
     validate against a prod build before concluding there's a real problem.
   - Slow *every* time → real overhead. Optimize (server queries, round-trips).
2. **Dev or prod backend?** `npm run ios:local` hits `localhost:3000` (`pnpm dev`,
   dev mode). The Vercel prod backend behaves very differently (pre-built routes,
   warm). Measure the right target.

Cheap measurements:
- `pnpm db:dev:query "SELECT 1"` / `pnpm db:prod:query …` — gauge DB round-trip &
  Neon wake latency (note: most of the wall time is the node script boot).
- Count rows on the table a query scans (`SELECT count(*) … GROUP BY`).
- Look at the screen's data layer: how many network calls gate the first paint,
  are they sequential (waterfall) or parallel, and which one is the slowest.

---

## 1. Backend — DB indexing

Add composite indexes that match a query's `where`/`orderBy` columns, in order.
Check existing `@@index`/`@@unique` in `prisma/schema.prisma` first.

- Find the query's filters → add `@@index([colA, colB, …])` in that order.
- Examples added for the settings screen:
  `CompanyMember(companyId, autoscuolaRole)`,
  `AutoscuolaAppointment(companyId, studentId, paymentRequired, paymentStatus)`.
- Create the migration **without applying** first to review the SQL:
  `pnpm migrate:dev --name <name> --create-only`, inspect, then
  `prisma migrate deploy` (dev) + `npx prisma generate`.
- ⚠️ **Prod**: plain `CREATE INDEX` locks writes during creation. On large tables
  run in a low-traffic window, or create with `CREATE INDEX CONCURRENTLY` manually
  and `prisma migrate resolve --applied <migration>`.
- Track every prod-pending migration in [`../prod-release-migrations.md`](../prod-release-migrations.md).

## 2. Backend — Redis cache (Upstash)

Infra already exists — use it, don't build new caches. See [cache.md](cache.md).

- Client: `lib/cache/redis.ts` (`getRedis()`, returns null if unconfigured — always
  degrade gracefully).
- Versioned segment cache: `lib/autoscuole/cache.ts` —
  `buildAutoscuoleCacheKey({ companyId, segment, scope })`, `readAutoscuoleCache`,
  `writeAutoscuoleCache(key, payload, ttl)`, and `invalidateAutoscuoleCache({ companyId, segments })`
  (bumps a version number → all keys under the segment become stale instantly).
  Segments: `AGENDA`, `PAYMENTS`, `STRIPE`, `FIC`, `QUIZ`, `SETTINGS`.
- Ready-made cached reads: `lib/autoscuole/cached-service.ts`
  (`getCachedCompanyServiceLimits`, `getCachedHolidays`).
- **Rule**: if a read is hit on many screens and changes rarely, route it through
  a cached helper under the right segment, and make sure the corresponding mutation
  calls `invalidateAutoscuoleCache` for that segment (most already do).
- Example: `getAutoscuolaSettingsForCompany` now reads via
  `getCachedCompanyServiceLimits` (SETTINGS segment, 5min TTL) instead of a direct
  `companyService.findFirst` — settings are read on nearly every screen.

## 3. Backend — call schema (fewer round-trips)

The number of DB/network round-trips usually dominates, not row volume.

- **Range over N single-item calls.** If the client loops an endpoint per-day/
  per-item, add optional `from`/`to` (or an id list) and do one ranged query.
  Example: `getAvailabilitySlots` accepts `from`/`to` → fetches a whole week with
  1 base query + 1 override query (`date: { gte, lte }`) instead of 7 calls.
  Keep it **backward compatible** (the old single param still works).
- **Bundle endpoints.** If a screen fires 3–4 parallel calls that each re-run auth
  + context, consider one endpoint that does all the work server-side in a single
  request → one auth cycle, queries co-located with the DB.
- **Direct lookups, not list-then-find.** Don't fetch a 500-row list to find one
  record — query the record directly by its key.
- Parallelize independent server-side queries with `Promise.all` / `$transaction`.

## 4. Backend — per-request overhead

Every authenticated request pays this; shaving it speeds up *everything*.

- `getActiveCompanyContext` (`lib/company-context.ts`) is `React.cache`'d so it runs
  once per request — but each separate HTTP request pays it again. Fewer requests
  (§3 bundling) ⇒ fewer auth cycles.
- `getMobileToken` (`lib/mobile-auth.ts`) used to write `lastUsedAt` on **every**
  request. It's now throttled to ≤ once/hour (or when extending the sliding expiry),
  removing a DB write from the hot path. Revocation stays immediate (the lookup
  still hits the DB). Apply the same "throttle the write-on-read" idea elsewhere.

## 5. Mobile — perceived speed

See [reglo-mobile `api-layer.md`]. Goals: paint the UI immediately, only skeleton
what genuinely depends on the network.

- **Non-blocking load.** Unblock the screen as soon as essential data is ready;
  load secondary data in the background (fire-and-forget). Don't gate the whole
  screen on the slowest call.
- **Render structure immediately, skeleton only BE-backed values.** Session data
  (name, email, company via `useSession`) needs no network → render instantly.
  Put a small inline `SkeletonBlock` only on values that come from the BE; use a
  granular per-field loading flag (e.g. `availabilityLoading`) rather than one
  global `initialLoading` gate.
- **TanStack Query for cached/deduped reads.** Shared query hooks live in
  `src/hooks/queries/` (`useAutoscuolaSettings`, `useBookingOptions`, `queryKeys`,
  `STALE_TIMES`). Reading a setting via the cached query (e.g. `useAutoPaymentsEnabled`)
  gives instant values and avoids waiting on a heavier call. Global `QueryClient`
  is configured in `app/_layout.tsx` (staleTime 2min, focus refetch).
- **Tabs stay mounted.** `(tabs)` screens are not unmounted on blur, so a screen's
  load effect runs once per session and re-entry is already instant — don't add a
  TanStack migration *just* for re-entry speed; weigh it against the refactor risk.
- **Match the call schema to the backend** (use the `from`/`to` range params, etc.).

## 6. Dev-mode speed (not a prod issue)

`next dev` compiles each route on first hit (slow first open). Turbopack makes this
5–10× faster and is enabled in `package.json` `dev` script (`next dev --turbopack`).
Safe here because the only custom webpack rule (`.pdf` asset) is dormant. `next build`
stays on webpack (prod unaffected).

---

## Case study — student Settings screen

**Symptom:** "several seconds" to load, full-screen skeleton.

**Findings:**
- The screen blocked `initialLoading` on a ~10-call waterfall; the heaviest was
  **7 per-day `getAvailabilitySlots` calls** that only feed the Disponibilità
  sub-page.
- Name/email/company are session data (instant) but were hidden behind the skeleton.
- Per-request token write + uncached settings read on every call.
- The "few seconds" the user saw was mostly **dev-mode route compilation** (first
  open only) — not a prod problem.

**Changes:**
1. Mobile: unblock after the parallel batch (payment+settings+students); load the
   availability preset in the background. (`SettingsScreen.tsx`)
2. Mobile: render the whole UI immediately; skeleton only the availability & payment
   summaries; payment-row presence from the cached settings query (no pop-in).
3. Backend: `getAvailabilitySlots` `from`/`to` range → mobile makes 1 weekly call
   instead of 7.
4. Backend: composite indexes (§1).
5. Backend: settings read via Redis cache (§2); token `lastUsedAt` write throttled (§4).
6. Dev: Turbopack (§6).

**Result:** UI is instant; only the availability summary still shows a brief
background skeleton (it computes a 7-day preset). Acceptable because it's
non-blocking. Further options if ever needed: cache the availability preset under
the AGENDA segment, or a dedicated lightweight "my weekly availability" endpoint.

---

## Quick checklist for a slow section

- [ ] First-open-only (dev compile) or every time? Dev or prod? (§0)
- [ ] Does first paint wait on calls it doesn't need? Make them background. (§5)
- [ ] Can session/cached data render instantly with skeletons only on BE values? (§5)
- [ ] N per-item calls → one ranged/bundled call? (§3)
- [ ] List-then-find → direct lookup? (§3)
- [ ] Hot, rarely-changing read → Redis cached helper + invalidation? (§2)
- [ ] Query filters covered by a composite index? (§1)
- [ ] Write-on-read that can be throttled? (§4)
- [ ] New prod migration recorded in prod-release-migrations.md? (§1)
