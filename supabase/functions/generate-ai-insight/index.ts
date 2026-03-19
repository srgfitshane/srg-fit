import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── Types ──────────────────────────────────────────────────────────────────
type InsightType = "checkin_brief" | "progression" | "red_flag" | "recommended_action";

interface InsightRequest {
  client_id: string;
  coach_id: string;
  type: InsightType;
  trigger_id?: string; // e.g. check-in ID that triggered this
}

// ── Main handler ───────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" } });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const body: InsightRequest = await req.json();
  const { client_id, coach_id, type } = body;

  try {
    // ── 1. Gather client context ───────────────────────────────────────────
    const context = await gatherClientContext(supabase, client_id, coach_id);
    if (!context) return json({ error: "Client not found" }, 404);

    // ── 2. Build prompt based on insight type ──────────────────────────────
    const prompt = buildPrompt(type, context);

    // ── 3. Call Claude ─────────────────────────────────────────────────────
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text || "";

    // ── 4. Parse structured response ───────────────────────────────────────
    let parsed: any = {};
    try {
      const jsonMatch = rawText.match(/```json\n?([\s\S]*?)\n?```/) || rawText.match(/(\{[\s\S]*\})/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[1]) : { summary: rawText };
    } catch {
      parsed = { summary: rawText };
    }

    // ── 5. Determine priority ──────────────────────────────────────────────
    const priority = parsed.priority || (type === "red_flag" ? "high" : "normal");

    // ── 6. Save insight ────────────────────────────────────────────────────
    const { data: insight, error } = await supabase.from("ai_insights").insert({
      coach_id,
      client_id,
      type,
      title: parsed.title || defaultTitle(type, context.client.name),
      content: parsed,
      source_data: {
        checkins_analyzed: context.recentCheckins?.length || 0,
        daily_pulse_analyzed: context.dailyPulse?.length || 0,
        sessions_analyzed: context.recentSessions?.length || 0,
        has_nutrition_plan: !!context.nutritionPlan,
        active_habits: context.activeHabits?.length || 0,
        journal_entries_shared: context.recentJournal?.length || 0,
        weeks_of_data: context.weeksOfData,
      },
      priority,
      read: false,
    }).select().single();

    if (error) throw error;

    return json({ success: true, insight_id: insight.id, priority, title: insight.title });

  } catch (err: any) {
    console.error("AI insight error:", err);
    return json({ error: err.message }, 500);
  }
});

// ── Context gathering ──────────────────────────────────────────────────────
async function gatherClientContext(supabase: any, client_id: string, coach_id: string) {
  const [clientRes, checkinsRes, dailyPulseRes, sessionsRes, progressionRes, programRes, nutritionRes, habitsRes, journalRes] = await Promise.all([
    supabase.from("clients")
      .select("*, profile:profiles!clients_profile_id_fkey(full_name)")
      .eq("id", client_id).single(),

    // Legacy check-ins
    supabase.from("check_ins")
      .select("*")
      .eq("client_id", client_id)
      .order("created_at", { ascending: false })
      .limit(6),

    // Daily pulse check-ins (the active table)
    supabase.from("daily_checkins")
      .select("*")
      .eq("client_id", client_id)
      .order("checkin_date", { ascending: false })
      .limit(14),

    supabase.from("workout_sessions")
      .select("*, exercise_logs(*)")
      .eq("client_id", client_id)
      .order("date", { ascending: false })
      .limit(12),

    supabase.from("progression_snapshots")
      .select("*, exercise:exercises(name, movement_pattern)")
      .eq("client_id", client_id)
      .order("week_start", { ascending: false })
      .limit(20),

    supabase.from("programs")
      .select("*, workout_blocks(*, block_exercises(*, exercise:exercises(name)))")
      .eq("client_id", client_id)
      .eq("active", true)
      .eq("is_template", false)
      .order("created_at", { ascending: false })
      .limit(1),

    // Active nutrition plan
    supabase.from("nutrition_plans")
      .select("calories_target, protein_g, carbs_g, fat_g, water_oz, notes, approach")
      .eq("client_id", client_id)
      .eq("is_active", true)
      .single(),

    // Active habits + recent completion rate
    supabase.from("habits")
      .select("id, name, habit_type, target, active")
      .eq("client_id", client_id)
      .eq("active", true),

    // Recent journal entries (non-private only — respects privacy)
    supabase.from("journal_entries")
      .select("entry_date, body, is_private")
      .eq("client_id", client_id)
      .eq("is_private", false)
      .order("entry_date", { ascending: false })
      .limit(7),
  ]);

  if (!clientRes.data) return null;

  const weeksOfData = checkinsRes.data?.length
    ? Math.ceil((Date.now() - new Date(checkinsRes.data[checkinsRes.data.length - 1].created_at).getTime()) / (7 * 24 * 60 * 60 * 1000))
    : 0;

  return {
    client: { id: client_id, name: clientRes.data.profile?.full_name || "Client" },
    recentCheckins: checkinsRes.data || [],
    dailyPulse: dailyPulseRes.data || [],
    recentSessions: sessionsRes.data || [],
    progressionData: progressionRes.data || [],
    activeProgram: programRes.data?.[0] || null,
    nutritionPlan: nutritionRes.data || null,
    activeHabits: habitsRes.data || [],
    recentJournal: journalRes.data || [],
    weeksOfData,
  };
}

