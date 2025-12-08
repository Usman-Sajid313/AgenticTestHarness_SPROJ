import { prisma } from "@/lib/prisma";
import ProjectListPage from "./ProjectListPage";

export default async function ProjectList() {
  const PAGE_SIZE = 15;

  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
  });

  const totalCount = await prisma.project.count();

  return (
    <ProjectListPage
      projects={projects}
      totalCount={totalCount}
      pageSize={PAGE_SIZE}
    />
  );
}
