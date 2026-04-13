import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, streamText } from "ai";

export async function POST(req: Request) {
  const { messages, system } = await req.json();

  if (!system) {
    return new Response("Missing system prompt", { status: 400 });
  }

  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system,
    messages: await convertToModelMessages(messages),
    maxOutputTokens: 300,
    maxRetries: 3,
  });

  return result.toUIMessageStreamResponse();
}
