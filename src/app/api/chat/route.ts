import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, streamText } from "ai";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { renderAnalystPreread } from "@/lib/deck";

export async function POST(req: Request) {
  const { messages, system, levelId, playerId } = await req.json();

  if (!system || !levelId || !playerId) {
    return new Response("Missing required fields", { status: 400 });
  }

  const supabase = await createClient();

  const effectiveSystem = `[PRE-READ — the founder's LinkedIn + the website blurb you skimmed before the call. You have NOT seen a deck.]\n${renderAnalystPreread()}\n\n[YOUR ROLE]\n${system}`;

  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system: effectiveSystem,
    messages: await convertToModelMessages(messages),
    maxOutputTokens: 300,
    maxRetries: 3,
    tools: {
      end_level: {
        description: "Call this when the conversation is over. Score 0 if the founder failed. Score 1-10 based on how excited you are.",
        inputSchema: z.object({
          score: z.number().int().min(0).max(10).describe("0 = failed, 1-10 = excitement level"),
          justification: z.string().describe("Brief explanation of your score"),
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
          return { completed: true, score };
        },
      },
    },
  });

  return result.toUIMessageStreamResponse();
}
