# SRG FIT
*STRENGTH. COMPASSION. LEGENDARY SUPPORT.*

**App Development Master Roadmap**
v7.0 • March 2026

---

# Section 1: Status — Ready to Launch

The app has passed a full security audit, end-to-end test, and code review. All core features are functional.

## 1.1 Two Items Still Pending (Non-Blocking)

| # | Item | Action |
|---|---|---|
| 1 | NEXT_PUBLIC_USDA_API_KEY | Rotate exposed key at fdc.nal.usda.gov, add fresh key to Vercel |
| 2 | FatSecret IP Whitelist | Add 44.199.250.80 at platform.fatsecret.com → API Keys → IP Restrictions |

---

# Section 2: Completed This Session (March 2026)

## 2.1 Core Workout Loop — FULLY FIXED
- session_exercises RLS: nested RLS subquery silently blocked clients. Fixed with SECURITY DEFINER function can_access_session()
- Ambiguous FK: session_exercises→exercises join now specifies !session_exercises_exercise_id_fkey explicitly (swap feature added original_exercise_id FK causing conflict)
- exercise_sets RLS: same SECURITY DEFINER fix applied
- Scheduling: day_of_week null on weeks 2+ fixed — backfilled from week 1, code fallback added
- Exercise name: normalized from exercise.name when exercise_name column is empty

## 2.2 Milestones & PRs — WORKING
- milestones INSERT policy was missing — client could SELECT but not INSERT. Fixed.
- personal_records ALL policy missing WITH CHECK — recreated with proper WITH CHECK
- detectPRsAndMilestones() fires fire-and-forget after finishWorkout()
- Consistency milestones at 1, 5, 10, 25, 50, 100 workouts

## 2.3 Security Audit — COMPLETED
- Revoked anon role from 26 sensitive tables (clients, messages, exercise_sets, personal_records, etc.)
- cancel_survey_responses had RLS enabled but zero policies — added INSERT + SELECT policies
- exercise_sets and session_exercises ALL policies now include WITH CHECK
- Input validation added to nutrition search and stripe session API routes
- Stripe session route validates cs_ prefix before hitting Stripe API
- No hardcoded secrets, no XSS vectors, no eval usage confirmed

## 2.4 New Features Shipped
- Workout streak on Today tab (🔥 consecutive weeks with completed sessions)
- Broadcast messaging (📣 All button in coach messages → sends to all active clients as DMs + push notifications)
- Workout templates: 📋 Save button on each day in program builder, 💾 Save to Library on programs page
- Sleep habit: two separate HRS/MIN number inputs (numeric keypad, minutes capped at 2 digits)
- GIPHY GIF picker in messages (Tenor shut down Jan 2026 — replaced with GIPHY SDK)
- Coach dashboard mobile nav grid (5-col icon grid at top on mobile, sidebar hidden)
- Push notifications wired: messages (all types) and workout review responses
- Set Active logic fixed: now sets active=true/false correctly instead of nullifying client_id

## 2.5 Workout Page Cleanup
- Snapshot section removed
- Exercise header compacted: name on one line with ellipsis, target inline below, Swap/Skip smaller buttons
- Prev/Next as compact half-width buttons instead of full-width blocks

## 2.6 Data Cleanup
- 22 null client_id sessions deleted
- day_of_week backfilled on all workout_blocks from week 1 pattern
- session_exercises backfilled for all existing assigned sessions
- Duplicate active programs fixed

## 2.7 Date UTC Drift Fixed
- habits/page.tsx: todayStr now uses local date not toISOString()
- progress/page.tsx and calendar/page.tsx: localDateStr() helper added

---


# Section 3: Architecture Rules (v7)

| Rule | Description |
|---|---|
| 1: Coach Preview | preview/[clientId]/page.tsx wraps ClientDashboardInner with overrideClientId. Zero separate UI. |
| 2: Shared Views | CommunityFeed.tsx is the single source for community. Role/backPath props only. |
| 3: Bottom Nav | ClientBottomNav.tsx, pathname-only for active state. |
| 4: Schema First | SELECT column_name FROM information_schema.columns before ANY insert/update. |
| 5: Explicit Save | Orange border + Save button for all coach form interactions. |
| 6: program_id | All session queries filter .not('program_id','is',null). |
| 7: Local Date | Today = getFullYear/getMonth/getDate. Never toISOString() for display dates. |
| 8: Push Notifs | Always fire-and-forget. Never await. Always .catch(()=>{}). |
| 9: Stripe | apiVersion: '2022-11-15' across all routes. |
| 10: Emoji Files | Python scripts for all file writes involving emoji. |
| 11: RLS Nested | Never subquery RLS-protected tables in policies. Use SECURITY DEFINER functions. |
| 12: FK Ambiguity | Multiple FKs between tables require explicit FK name: table!constraint_name(cols). |

