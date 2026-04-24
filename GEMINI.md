# SRG Fit — Agent Instructions

Context for Claude Code (and any other AI coding assistant) working on this
repo. Read this first every session. If any rule here conflicts with
something Shane says in-chat, chat wins — but flag the conflict so the
rules can be updated.

## Who you're working with

Shane Hoopes — ACE-certified personal trainer, sole developer and coach
behind **SRG Fit**, a full-stack SaaS fitness coaching platform for 1-on-1
online coaching. Live at **srgfit.app** since March 31, 2026.

Shane is both product owner and engineer. He iterates rapidly against
real client feedback — Lindsey Nadler (a long-term client) is the live
QA tester. Shane prefers:

- Direct, concise communication. Root cause + fix beats long preambles.
- Confirming fix-by-fix before moving on — ship small, verify, ship next.
- Being treated as a partner, not a consultant. Edit files directly;
  don't hand him patch files unless he asks.
- Evidence-based debugging — read the code, check the DB, find the
  actual cause before proposing a fix. "You are a detective, this is
  the crime, find the theory of the crime, then collect evidence, and
  only after evidence proves it, then fix it."

## Design principles (non-negotiable)

- **Don't overengineer.** Simple beats complex.
- **No fallbacks.** One correct path, no alternatives.
- **One way to do things**, not many.
- **Clarity over backward compatibility.** Clear code beats compat shims.
- **Throw errors.** Fail fast when preconditions aren't met.
- **No backups.** Trust the primary mechanism.
- **Separation of concerns.** One function, one responsibility.
- **Surgical changes only.** Make minimal, focused fixes.
- **Fix root causes, not symptoms.**

## Core stack

- **Frontend**: Next.js 14 (App Router), TypeScript, deployed on Vercel
- **Backend**: Supabase (PostgreSQL, RLS, Edge Functions, Storage,
  Realtime, Auth)
- **Payments**: Stripe (live keys, apiVersion `2022-11-15`)
- **Email**: Supabase SMTP; upgrade sender to
  `noreply@srgfit.training` once Resend domain verified
- **AI**: Claude API (`claude-sonnet-4-20250514`) via Supabase Edge
  Functions + `/api/ai-swap` + `/api/ai-nutrition` server routes.
  **NEVER call `api.anthropic.com` from the client side** — always
  proxy through a server route.
- **Push**: Web Push via `send-notification` Edge Function (always
  fire-and-forget, never `await`)
- **Video Reviews**: `caps.srgfit.app` (custom Cap domain)
- **Storage buckets**:
  - Public: `exercise-videos`, `resources`, `community-media`, `avatars`
  - Private: `form-checks`, `workout-reviews`, `message-media`,
    `progress-photos`
  - Anything under a private bucket MUST use
    `resolveSignedMediaUrl(supabase, bucket, path)` from
    `@/lib/media`, never `getPublicUrl`

## Key identifiers

- Supabase project: `bmlfoiohsehkntytadgo`
- GitHub: `srgfitshane/srg-fit`
- Repo root: `C:\Users\Shane\OneDrive\Desktop\srg-fit`
- Coach profile ID: `133f93d0-2399-4542-bc57-db4de8b98d79`
- Domain: `srgfit.app` | Contact: `shane@srgfit.training`
- Test client ID: `d4b20a0d-d1de-4b91-83ca-6acfd4f6d82d`
  (this is also Shane's personal dogfooding client account —
  `shanehcpt@gmail.com`, profile_id `aba0fe07-3690-460b-a35a-cb4e33d3665d`)
- Lindsey (long-term real client, live QA): `037e0e4c-3ea5-42f6-8218-d0d8772bacef`
  — `subscription_status: 'none'` (pays outside Stripe); all manually
  invited clients follow this pattern

## Git workflow (important — don't skip)

Shane works on `dev`. Vercel deploys from `main`. Standard loop:

```
1. Edit files
2. npx tsc --noEmit
3. git add <files>
4. git commit -F <message file>   ← use -F with a temp file; inline
                                    -m breaks on forward slashes
                                    and special characters in cmd/ps
5. git push origin dev
6. git checkout main
7. git merge dev --no-edit
8. git push origin main           ← this triggers Vercel deploy
9. git checkout dev
```

