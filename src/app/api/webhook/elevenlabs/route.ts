import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  const body = await req.json();
  const supabase = await createClient();

  // Log the raw payload for debugging
  await supabase.from("webhook_logs").insert({ payload: body });

  return NextResponse.json({ ok: true });
}
