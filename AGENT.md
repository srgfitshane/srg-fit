# SRG Fit App - Codex Instructions

## Product context
This app supports SRG Fit, a remote strength and nutrition coaching business.
The product must feel clear, supportive, practical, and low-friction.
The business philosophy is:
- no gimmicks
- no bloated features
- no hype copy
- simple onboarding
- clear pricing
- strong client trust
- human coaching first, AI second

AI features may support the coach and client experience, but must never replace human coaching judgment in sensitive areas.

## Brand and UX rules
- Preserve SRG Fit's tone: direct, practical, supportive, no cheesy fitness-industry language.
- Keep copy concise and human.
- Do not add fake urgency, manipulative CTAs, or inflated claims.
- UX should be simple enough for tired, stressed, or overwhelmed users to understand quickly.
- Favor clarity over novelty.

## Primary business goals
Optimize for:
1. Trust
2. Conversion
3. Retention
4. Ease of use
5. Low admin burden for Coach Shane

When tradeoffs exist, prefer lower friction and lower maintenance.

## App priorities
This repository should prioritize:
- stable onboarding and join flow
- reliable Stripe checkout flow
- clean client dashboard experience
- clear workout and nutrition tracking flows
- strong mobile usability
- accessible UI
- privacy and data protection
- coach-facing efficiency

## High-risk areas
Treat these as critical:
- authentication and session handling
- Supabase row-level security and permissions
- payment and subscription logic
- client data access boundaries
- admin-only actions
- environment variable handling
- any health-related or personal user information

## Technical expectations
- Respect the existing Next.js architecture and project conventions.
- Prefer small, safe changes over rewrites.
- Reuse existing components and utilities where reasonable.
- Avoid unnecessary dependencies.
- Keep server/client boundaries clean.
- Validate user input at every boundary.
- Ensure errors fail clearly and safely.

## Review checklist
For every audit or review, check:
- broken routes or dead-end flows
- auth and protected routes
- Stripe success/cancel flow handling
- Supabase queries and access assumptions
- form validation and error states
- loading and empty states
- mobile responsiveness
- keyboard accessibility and labels
- performance issues caused by unnecessary client-side work
- confusing or weak CTA placement
- copy that feels robotic, generic, or off-brand

## Definition of done
A task is not done until:
- the requested change is implemented or clearly scoped
- lint passes if configured
- type-check passes if configured
- relevant tests pass if available
- manual verification steps are listed
- risks and follow-up items are documented

## Default task behavior
Unless explicitly told otherwise:
1. Audit first
2. Propose a minimal plan
3. Implement the smallest safe fix
4. Summarize changes clearly
5. Flag anything requiring manual review

## Business-specific constraints
- Do not add medical claims.
- Do not imply guaranteed outcomes.
- Do not present AI insights as diagnosis or treatment.
- Do not create features that increase coaching admin load without a clear business benefit.
- Protect the simplicity of the offer and join flow.
- Respect that this is a real client-facing coaching business, not a toy demo app.