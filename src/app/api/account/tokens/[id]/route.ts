import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(
  _req: Request,
  context: RouteContext
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { error: "Token ID is required." },
        { status: 400 }
      );
    }

    // Find the token and verify ownership
    const apiToken = await prisma.apiToken.findUnique({
      where: { id },
      select: { id: true, userId: true, name: true, revokedAt: true },
    });

    if (!apiToken) {
      return NextResponse.json(
        { error: "Token not found." },
        { status: 404 }
      );
    }

    if (apiToken.userId !== user.id) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    if (apiToken.revokedAt) {
      return NextResponse.json(
        { error: "Token is already revoked." },
        { status: 400 }
      );
    }

    // Revoke the token and create audit log in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.apiToken.update({
        where: { id },
        data: { revokedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "API_TOKEN_REVOKED",
          targetType: "ApiToken",
          targetId: id,
          metadata: { name: apiToken.name },
        },
      });
    });

    return NextResponse.json({ ok: true, message: "Token revoked." });
  } catch (err) {
    console.error("Error revoking API token:", err);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
