import { streamText } from "ai";
import { getVcSystemPrompt } from "@/lib/vc-prompts";
import { VcType } from "@/lib/types";

export async function POST(req: Request) {
  const { messages, vcType } = await req.json();

  if (!vcType || !["visionary", "empath", "shark"].includes(vcType)) {
    return new Response("Invalid VC type", { status: 400 });
  }

  const systemPrompt = getVcSystemPrompt(vcType as VcType);

  const result = streamText({
    model: "anthropic/claude-sonnet-4.6",
    system: systemPrompt,
    messages,
    maxOutputTokens: 300,
  });

  return result.toUIMessageStreamResponse();
}
