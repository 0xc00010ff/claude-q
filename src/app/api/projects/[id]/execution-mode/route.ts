import { NextResponse } from "next/server";
import { getExecutionMode, setExecutionMode } from "@/lib/db";
import { processQueue, getAllCleanupTimes } from "@/lib/agent-dispatch";
import type { ExecutionMode } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const mode = await getExecutionMode(id);
  const cleanupTimes = getAllCleanupTimes();
  return NextResponse.json({ mode, cleanupTimes });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const mode = body.mode as ExecutionMode;

  if (mode !== "sequential" && mode !== "parallel") {
    return NextResponse.json(
      { error: "mode must be 'sequential' or 'parallel'" },
      { status: 400 }
    );
  }

  await setExecutionMode(id, mode);

  // processQueue will dispatch queued tasks according to the new mode
  processQueue(id);

  return NextResponse.json({ mode });
}
