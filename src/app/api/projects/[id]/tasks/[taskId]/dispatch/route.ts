import { NextResponse } from "next/server";
import { getTask, updateTask } from "@/lib/db";
import { dispatchTask, isTaskDispatched } from "@/lib/agent-dispatch";

type Params = { params: Promise<{ id: string; taskId: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id, taskId } = await params;
  const task = await getTask(id, taskId);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (task.status !== "in-progress" || task.dispatched) {
    return NextResponse.json({ error: "Task is not queued" }, { status: 400 });
  }

  if (isTaskDispatched(task.id)) {
    return NextResponse.json({ error: "Task is already dispatched" }, { status: 400 });
  }

  await updateTask(id, taskId, { dispatched: true });
  const terminalTabId = await dispatchTask(id, taskId, task.title, task.description, task.mode);

  if (!terminalTabId) {
    await updateTask(id, taskId, { dispatched: false });
  }

  return NextResponse.json({ success: true, terminalTabId });
}
