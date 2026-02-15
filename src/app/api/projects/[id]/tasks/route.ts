import { NextResponse } from "next/server";
import { getAllTasks, createTask, getProject } from "@/lib/db";

type Params = { params: { id: string } };

export async function GET(_request: Request, { params }: Params) {
  const project = await getProject(params.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const tasks = await getAllTasks(params.id);
  return NextResponse.json(tasks);
}

export async function POST(request: Request, { params }: Params) {
  const project = await getProject(params.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await request.json();
  const title = body.title ?? "";
  const description = body.description ?? "";

  const task = await createTask(params.id, { title, description });
  return NextResponse.json(task, { status: 201 });
}
