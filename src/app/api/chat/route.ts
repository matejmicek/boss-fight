import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { renderAnalystPreread } from "@/lib/deck";
import { MAX_ATTEMPTS_PER_LEVEL } from "@/lib/types";
import { PARTNER_LEVEL_NAMES } from "@/lib/levels";

export async function POST(req: Request) {
  const { messages, system, levelId, playerId } = await req.json();

  if (!system || !levelId || !playerId) {
    return new Response("Missing required fields", { status: 400 });
  }

  const supabase = await createClient();

  // Find or create the active conversation for this (player, level)
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("player_id", playerId)
    .eq("level_id", levelId)
    .eq("status", "active")
    .maybeSingle();

  let conversationId: string | null = existing?.id ?? null;
  if (!conversationId) {
    const { data: created, error: insertErr } = await supabase
      .from("conversations")
      .insert({
        player_id: playerId,
        level_id: levelId,
        messages: [],
        status: "active",
      })
      .select("id")
      .single();
    if (insertErr) {
      console.warn("conversations insert failed:", insertErr);
    }
    conversationId = created?.id ?? null;
  }

  const effectiveSystem = `[SCENE — a founder just cold-DM'd you on LinkedIn. You clicked their profile and took 90 seconds on the website. This chat IS that LinkedIn DM thread. No deck, no intro from anyone you trust, no prior call.]\n\n[WHAT YOU SKIMMED]\n${renderAnalystPreread()}\n\n[YOUR ROLE]\n${system}`;

  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system: effectiveSystem,
    messages: await convertToModelMessages(messages),
    maxOutputTokens: 300,
    maxRetries: 3,
    tools: {
      end_level: {
        description:
          "Call this when the conversation is over. This marks the conversation complete — it does NOT produce a score. All scoring happens at the end of the event via batch evaluation against every other founder's transcript. You do not grade the founder.",
        inputSchema: z.object({
          justification: z
            .string()
            .describe(
              "One-line internal note on the outcome (e.g. 'Forwarded to Marcus' or 'Passed — no real numbers'). Ignored for scoring."
            ),
        }),
        execute: async ({ justification }) => {
          // Partner has two routes (voice + text). Attempts pool across both.
          const { data: thisLevel } = await supabase
            .from("levels")
            .select("name")
            .eq("id", levelId)
            .maybeSingle();
          const inPartnerGroup =
            thisLevel?.name != null &&
            PARTNER_LEVEL_NAMES.has(thisLevel.name);
          let attemptLevelIds: number[] = [levelId];
          if (inPartnerGroup) {
            const { data: partnerRows } = await supabase
              .from("levels")
              .select("id")
              .in("name", [...PARTNER_LEVEL_NAMES]);
            attemptLevelIds = (partnerRows ?? []).map(
              (l: { id: number }) => l.id
            );
            if (attemptLevelIds.length === 0) attemptLevelIds = [levelId];
          }

          const { count } = await supabase
            .from("scores")
            .select("id", { count: "exact", head: true })
            .eq("player_id", playerId)
            .in("level_id", attemptLevelIds);

          if (count !== null && count >= MAX_ATTEMPTS_PER_LEVEL) {
            return { completed: false, error: "No attempts remaining" };
          }

          // Participation marker. Score value is a sentinel — the batch
          // evaluator ranks players from their full transcripts, not this row.
          await supabase.from("scores").insert({
            player_id: playerId,
            level_id: levelId,
            score: 0,
            justification,
          });

          if (conversationId) {
            await supabase
              .from("conversations")
              .update({
                status: "completed",
                updated_at: new Date().toISOString(),
              })
              .eq("id", conversationId);
          }

          return { completed: true };
        },
      },
    },
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages as UIMessage[],
    onFinish: async ({ messages: finalMessages }) => {
      if (!conversationId) return;
      const { error } = await supabase
        .from("conversations")
        .update({
          messages: finalMessages,
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversationId);
      if (error) console.warn("conversations messages update failed:", error);
    },
  });
}
