import { NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { VcType } from "@/lib/types";

export async function POST(req: Request) {
  const { playerId, vcType, messages } = await req.json();

  if (!playerId || !vcType || !messages || messages.length === 0) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const transcript = messages
    .map((m: { role: string; content: string }) =>
      `${m.role === "user" ? "Founder" : "VC"}: ${m.content}`
    )
    .join("\n");

  const result = await generateText({
    model: anthropic("claude-sonnet-4-6-20250514"),
    output: Output.object({
      schema: z.object({
        valuation: z.number().describe("The last pre-money valuation in millions the VC offered or agreed to. 0 if none discussed."),
      }),
    }),
    system: "You extract deal terms from VC negotiation transcripts. Read the conversation and determine the last pre-money valuation number the VC offered or agreed to.",
    prompt: transcript,
    maxOutputTokens: 50,
  });

  const valuation = result.output?.valuation ?? 0;

  if (valuation <= 0) {
    return NextResponse.json(
      { error: "Could not determine valuation from conversation" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("negotiations")
    .insert({
      player_id: playerId,
      vc_type: vcType as VcType,
      final_valuation: valuation,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ valuation, negotiation: data });
}
