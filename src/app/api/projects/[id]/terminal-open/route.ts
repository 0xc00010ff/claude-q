import { NextResponse } from "next/server";
import { getTerminalOpen, setTerminalOpen } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const open = await getTerminalOpen(id);
  return NextResponse.json({ open });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const open = Boolean(body.open);
  await setTerminalOpen(id, open);
  return NextResponse.json({ open });
}
