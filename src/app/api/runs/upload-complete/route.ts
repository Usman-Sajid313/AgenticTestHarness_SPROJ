import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supabaseServerClient } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth";

export async function POST(req: Request) {
  const { runId, storageKey, sha256, sizeBytes } = await req.json();

  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!runId || !storageKey) {
    return NextResponse.json(
      { error: "Missing runId or storageKey" },
      { status: 400 }
    );
  }

  const run = await prisma.agentRun.findUnique({
    where: { id: runId },
    include: { logfiles: true },
  });

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (run.status !== "UPLOADING") {
    return NextResponse.json(
      { error: `Run is not in UPLOADING status (current: ${run.status})` },
      { status: 400 }
    );
  }

  const { data: pubData } = supabaseServerClient.storage
    .from("agent-logs")
    .getPublicUrl(storageKey);

  const logfile = run.logfiles[0];
  if (logfile) {
    await prisma.runLogfile.update({
      where: { id: logfile.id },
      data: {
        storageKey,
        url: pubData.publicUrl,
        sizeBytes: sizeBytes || logfile.sizeBytes,
        checksum: sha256,
      },
    });
  } else {
    await prisma.runLogfile.create({
      data: {
        runId: run.id,
        projectId: run.projectId,
        uploadedById: user.id,
        storageKey,
        url: pubData.publicUrl,
        sizeBytes: sizeBytes || 0,
        checksum: sha256,
      },
    });
  }

  await prisma.agentRun.update({
    where: { id: runId },
    data: { status: "UPLOADED" },
  });

  return NextResponse.json({
    success: true,
    runId,
    status: "UPLOADED",
  });
}