**Never assume a push to the current branch ships to srgfit.app.**
The merge to main is what deploys. If you only push dev, nothing
happens on production.

## Architecture rules (enforced in code)

Every new feature must follow these. They're not style preferences;
they are the reason the app stays coherent at its current scale.

| # | Rule | What it means |
|---|------|----------------|
| 1 | **Coach Preview = Exact Client Dashboard** | `preview/[clientId]/page.tsx` wraps `ClientDashboardInner` with `overrideClientId`. Zero separate UI. Change the client dashboard, preview updates automatically. |
| 2 | **Shared Views = One Component** | `CommunityFeed.tsx` is the single source for the community. Both coach and client wrap it and pass role + backPath. Only prop differences allowed: role (coach/client), backPath, showBottomNav. |
| 3 | **Bottom Nav = One Component** | `ClientBottomNav.tsx`, pathname-only for active state. No `useSearchParams` needed. |
| 4 | **Schema-First** | Before any insert/update, run `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '<table>'`. Wrong column names fail silently via PostgREST. |
| 5 | **Explicit Save Over Auto-Commit** | Orange border + Save button pattern for all coach form interactions. Never auto-commit on change. |
| 6 | **Sessions Must Have program_id** | All workout session queries filter `.not('program_id','is',null)`. Never create sessions without one. (Standalone templates use `status='template'`.) |
| 7 | **Local Date, Not toISOString** | For displayed dates use `new Date()` with `getFullYear/getMonth/getDate`. Never `toISOString()` — it shifts to UTC and displays wrong in clients' local tz. |
| 8 | **Push Notifications Are Fire-and-Forget** | Never `await`. Always `.catch(() => {})`. Push failures must not block completion of user actions. |
| 9 | **Stripe apiVersion '2022-11-15'** | All routes match the webhook config. Don't change this without also updating the webhook. |
| 10 | **Emoji Files → Python, Not PowerShell** | PowerShell corrupts UTF-8 when writing/editing files with emoji. Use Python with `io.open(path, 'r', encoding='utf-8', newline='')`. |
| 11 | **Media URLs → resolveSignedMediaUrl** | `resolveSignedMediaUrl` from `src/lib/media.ts` handles raw paths, Supabase public URLs, and external http URLs. Never pass raw storage paths to `src=` directly. |
| 12 | **Anthropic API → Server-Side Only** | Never call `api.anthropic.com` from the client. Always proxy through `/api/*` routes. Client-side keys would be public. |

## Theme system

Light/dark/system theme preference per client, added April 2026.

- DB: `clients.theme_preference` — `'dark' | 'light' | 'system'`, default `'dark'`
- Source of truth: `src/lib/theme.ts` exports `themeDark`, `themeLight`,
  `buildThemeCss()`, and `ThemePreference` type.
- Applied globally via `src/app/dashboard/client/layout.tsx` — injects
  CSS custom properties once at mount, flips `data-theme` on `<html>`
  based on DB preference, listens for `theme-changed` window events.
- Every client-facing page/component has a local `const t = {...}`
  (or `const c = {...}` in `RichMessageThread`) whose values are
  `"var(--teal)"` style CSS var references, not hex literals.
- **Don't add hex literals** inside these theme blocks. If a new color
  is needed, add it to both `themeDark` and `themeLight` in
  `src/lib/theme.ts`, then reference it as `var(--new-key)`.
- Coach pages intentionally stay on dark-only. The
  `ThemeProvider`-equivalent layout is scoped to `/dashboard/client/*`.

## Silent failures are the enemy

Supabase + PostgREST will silently reject writes that violate RLS,
check constraints, or reference unknown columns. JS clients often
swallow the error unless you check. **Any mutation whose result is
visible in the UI must check the error:**

```tsx
const { error } = await supabase.from('...').update({...}).eq(...)
if (error) { alert('Could not save: ' + error.message); return }
```

Fire-and-forget is only acceptable for cosmetic or telemetry writes
(push notifications, read-receipt updates, PR celebration milestones).
If the user would notice the write didn't happen, check the error.

### RLS debugging pattern

Always check **both**:
- `SELECT rowsecurity FROM pg_tables WHERE tablename = '<table>'`
- `SELECT COUNT(*) FROM pg_policies WHERE tablename = '<table>'`