---

# Section 4: Post-Launch Roadmap

| Feature | What It Does | Priority | Phase |
|---|---|---|---|
| Periodization Visualizer | Visual macro/meso/micro cycle calendar. Clients see WHY they train. | HIGH | A |
| Smart Weekly Digest | AI Monday summary per client — highlights, who needs attention. Coach-only. | HIGH | A |
| Client Load Management | All clients ranked by activity/stress/engagement. Color-coded. | HIGH | A |
| AI Smart Exercise Swap | Swap to similar movement using movement_pattern + muscles. | HIGH | A |
| Milestone Share Cards | Auto-generate branded SRG shield card. Clients share to social. | MED | A |
| Rep-Based PRs | Track rep PRs in addition to weight PRs. | MED | A |
| Light Mode | CSS variable swap, toggle in user preferences. | MED | A |
| Add Exercise Mid-Workout | Client adds bonus exercise during session (is_client_added flag). | MED | A |
| Journal AI Insights | AI surfaces journal patterns to coach only. | MED | B |
| Birthday & Anniversary | "Alex Rivera's 3-month anniversary is tomorrow." Relationship impact. | MED | B |
| Recipe Upload → Nutrition | Upload recipes, Claude API parses into structured meal data. | MED | B |
| Wearable Integration Ph.1 | Oura + Whoop OAuth. HRV/sleep/recovery auto-fills check-in. | HIGH | C |
| Wearable Integration Ph.2 | Apple Health (HealthKit via PWA) + Google Fit. | MED | C |
| Coach Voice Notes | Record 15-sec voice message to a client. | MED | C |
| Multiple Coaches | Other coaches under SRG brand with their own roster. | LOW | D |
| Cowork Monitoring | Daily DB health checks, edge function pings, client activity alerts. Start at 8-10 real clients. | LOW | D |

---

# Section 5: What We Are NOT Building

- AI chatbot for clients — the sell is they get YOU. AI stays behind the scenes.
- Fully automated programs — you are the intelligence in the system.
- Generic wellness features unrelated to strength, nutrition, or mental health.
- Social feed clutter — community board is for wins and support only.
- Group challenges — add only if clients explicitly ask.
- Client-to-client messaging — preserves the personal coaching model.

---

# Section 6: Environment Variables

| Variable | Status |
|---|---|
| NEXT_PUBLIC_SITE_URL | ✅ https://srgfit.app |
| NEXT_PUBLIC_SUPABASE_URL | ✅ Set |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | ✅ Set |
| SUPABASE_SERVICE_ROLE_KEY | ✅ Set |
| STRIPE_SECRET_KEY | ✅ Live |
| STRIPE_WEBHOOK_SECRET | ✅ Set |
| NEXT_PUBLIC_STRIPE_PRICE_MONTHLY | ✅ Set |
| NEXT_PUBLIC_STRIPE_PRICE_WEEKLY | ✅ Set |
| COACH_PROFILE_ID | ✅ Set |
| FATSECRET_CLIENT_ID | ✅ Set |
| FATSECRET_CLIENT_SECRET | ✅ Set |
| ANTHROPIC_API_KEY | ✅ Set |
| RESEND_API_KEY | ✅ Set (info@srg.fitness) |
| NEXT_PUBLIC_GIPHY_API_KEY | ✅ Set |
| NEXT_PUBLIC_USDA_API_KEY | ⚠️ Needs rotation |

---

# Section 7: Quick Reference

**Live app:** srgfit.app
**Repo:** github.com/srgfitshane/srg-fit
**Root:** C:\Users\Shane\OneDrive\Desktop\srg-fit
**Supabase project:** bmlfoiohsehkntytadgo
**Coach profile ID:** 133f93d0-2399-4542-bc57-db4de8b98d79
**Contact:** shane@srgfit.training

**Active Edge Functions:**
- generate-ai-insight (v3) — coach-only, verify_jwt: true
- send-invite-email (v6) — verify_jwt: false, CORS fixed
- send-notification (v1) — always fire-and-forget
- nutrition-search — FatSecret proxy, stable IP 44.199.250.80
- stripe-checkout (v2), stripe-webhook (v3), stripe-portal (v2)

*SRG Fit • Built with intention • Be Kind to Yourself & Stay Awesome 💪*
