import { JSONFilePreset } from "lowdb/node";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import type {
  ConfigData,
  Project,
  ProjectState,
  Task,
  ChatLogEntry,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");

// ── Config DB (projects list) ────────────────────────────
async function getConfigDb() {
  const filePath = path.join(DATA_DIR, "config.json");
  const defaultData: ConfigData = { projects: [] };
  return JSONFilePreset<ConfigData>(filePath, defaultData);
}

// ── State DB (per-project tasks + chat) ──────────────────
async function getStateDb(projectId: string) {
  const filePath = path.join(DATA_DIR, "state", `${projectId}.json`);
  const defaultData: ProjectState = { tasks: [], chatLog: [] };
  return JSONFilePreset<ProjectState>(filePath, defaultData);
}

// ═══════════════════════════════════════════════════════════
// PROJECTS
// ═══════════════════════════════════════════════════════════

export async function getAllProjects(): Promise<Project[]> {
  const db = await getConfigDb();
  return db.data.projects;
}

export async function getProject(id: string): Promise<Project | undefined> {
  const db = await getConfigDb();
  return db.data.projects.find((p) => p.id === id);
}

export async function createProject(
  data: Pick<Project, "name" | "path" | "serverUrl">
): Promise<Project> {
  const db = await getConfigDb();
  const project: Project = {
    id: uuidv4(),
    name: data.name,
    path: data.path,
    serverUrl: data.serverUrl,
    createdAt: new Date().toISOString(),
  };
  db.data.projects.push(project);
  await db.write();
  return project;
}

export async function updateProject(
  id: string,
  data: Partial<Pick<Project, "name" | "path" | "status" | "serverUrl">>
): Promise<Project | null> {
  const db = await getConfigDb();
  const project = db.data.projects.find((p) => p.id === id);
  if (!project) return null;
  Object.assign(project, data);
  await db.write();
  return project;
}

export async function deleteProject(id: string): Promise<boolean> {
  const db = await getConfigDb();
  const idx = db.data.projects.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  db.data.projects.splice(idx, 1);
  await db.write();
  return true;
}

// ═══════════════════════════════════════════════════════════
// TASKS
// ═══════════════════════════════════════════════════════════

export async function getAllTasks(projectId: string): Promise<Task[]> {
  const db = await getStateDb(projectId);
  return [...db.data.tasks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function getTask(
  projectId: string,
  taskId: string
): Promise<Task | undefined> {
  const db = await getStateDb(projectId);
  return db.data.tasks.find((t) => t.id === taskId);
}

export async function createTask(
  projectId: string,
  data: Pick<Task, "title" | "description"> & { priority?: Task["priority"] }
): Promise<Task> {
  const db = await getStateDb(projectId);
  const now = new Date().toISOString();
  const maxOrder = db.data.tasks.reduce((max, t) => Math.max(max, t.order ?? 0), 0);
  const task: Task = {
    id: uuidv4(),
    title: data.title,
    description: data.description,
    status: "todo",
    priority: data.priority,
    order: maxOrder + 1,
    createdAt: now,
    updatedAt: now,
  };
  db.data.tasks.push(task);
  await db.write();
  return task;
}

export async function reorderTasks(
  projectId: string,
  orderedIds: { id: string; order: number; status?: string }[]
): Promise<boolean> {
  const db = await getStateDb(projectId);
  for (const item of orderedIds) {
    const task = db.data.tasks.find((t) => t.id === item.id);
    if (task) {
      task.order = item.order;
      if (item.status) task.status = item.status as Task["status"];
      task.updatedAt = new Date().toISOString();
    }
  }
  await db.write();
  return true;
}

export async function updateTask(
  projectId: string,
  taskId: string,
  data: Partial<Pick<Task, "title" | "description" | "status" | "priority" | "order" | "findings" | "humanSteps" | "agentLog" | "locked" | "attachments">>
): Promise<Task | null> {
  const db = await getStateDb(projectId);
  const task = db.data.tasks.find((t) => t.id === taskId);
  if (!task) return null;
  Object.assign(task, data, { updatedAt: new Date().toISOString() });
  await db.write();
  return task;
}

export async function deleteTask(
  projectId: string,
  taskId: string
): Promise<boolean> {
  const db = await getStateDb(projectId);
  const idx = db.data.tasks.findIndex((t) => t.id === taskId);
  if (idx === -1) return false;
  db.data.tasks.splice(idx, 1);
  await db.write();
  return true;
}

// ═══════════════════════════════════════════════════════════
// CHAT LOG
// ═══════════════════════════════════════════════════════════

export async function getChatLog(projectId: string): Promise<ChatLogEntry[]> {
  const db = await getStateDb(projectId);
  return db.data.chatLog;
}

export async function addChatMessage(
  projectId: string,
  data: Pick<ChatLogEntry, "role" | "message" | "toolCalls">
): Promise<ChatLogEntry> {
  const db = await getStateDb(projectId);
  const entry: ChatLogEntry = {
    role: data.role,
    message: data.message,
    timestamp: new Date().toISOString(),
    toolCalls: data.toolCalls,
  };
  db.data.chatLog.push(entry);
  await db.write();
  return entry;
}
