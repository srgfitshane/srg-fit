# SRG Fit

SRG Fit is Coach Shane's online coaching platform. It combines client onboarding, workouts, nutrition, messaging, community, progress tracking, billing, and coach-side review workflows in one Next.js and Supabase application.

## Product Areas

- Marketing and checkout flow for new clients
- Invite-based client onboarding
- Coach dashboard for client management, reviews, outreach, programming, and insights
- Client dashboard for daily actions, workouts, nutrition, messages, metrics, and resources
- Stripe subscription billing
- Supabase-backed notifications, messaging, community, and activity tracking

## Stack

- Next.js App Router
- React 19
- TypeScript
- Supabase Auth, Database, Storage, and Edge Functions
- Stripe subscriptions

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` with the required values:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PRICE_MONTHLY=
NEXT_PUBLIC_STRIPE_PRICE_WEEKLY=
COACH_PROFILE_ID=
FATSECRET_CLIENT_ID=
FATSECRET_CLIENT_SECRET=
NEXT_PUBLIC_TENOR_KEY=
```

3. Start the app:

```bash
npm run dev
```

4. Open `http://localhost:3000`.

## Verification Commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Notes:

- `npm test` runs the current smoke checks for invite utilities and client activity utilities.
- `npm run build` should be run from a clean working tree or after clearing a locked `.next` directory.

## Key Routes

- `/join` for public signup and checkout
- `/login` for returning users
- `/invite/[token]` for invite acceptance
- `/set-password` for invite and recovery completion
- `/onboarding` for client intake
- `/dashboard/coach` for the coach home
- `/dashboard/client` for the client home

## Current Readiness Priorities

- Keep launch-critical flows stable: checkout, webhook provisioning, invite acceptance, onboarding, and messaging
- Avoid misleading behavior in incomplete integrations
- Protect coaching and health-adjacent data with explicit access controls
- Prefer small, reviewable changes over broad rewrites

## Deployment Notes

- Stripe webhook provisioning requires `COACH_PROFILE_ID` to be set correctly
- Calendar sync is not fully implemented yet and should not be marketed as active
- Supabase migrations in `supabase/migrations/` cover only part of the schema history, so production schema changes should be validated against the live project before release
