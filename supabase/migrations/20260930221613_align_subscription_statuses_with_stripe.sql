-- Stripe uses "canceled" and can send all eight states below. The original
-- constraint allowed only four states (including the incompatible "cancelled"),
-- causing otherwise valid billing webhooks to fail.
ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_status_check;

UPDATE public.subscriptions SET status = 'canceled' WHERE status = 'cancelled';
UPDATE public.clients SET subscription_status = 'canceled' WHERE subscription_status = 'cancelled';

ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN (
    'incomplete', 'incomplete_expired', 'trialing', 'active',
    'past_due', 'canceled', 'unpaid', 'paused'
  ));