A table can have RLS enabled with zero policies — that silently blocks
all operations. Very hard to diagnose if you only check one.

## Supabase-specific gotchas (learned the hard way)

- `.lte()` does **not** match NULL values — use `.or('column.is.null,column.lte.value')`
- Nested RLS on subqueries silently blocks client reads — fixed via
  `SECURITY DEFINER` function `can_access_session()` for workout
  session access. Follow that pattern for similar cases.
- `session_exercises → exercises` join must use
  `!session_exercises_exercise_id_fkey` to disambiguate the FK.
- Check constraints reject at DB level before RLS — both fail silently
  when JS client swallows errors.
- `upsert` on `daily_checkins` requires explicit
  `{ onConflict: 'client_id,checkin_date' }`.
- `pg_cron` and `pg_net` require `CREATE EXTENSION IF NOT EXISTS`
  before use.
- Block comments containing `*/` in TypeScript Edge Function files
  cause Deno parse errors.
- `programs.difficulty` check constraint requires Title Case
  (`Beginner`/`Intermediate`/`Advanced`).
- Always use `adminDb` (service role) in Edge Functions — no auth
  contamination.
- RLS policies for service role: use `TO service_role`, never
  `auth.role() = 'service_role'` in `USING`/`WITH CHECK`.

## Next.js / Stripe gotchas

- `NEXT_PUBLIC_` env vars must be present at Vercel **build time**,
  not runtime. Adding one requires redeploying.
- Stripe npm package API version `2026-02-25.clover` removed
  `current_period_start`/`current_period_end` from the type — cast
  as `any` where those dates are accessed.
- Lazy-initialize `new Stripe(...)` inside each `POST()` function,
  not at module level. Module-level init breaks when the key is
  missing during build.
- We're on `Stripe apiVersion: '2022-11-15'` for the join/signup flow.

## Storage bucket privatization (April 2026)

During the security audit we flipped `message-media`, `form-checks`,
and `workout-reviews` from public to private. Any legacy code that
calls `getPublicUrl` on those buckets will return URLs that 403.

The fix pattern:
- **For ephemeral URLs** (messenger bubbles, inline previews): use
  `resolveSignedMediaUrl` at read time.
- **For URLs written to the DB for later display** (food_entries.photo_url,
  form response attachments): store the raw storage path in the DB,
  sign on render. Signing at write time produces a 1hr URL that
  expires before it's displayed.

## Mobile + browser quirks

- **iOS Safari + MediaRecorder**: does NOT support `audio/webm`
  reliably. Query `MediaRecorder.isTypeSupported('audio/mp4')` first
  and use the chosen mime type for the blob, file, and extension.
  Uploading iOS-recorded MP4 audio with an `audio/webm` label makes
  it unplayable in ALL browsers.
- **Android back button** should close modals / active threads
  rather than leaving the page — wired via `pushState` + `popstate`
  in messenger; follow that pattern for new modals.
- **Input font-size 16px minimum** — prevents iOS zoom on focus.
  `-webkit-tap-highlight-color: transparent` on all buttons.
- **Safe areas**: bottom nav uses
  `calc(60px + env(safe-area-inset-bottom))`, floating + button uses
  `calc(72px + env(safe-area-inset-bottom))`.

## Dev loop

