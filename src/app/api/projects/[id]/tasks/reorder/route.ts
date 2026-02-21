import { NextResponse } from "next/server";
import { reorderTasks, getProject, getAllTasks, updateTask } from "@/lib/db";
import { abortTask, processQueue, scheduleCleanup, cancelCleanup } from "@/lib/agent-dispatch";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await request.json();
  const { items } = body as {
    items: { id: string; order: number; status?: string }[];
  };

  if (!Array.isArray(items)) {
    return NextResponse.json(
      { error: "items array is required" },
      { status: 400 }
    );
  }

  // Snapshot previous statuses before reorder
  const previousTasks = await getAllTasks(id);
  const prevStatusMap = new Map(previousTasks.map((t) => [t.id, t.status]));

  await reorderTasks(id, items);

  // Handle status transitions
  for (const item of items) {
    const prevStatus = prevStatusMap.get(item.id);
    const newStatus = item.status;
    if (!newStatus || prevStatus === newStatus) continue;

    if (newStatus === "in-progress" && prevStatus !== "in-progress") {
      cancelCleanup(item.id);
      if (prevStatus !== "verify") {
        // Mark as not-yet-dispatched; processQueue will handle it
        await updateTask(id, item.id, { dispatched: false });
      }
    } else if (newStatus === "todo" && prevStatus !== "todo") {
      cancelCleanup(item.id);
      await updateTask(id, item.id, { dispatched: false, findings: "", humanSteps: "", agentLog: "" });
      if (prevStatus === "in-progress") {
        abortTask(id, item.id).catch((e) =>
          console.error(`[reorder] abortTask failed for ${item.id}:`, e)
        );
      }
    } else if (newStatus === "done" && (prevStatus === "in-progress" || prevStatus === "verify")) {
      scheduleCleanup(id, item.id);
    }
  }

  // Single processQueue call at the end
  processQueue(id).catch(e =>
    console.error(`[reorder] processQueue failed:`, e)
  );

  return NextResponse.json({ success: true });
}
