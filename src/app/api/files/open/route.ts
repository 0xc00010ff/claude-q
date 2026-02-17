import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import path from "path";
import { getAllProjects } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { path: targetPath } = body;

  if (!targetPath) {
    return NextResponse.json(
      { error: "path is required" },
      { status: 400 }
    );
  }

  const resolved = path.resolve(targetPath);

  // Validate path belongs to a registered project
  const projects = await getAllProjects();
  const isAllowed = projects.some((p) => resolved.startsWith(p.path));
  if (!isAllowed) {
    return NextResponse.json({ error: "path not allowed" }, { status: 403 });
  }

  // Use osascript to show native macOS app chooser, then open the folder with it
  const appleScript = [
    'set chosenFile to choose file of type {"app"} default location "/Applications" with prompt "Open project with:"',
    "set appPath to POSIX path of chosenFile",
    `do shell script "open -a " & quoted form of appPath & " " & quoted form of "${resolved.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
  ];

  const args = appleScript.flatMap((line) => ["-e", line]);

  return new Promise<NextResponse>((resolve) => {
    execFile("/usr/bin/osascript", args, (error) => {
      if (error) {
        // User cancelled the dialog
        if (error.message.includes("User canceled")) {
          resolve(NextResponse.json({ ok: true, cancelled: true }));
        } else {
          resolve(
            NextResponse.json(
              { error: `Failed to open: ${error.message}` },
              { status: 500 }
            )
          );
        }
      } else {
        resolve(NextResponse.json({ ok: true }));
      }
    });
  });
}
