import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z, ZodError } from "zod";
import { getSessionUser, hashApiToken } from "@/lib/auth";
import {
  API_TOKEN_SCOPE_VALUES,
  DEFAULT_API_TOKEN_SCOPES,
  sanitizeApiTokenScopes,
} from "@/lib/apiTokenScopes";
import { prisma } from "@/lib/prisma";

const TOKEN_PREFIX = "ath_";
const TOKEN_BYTE_LENGTH = 32;
const MAX_TOKENS_PER_USER = 25;

const CreateTokenSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Token name is required.")
    .max(100, "Token name must be 100 characters or fewer."),
  scopes: z.array(z.enum(API_TOKEN_SCOPE_VALUES)).min(1).default(DEFAULT_API_TOKEN_SCOPES),
});

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tokens = await prisma.apiToken.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      name: true,
      scopes: true,
      lastUsedAt: true,
      createdAt: true,
      revokedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ tokens });
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const raw = (await req.json()) as unknown;
    const { name, scopes } = CreateTokenSchema.parse(raw);
    const normalizedScopes = sanitizeApiTokenScopes(scopes);

    // Enforce per-user token limit
    const existingCount = await prisma.apiToken.count({
      where: { userId: user.id, revokedAt: null },
    });

    if (existingCount >= MAX_TOKENS_PER_USER) {
      return NextResponse.json(
        {
          error: `You can have at most ${MAX_TOKENS_PER_USER} active tokens. Revoke an existing token first.`,
        },
        { status: 400 }
      );
    }

    // Generate plaintext token and its hash
    const rawBytes = randomBytes(TOKEN_BYTE_LENGTH).toString("hex");
    const plaintext = `${TOKEN_PREFIX}${rawBytes}`;
    const hashedToken = hashApiToken(plaintext);

    // Create token + audit log in a transaction
    const apiToken = await prisma.$transaction(async (tx) => {
      const created = await tx.apiToken.create({
        data: {
          userId: user.id,
          name,
          hashedToken,
          scopes: normalizedScopes,
        },
        select: {
          id: true,
          name: true,
          scopes: true,
          createdAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "API_TOKEN_CREATED",
          targetType: "ApiToken",
          targetId: created.id,
          metadata: { name, scopes: normalizedScopes },
        },
      });

      return created;
    });

    // Return plaintext token exactly once — it is never stored or retrievable
    return NextResponse.json(
      {
        ok: true,
        token: {
          id: apiToken.id,
          name: apiToken.name,
          scopes: apiToken.scopes,
          createdAt: apiToken.createdAt,
          plaintext,
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      const first = err.issues[0];
      return NextResponse.json(
        { error: first?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    console.error("Error creating API token:", err);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