The fast path:
1. Read the relevant file before editing (Shane's codebase has
   tight patterns; don't guess)
2. Make the smallest edit that addresses the real cause
3. `npx tsc --noEmit` (takes ~30s-3min depending on scope)
4. Commit with a message that explains WHY, not just what
5. Merge dev → main, push main

**Don't** start with a grand refactor. **Don't** add files/folders
without being asked. **Don't** introduce new dependencies unless
there's a clear reason — the stack is deliberately tight.

## When searching for something

- For file content: use grep/findstr or `Select-String` (PowerShell)
- For schema/data: use Supabase MCP tools directly — `execute_sql`,
  `list_tables`, `apply_migration`
- For cross-file patterns: a Python script in `/scripts/` is usually
  the right move (the scripts directory is throwaway — files there
  aren't committed, they're just tooling)

## File structure landmarks

```
src/
  app/
    dashboard/
      client/              ← everything under here gets the theme provider
        layout.tsx         ← injects theme CSS + reads theme_preference
        page.tsx           ← main client dashboard (Today tab, etc.)
        calendar/
        checkin/
        forms/[formAssignmentId]/
        habits/
        metrics/
        profile/           ← Account > Appearance toggle lives here
        progress/
        resources/
        workout/[sessionId]/  ← workout logging, re-open flow
        nutrition-tab.tsx  ← embedded via page.tsx (not its own route)
      coach/               ← dark-only, not wrapped by theme layout
      preview/[clientId]/  ← coach preview of a client's dashboard
      settings/
    api/                   ← server routes (Stripe, AI proxies, etc.)
    join/                  ← public signup flow
    onboarding/            ← 8-step client intake wizard
    set-password/
    login/
    invite/[token]/
  components/
    client/
      MorningPulse.tsx
      ClientBottomNav.tsx
    community/
      CommunityFeed.tsx    ← single source for community UI (coach + client)
    messaging/
      RichMessageThread.tsx ← shared messenger component
    notifications/
      NotificationBell.tsx
  hooks/
    usePushNotifications.ts
  lib/
    theme.ts               ← themeDark/themeLight/buildThemeCss
    media.ts               ← resolveSignedMediaUrl
    supabase-browser.ts    ← createClient for client components
    supabase-admin.ts      ← adminDb (service role) for API routes
  types/
scripts/                   ← throwaway debugging/migration scripts, NOT committed
```

## What NOT to build (intentional decisions)

- **AI chatbot for clients.** The sell is they get YOU. AI stays
  behind the scenes coaching the coach.
- **Fully automated programs.** Shane is the intelligence in the
  system, not a template.
- **Generic "wellness" features** unrelated to strength, nutrition,
  or mental health.
- **Social feed clutter.** The community board is for wins and
  support, not a TikTok scroll.
- **Group challenges.** Only if clients explicitly ask for them.
- **Client-to-client messaging.** Preserves the personal coaching
  model until scale demands otherwise.
- **Recipes / food database.** FatSecret handles food logging; the
  coach-side AI meal plan replaces the need for a recipe engine.

## Recurring / standing to-dos

These come up every few sessions. Don't surprise Shane by acting
on them without asking, but keep them in mind:

- **FatSecret IP whitelist**: outbound IP `44.199.250.80` needs to
  be allowlisted at platform.fatsecret.com → API Keys → IP Restrictions.
  Recurring item.
- **USDA API key rotation**: `NEXT_PUBLIC_USDA_API_KEY` was exposed
  in an early commit. Should be rotated at https://fdc.nal.usda.gov/api-key-signup.html,
  new value added to Vercel.
- **Resend domain verification**: once verified, switch SMTP sender
  to `noreply@srgfit.training`.
- **Stripe webhook live verification**: confirm
  `checkout.session.completed` fires correctly in live mode.
- **TodayTab extraction**: `src/app/dashboard/client/page.tsx` has
  ~260 lines of TodayTab still inline. Pattern to follow: see how
  NutritionTab, TrainingTab, BillingTab are already extracted.

## Handy reference: active Edge Functions

- `generate-ai-insight` (v3) — coach-only, `verify_jwt: true`
- `send-invite-email` (v6) — `verify_jwt: false`, CORS fixed
- `send-notification` (v1) — push (always fire-and-forget)
- `nutrition-search` — FatSecret proxy, outbound IP `44.199.250.80`
- `send-weekly-digest` — Claude summary per client, pg_cron Monday 12 UTC
- `stripe-checkout` (v2), `stripe-webhook` (v3), `stripe-portal` (v2)

## Questions to ask when stuck

1. Have I actually read the current code, or am I working from
   assumptions about what's there?
2. Is this a symptom or the root cause?
3. Does the DB agree with what the UI is showing?
4. Am I checking the error on this mutation?
5. Is this a public or private bucket? (Changes whether to use
   `getPublicUrl` vs `resolveSignedMediaUrl`.)
6. Is this a client page or coach page? (Determines whether
   theme tokens apply.)
7. Before I rewrite a function, is there a smaller edit that
   addresses the real cause?

---

**If this file gets out of sync with reality, update it.** It lives
in the repo and ships with every commit. It is the contract.
