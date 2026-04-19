import { NextResponse } from "next/server";
import { getScopedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ACTION_LABELS: Record<string, string> = {
  USER_UPDATE_PROFILE: "Updated profile",
  USER_CHANGE_PASSWORD: "Changed password",
  USER_SIGNUP: "Account created",
  USER_LOGIN: "Logged in",
  USER_DELETE: "Deleted account",
  WORKSPACE_UPDATE_MODEL_CONFIG: "Updated model settings",
  TOOL_UPDATE: "Updated a tool",
  TOOL_DELETE: "Deleted a tool",
  SUITE_DELETE: "Deleted a test suite",
  API_TOKEN_CREATED: "Created API token",
  API_TOKEN_REVOKED: "Revoked API token",
};

type ActivityLogRow = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: unknown;
  createdAt: Date;
};

export async function GET(req: Request) {
  try {
    const user = await getScopedUser("read");
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Parse and validate the "limit" query parameter
    const { searchParams } = new URL(req.url);
    const rawLimit = parseInt(searchParams.get("limit") ?? "20", 10);
    const limit = Math.min(Math.max(isNaN(rawLimit) ? 20 : rawLimit, 1), 50);

    const logs = await prisma.auditLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const activities = (logs as ActivityLogRow[]).map((log) => ({
      id: log.id,
      action: log.action,
      label: ACTION_LABELS[log.action] ?? log.action,
      targetType: log.targetType,
      targetId: log.targetId ?? null,
      metadata: log.metadata,
      createdAt: log.createdAt.toISOString(),
    }));

    return NextResponse.json({ activities });
  } catch (error) {
    console.error("[analytics/activity] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
