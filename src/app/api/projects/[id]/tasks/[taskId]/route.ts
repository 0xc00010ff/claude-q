import { NextResponse } from "next/server";
import { getTask, updateTask, deleteTask } from "@/lib/db";
import { abortTask, processQueue, scheduleCleanup, cancelCleanup, notify } from "@/lib/agent-dispatch";

type Params = { params: Promise<{ id: string; taskId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id, taskId } = await params;
  const body = await request.json();

  // Check for status transitions before applying update
  const prevTask = await getTask(id, taskId);

  const updated = await updateTask(id, taskId, body);
  if (!updated) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Handle status transitions
  if (prevTask && body.status && prevTask.status !== body.status) {
    if (body.status === "in-progress" && prevTask.status !== "in-progress") {
      cancelCleanup(taskId);
      if (prevTask.status !== "verify") {
        // New dispatch: mark as not-yet-dispatched, processQueue will handle it
        await updateTask(id, taskId, { dispatched: false });
        updated.dispatched = false;
      }
    } else if (body.status === "todo" && prevTask.status !== "todo") {
      cancelCleanup(taskId);
      const resetFields = { dispatched: false, findings: "", humanSteps: "", agentLog: "" };
      await updateTask(id, taskId, resetFields);
      Object.assign(updated, resetFields);
      if (prevTask.status === "in-progress") {
        abortTask(id, taskId).catch((e) =>
          console.error(`[task-patch] abortTask failed:`, e)
        );
      }
    } else if (prevTask.status === "in-progress" && (body.status === "verify" || body.status === "done")) {
      if (body.status === "done") {
        scheduleCleanup(id, taskId);
      }
      notify(`✅ *${updated.title.replace(/"/g, '\\"')}* → ${body.status}`);
    } else if (body.status === "done" && prevTask.status === "verify") {
      scheduleCleanup(id, taskId);
    }

    // Single processQueue call handles all dispatch needs
    processQueue(id).catch(e =>
      console.error(`[task-patch] processQueue failed:`, e)
    );
  }

  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id, taskId } = await params;
  const task = await getTask(id, taskId);
  const deleted = await deleteTask(id, taskId);
  if (!deleted) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // If deleted task was in-progress, abort and process queue for next
  if (task?.status === "in-progress") {
    abortTask(id, taskId).catch(() => {});
    processQueue(id).catch(() => {});
  }

  return NextResponse.json({ success: true });
}
