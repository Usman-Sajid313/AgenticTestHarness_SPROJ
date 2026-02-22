import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSupabaseServerClient } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth";

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const projectId = formData.get("projectId") as string | null;
  const rubricId = formData.get("rubricId") as string | null;
  const sourceTypeRaw = formData.get("sourceType");
  const formatHintRaw = formData.get("formatHint");
  const mappingConfigRaw = formData.get("mappingConfig");

  const sourceType =
    typeof sourceTypeRaw === "string" && sourceTypeRaw.trim()
      ? sourceTypeRaw.trim()
      : null;
  const formatHint =
    typeof formatHintRaw === "string" && formatHintRaw.trim()
      ? formatHintRaw.trim()
      : null;

  let mappingConfig: Prisma.InputJsonValue | null = null;
  if (typeof mappingConfigRaw === "string" && mappingConfigRaw.trim()) {
    try {
      mappingConfig = JSON.parse(mappingConfigRaw) as Prisma.InputJsonValue;
    } catch {
      return NextResponse.json(
        { error: "Invalid mappingConfig JSON" },
        { status: 400 }
      );
    }
  }

  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!file || !projectId) {
    return NextResponse.json(
      { error: "Missing file or projectId" },
      { status: 400 }
    );
  }

  const supabaseServerClient = getSupabaseServerClient();

  const run = await prisma.agentRun.create({
    data: {
      projectId,
      triggeredById: user.id,
      rubricId: rubricId || null,
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
      metadata:
        sourceType || formatHint || mappingConfig
          ? ({
              sourceType,
              formatHint,
              mappingConfig,
            } as Prisma.InputJsonValue)
          : undefined,
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
