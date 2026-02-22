import { NextResponse } from "next/server";
import { reorderTasks, getProject, getAllTasks, updateTask } from "@/lib/db";
import { abortTask, processQueue, getInitialDispatch, scheduleCleanup, cancelCleanup } from "@/lib/agent-dispatch";

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
        const dispatch = await getInitialDispatch(id, item.id);
        await updateTask(id, item.id, { dispatch });
      }
    } else if (newStatus === "todo" && prevStatus !== "todo") {
      cancelCleanup(item.id);
      await updateTask(id, item.id, { dispatch: null, findings: "", humanSteps: "", agentLog: "" });
      if (prevStatus === "in-progress") {
        await abortTask(id, item.id);
      }
    } else if (newStatus === "done" && (prevStatus === "in-progress" || prevStatus === "verify")) {
      scheduleCleanup(id, item.id);
    }
  }

  // processQueue handles dispatch — detached so the response returns immediately
  processQueue(id);

  return NextResponse.json({ success: true });
}
