import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getAllProjects } from "@/lib/db";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { path: filePath, content } = body;

  if (!filePath || typeof content !== "string") {
    return NextResponse.json(
      { error: "path and content are required" },
      { status: 400 }
    );
  }

  if (Buffer.byteLength(content, "utf-8") > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "content too large (max 5MB)" },
      { status: 413 }
    );
  }

  const resolved = path.resolve(filePath);

  // Validate path belongs to a registered project
  const projects = await getAllProjects();
  const isAllowed = projects.some((p) => resolved.startsWith(p.path));
  if (!isAllowed) {
    return NextResponse.json({ error: "path not allowed" }, { status: 403 });
  }

  try {
    await fs.writeFile(resolved, content, "utf-8");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to write: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
