import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { getVcSystemPrompt } from "@/lib/vc-prompts";
import { VcType } from "@/lib/types";

export async function POST(req: Request) {
  const { messages, vcType } = await req.json();

  if (!vcType || !["visionary", "empath", "shark"].includes(vcType)) {
    return new Response("Invalid VC type", { status: 400 });
  }

  const systemPrompt = getVcSystemPrompt(vcType as VcType);

  const result = streamText({
    model: anthropic("claude-sonnet-4-6-20250514"),
    system: systemPrompt,
    messages,
    maxOutputTokens: 300,
  });

  return result.toUIMessageStreamResponse();
}
