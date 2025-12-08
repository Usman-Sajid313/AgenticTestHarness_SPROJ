import { getSessionUser } from "@/lib/auth"; // your existing session helper
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const { name, description } = await req.json();
  const user = await getSessionUser(); // get logged-in user

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Get any workspace user belongs to
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
  });

  if (!membership) {
    return new Response("User is not part of any workspace", { status: 400 });
  }

  const project = await prisma.project.create({
    data: {
      name,
      description,
      workspaceId: membership.workspaceId,
      createdById: user.id,
    },
  });

  return Response.json(project);
}
