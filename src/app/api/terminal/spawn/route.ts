import { NextResponse } from "next/server";
import { spawnPty } from "@/lib/pty-server";

export async function POST(request: Request) {
  const { tabId, cmd, cwd } = await request.json();

  if (!tabId) {
    return NextResponse.json({ error: "tabId is required" }, { status: 400 });
  }

  const entry = spawnPty(tabId, cmd, cwd);
  if (!entry) {
    return NextResponse.json({ error: "Failed to spawn terminal" }, { status: 500 });
  }
  return NextResponse.json({ tabId });
}
