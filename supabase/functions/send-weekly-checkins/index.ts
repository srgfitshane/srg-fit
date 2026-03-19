import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * send-weekly-checkins
 * Runs on a cron schedule (every 15 minutes via pg_cron or Supabase dashboard).
 * Finds all active check_in_schedules where next_send_at <= now(),
 * creates a client_form_assignment for each, sends a push notification,
 * and advances next_send_at by 7 days.
 *
 * To schedule via Supabase Dashboard:
 *   Cron expression: every 15 min (asterisk-slash-15 asterisk asterisk asterisk asterisk)
 *   HTTP POST to: /functions/v1/send-weekly-checkins
 */

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SVC_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);
  const now = new Date().toISOString();

  // 1. Find all due schedules
  const { data: dueSchedules, error } = await supabase
    .from("check_in_schedules")
    .select("*, client:clients(id, profile_id, coach_id)")
    .eq("active", true)
    .lte("next_send_at", now);

  if (error) {
    console.error("Error fetching schedules:", error);
    return json({ error: error.message }, 500);
  }

  if (!dueSchedules || dueSchedules.length === 0) {
    return json({ message: "No check-ins due", processed: 0 });
  }

  const results = [];

  for (const schedule of dueSchedules) {
    try {
      const client = schedule.client;
      if (!client) continue;

      // 2. Find the check-in form (prefer schedule.form_id, fall back to first is_checkin_type)
      let formId = schedule.form_id;
      if (!formId) {
        const { data: form } = await supabase
          .from("onboarding_forms")
          .select("id")
          .eq("coach_id", client.coach_id)
          .eq("is_checkin_type", true)
          .limit(1)
          .single();
        formId = form?.id;
      }

      if (!formId) {
        console.warn(`No check-in form found for coach ${client.coach_id}, skipping`);
        continue;
      }

      // 3. Create the assignment
      const { data: assignment } = await supabase
        .from("client_form_assignments")
        .insert({
          coach_id:            client.coach_id,
          client_id:           client.id,
          form_id:             formId,
          checkin_schedule_id: schedule.id,
          status:              "pending",
          note:                "Weekly check-in",
        })
        .select()
        .single();

      // 4. Push notification to client
      if (client.profile_id) {
        await supabase.functions.invoke("send-notification", {
          body: {
            user_id:           client.profile_id,
            notification_type: "checkin_due",
            title:             "Check-in time! 📋",
            body:              "Your weekly check-in is ready. Takes about 3 minutes.",
            link_url:          "/dashboard/client/checkin",
          },
        }).catch(() => {});
      }

      // 5. Advance next_send_at by exactly 7 days
      const next = new Date(schedule.next_send_at);
      next.setDate(next.getDate() + 7);

      await supabase
        .from("check_in_schedules")
        .update({
          last_sent_at: now,
          next_send_at: next.toISOString(),
        })
        .eq("id", schedule.id);

      results.push({ schedule_id: schedule.id, assignment_id: assignment?.id, status: "sent" });
    } catch (err: any) {
      console.error(`Error processing schedule ${schedule.id}:`, err);
      results.push({ schedule_id: schedule.id, status: "error", error: err.message });
    }
  }

  console.log(`Processed ${results.length} check-in schedules`);
  return json({ processed: results.length, results });
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
