// ── Project ──────────────────────────────────────────────
export type ProjectStatus = 'active' | 'review' | 'idle' | 'error';

export interface Project {
  id: string;
  name: string;
  path: string;
  status?: ProjectStatus;
  serverUrl?: string;
  createdAt: string;
}

export interface ConfigData {
  projects: Project[];
}

// ── Task ─────────────────────────────────────────────────
export type TaskStatus = "todo" | "in-progress" | "verify" | "done";

export interface TaskAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority?: 'low' | 'medium' | 'high';
  order?: number;
  findings?: string;
  humanSteps?: string;
  agentLog?: string;
  locked?: boolean;
  attachments?: TaskAttachment[];
  createdAt: string;
  updatedAt: string;
}

// ── Chat ─────────────────────────────────────────────────
export interface ToolCall {
  action: string;
  detail: string;
}

export interface ChatLogEntry {
  role: "twin" | "brian";
  message: string;
  timestamp: string;
  toolCalls?: ToolCall[];
}

// ── Agent session ────────────────────────────────────────
export interface AgentSession {
  sessionKey: string;
  status: string;
}

// ── Per-project state ────────────────────────────────────
export interface ProjectState {
  tasks: Task[];
  chatLog: ChatLogEntry[];
  agentSession?: AgentSession;
}
