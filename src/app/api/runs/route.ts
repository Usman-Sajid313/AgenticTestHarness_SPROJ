import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export async function POST(req: Request) {
  const { projectId } = await req.json();

  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const project = await prisma.project.findFirst({
    where: { id: projectId },
  });

  if (!project) {
    return new Response("Project not found", { status: 404 });
  }

  const run = await prisma.agentRun.create({
    data: {
      projectId,
      triggeredById: user.id,
      status: "PENDING",
      taskName: "Default Task",
      taskDefinition: {},
    },
  });

  return Response.json(run);
}
