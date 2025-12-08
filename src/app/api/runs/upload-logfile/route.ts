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
      status: "PENDING",
    },
  });

  const ext = file.name.split(".").pop() || "log";
  const storageKey = `${projectId}/${run.id}.${ext}`;

  const uploadRes = await supabaseServerClient.storage
    .from("agent-logs")
    .upload(storageKey, file, {
      contentType: file.type || "text/plain",
      upsert: true,
    });

  if (uploadRes.error) {
    console.error(uploadRes.error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  const { data: pubData } = supabaseServerClient.storage
    .from("agent-logs")
    .getPublicUrl(storageKey);

  await prisma.runLogfile.create({
    data: {
      runId: run.id,
      projectId,
      uploadedById: user.id,
      storageKey,
      url: pubData.publicUrl,
      sizeBytes: file.size,
      contentType: file.type,
    },
  });

  return NextResponse.json({ runId: run.id });
}
