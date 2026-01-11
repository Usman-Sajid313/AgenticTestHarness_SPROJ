import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supabaseServerClient } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth";

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const projectId = formData.get("projectId") as string | null;

  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!file || !projectId) {
    return NextResponse.json(
      { error: "Missing file or projectId" },
      { status: 400 }
    );
  }

  const run = await prisma.agentRun.create({
    data: {
      projectId,
      triggeredById: user.id,
      status: "CREATED",
    },
  });

  const ext = file.name.split(".").pop() || "log";
  const storageKey = `${projectId}/${run.id}.${ext}`;

  await prisma.agentRun.update({
    where: { id: run.id },
    data: { status: "UPLOADING" },
  });

  const { error: uploadError } = await supabaseServerClient.storage
    .from("agent-logs")
    .upload(storageKey, file, {
      contentType: file.type || "text/plain",
      upsert: true,
    });

  if (uploadError) {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "FAILED" },
    });
    return NextResponse.json(
      { error: `Upload failed: ${uploadError.message}` },
      { status: 500 }
    );
  }

  const { data: pubData } = supabaseServerClient.storage
    .from("agent-logs")
    .getPublicUrl(storageKey);

  const fileBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", fileBuffer);
  const sha256 = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  await prisma.runLogfile.create({
    data: {
      runId: run.id,
      projectId,
      uploadedById: user.id,
      storageKey,
      url: pubData.publicUrl,
      sizeBytes: file.size,
      checksum: sha256,
      contentType: file.type || "text/plain",
    },
  });


  await prisma.agentRun.update({
    where: { id: run.id },
    data: { status: "UPLOADED" },
  });

  return NextResponse.json({
    runId: run.id,
    status: "UPLOADED",
  });
}