// ── Prompt builder ─────────────────────────────────────────────────────────
function buildPrompt(type: InsightType, ctx: any): string {
  const clientName = ctx.client.name;
  const hasCheckins = ctx.recentCheckins.length > 0;
  const hasSessions = ctx.recentSessions.length > 0;

  const dataBlock = JSON.stringify({
    client: clientName,
    nutrition_plan: ctx.nutritionPlan ? {
      calories_target: ctx.nutritionPlan.calories_target,
      protein_g: ctx.nutritionPlan.protein_g,
      carbs_g: ctx.nutritionPlan.carbs_g,
      fat_g: ctx.nutritionPlan.fat_g,
      approach: ctx.nutritionPlan.approach,
    } : null,
    active_habits: ctx.activeHabits.map((h: any) => ({ name: h.name, type: h.habit_type, target: h.target })),
    daily_pulse: ctx.dailyPulse.slice(0, 7).map((c: any) => ({
      date: c.checkin_date,
      sleep_score: c.sleep_score,
      mood_score: c.mood_score,
      energy_score: c.energy_score,
      stress_score: c.stress_score,
    })),
    recent_checkins: ctx.recentCheckins.slice(0, 4).map((c: any) => ({
      date: c.created_at?.split("T")[0],
      weight: c.weight,
      sleep_score: c.sleep_score,
      stress_score: c.stress_score,
      energy_score: c.energy_score,
      recovery_score: c.recovery_score,
      mood_score: c.mood_score,
      habit_completion_pct: c.habit_completion_pct,
      notes: c.notes,
    })),
    recent_sessions: ctx.recentSessions.slice(0, 6).map((s: any) => ({
      date: s.date,
      status: s.status,
      overall_rpe: s.overall_rpe,
      energy_level: s.energy_level,
      duration_minutes: s.duration_minutes,
      exercises_logged: s.exercise_logs?.length || 0,
    })),
    progression_data: ctx.progressionData.slice(0, 10).map((p: any) => ({
      exercise: p.exercise?.name,
      week: p.week_start,
      max_weight: p.max_weight,
      total_volume: p.total_volume,
      avg_rpe: p.avg_rpe,
      trend: p.trend,
      weight_change_pct: p.weight_change_pct,
    })),
    shared_journal_entries: ctx.recentJournal.map((j: any) => ({
      date: j.entry_date,
      excerpt: j.body?.slice(0, 200),
    })),
  }, null, 2);

  const prompts: Record<InsightType, string> = {
    checkin_brief: `
Analyze this client's recent check-in data and generate a brief coach summary.
Client: ${clientName}
Data: ${dataBlock}

Generate a coaching insight focusing on:
1. Key trends (positive and concerning)
2. What's worth addressing this week
3. One concrete suggested action

Keep it practical and coach-focused. You're a second brain for the coach, not the client.`,

    progression: `
Analyze this client's workout progression data and identify patterns.
Client: ${clientName}
Data: ${dataBlock}

Focus on:
1. Which lifts are progressing / stalling / regressing
2. Whether the training load seems appropriate
3. Specific load or rep suggestions if stalling

Be specific with numbers where possible.`,

    red_flag: `
Review this client's data for any red flags that warrant coach attention.
Client: ${clientName}
Data: ${dataBlock}

Look for:
1. Multiple consecutive low energy/recovery scores
2. Significant drops in training performance
3. Stress + poor sleep + high training load combo
4. Missed workouts pattern
5. Anything unusual or concerning

Only flag genuine concerns, not minor variations. If nothing concerning, say so.`,

    recommended_action: `
Based on this client's recent data, what's the most impactful action the coach could take right now?
Client: ${clientName}
Data: ${dataBlock}

Could be: a program adjustment, a check-in message, a deload week, nutrition tweak, etc.
Give one clear, specific recommendation with reasoning.`,
  };

  return prompts[type] || prompts.checkin_brief;
}

// ── System prompt ──────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert fitness coaching assistant embedded inside SRG Fit, a coaching platform.
Your role is to help coaches notice patterns and make better decisions — you are NOT client-facing.
Be direct, specific, and practical. Avoid generic advice.
Always respond in JSON format like this:
{
  "title": "Brief title for the coach notification (max 60 chars)",
  "priority": "low|normal|high|urgent",
  "summary": "2-3 sentence summary the coach reads at a glance",
  "bullets": ["Key point 1", "Key point 2", "Key point 3"],
  "suggested_action": "One specific thing the coach should consider doing",
  "data_confidence": "low|medium|high (based on how much data was available)"
}
Only use "high" or "urgent" priority for genuinely concerning patterns.
If there is insufficient data to draw conclusions, say so clearly in the summary.`;

// ── Helpers ────────────────────────────────────────────────────────────────
function defaultTitle(type: InsightType, clientName: string): string {
  const titles: Record<InsightType, string> = {
    checkin_brief: `${clientName} — Weekly Check-in Brief`,
    progression: `${clientName} — Progression Analysis`,
    red_flag: `${clientName} — Needs Attention`,
    recommended_action: `${clientName} — Suggested Action`,
  };
  return titles[type] || `${clientName} — AI Insight`;
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
