import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { renderAnalystPreread } from "@/lib/deck";

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
          "Call this when the conversation is over. Score 0 if the founder failed. Score 1-10 based on how excited you are.",
        inputSchema: z.object({
          score: z
            .number()
            .int()
            .min(0)
            .max(10)
            .describe("0 = failed, 1-10 = excitement level"),
          justification: z
            .string()
            .describe("Brief explanation of your score"),
        }),
        execute: async ({ score, justification }) => {
          const { count } = await supabase
            .from("scores")
            .select("id", { count: "exact", head: true })
            .eq("player_id", playerId)
            .eq("level_id", levelId);

          if (count !== null && count >= 2) {
            return { completed: false, error: "No attempts remaining" };
          }

          await supabase.from("scores").insert({
            player_id: playerId,
            level_id: levelId,
            score,
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

          return { completed: true, score };
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
