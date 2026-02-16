import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { getTask, updateTask, deleteTask, getProject } from "@/lib/db";
import { dispatchTask, abortTask, shouldDispatch, dispatchNextQueued } from "@/lib/agent-dispatch";
import { worktreeExists, mergeBranch, removeWorktree } from "@/lib/git-worktree";

const OPENCLAW = "/opt/homebrew/bin/openclaw";

type Params = { params: { id: string; taskId: string } };

export async function PATCH(request: Request, { params }: Params) {
  const body = await request.json();

  // Check for status transitions before applying update
  const prevTask = await getTask(params.id, params.taskId);

  const updated = await updateTask(params.id, params.taskId, body);
  if (!updated) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  let terminalTabId: string | undefined;

  // Dispatch/abort on status change
  if (prevTask && body.status && prevTask.status !== body.status) {
    if (body.status === "in-progress" && prevTask.status !== "in-progress") {
      await updateTask(params.id, params.taskId, { locked: true });
      updated.locked = true;
      if (await shouldDispatch(params.id)) {
        terminalTabId = await dispatchTask(params.id, params.taskId, updated.title, updated.description, updated.mode);
      }
    } else if (body.status === "todo" && prevTask.status !== "todo") {
      // Reset session data when moved back to todo from any status
      const resetFields = { locked: false, findings: "", humanSteps: "", agentLog: "" };
      await updateTask(params.id, params.taskId, resetFields);
      Object.assign(updated, resetFields);
      if (prevTask.status === "in-progress") {
        abortTask(params.id, params.taskId).catch((e) =>
          console.error(`[task-patch] abortTask failed:`, e)
        );
      }
    } else if (prevTask.status === "in-progress" && (body.status === "verify" || body.status === "done")) {
      // Merge worktree branch into main before verify/done
      const shortId = params.taskId.slice(0, 8);
      if (worktreeExists(shortId)) {
        const project = await getProject(params.id);
        if (project) {
          const projectPath = project.path.replace(/^~/, process.env.HOME || "~");
          const result = mergeBranch(projectPath, shortId);
          if (!result.merged && result.conflictMsg) {
            const existingFindings = updated.findings || "";
            const newFindings = existingFindings
              ? `${existingFindings}\n${result.conflictMsg}`
              : result.conflictMsg;
            await updateTask(params.id, params.taskId, { findings: newFindings });
            updated.findings = newFindings;
          }
        }
      }

      // Agent completed — notify Slack
      try {
        const title = updated.title.replace(/"/g, '\\"');
        execSync(
          `${OPENCLAW} message send --channel slack --target C0AEY4GBCGM --message "✅ *${title}* → ${body.status}"`,
          { timeout: 10_000 }
        );
      } catch (e) {
        console.error(`[task-patch] slack verify notify failed:`, e);
      }
      // Auto-dispatch next queued task in sequential mode
      dispatchNextQueued(params.id).catch(e =>
        console.error(`[task-patch] auto-dispatch next failed:`, e)
      );
    } else if (body.status === "done") {
      // Safety-net: clean up any lingering worktree on done transition
      const shortId = params.taskId.slice(0, 8);
      if (worktreeExists(shortId)) {
        const project = await getProject(params.id);
        if (project) {
          const projectPath = project.path.replace(/^~/, process.env.HOME || "~");
          removeWorktree(projectPath, shortId);
        }
      }
    }
  }

  return NextResponse.json({ ...updated, terminalTabId });
}

export async function DELETE(_request: Request, { params }: Params) {
  // Clean up any worktree before deleting
  const shortId = params.taskId.slice(0, 8);
  if (worktreeExists(shortId)) {
    const project = await getProject(params.id);
    if (project) {
      const projectPath = project.path.replace(/^~/, process.env.HOME || "~");
      removeWorktree(projectPath, shortId);
    }
  }

  const deleted = await deleteTask(params.id, params.taskId);
  if (!deleted) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
