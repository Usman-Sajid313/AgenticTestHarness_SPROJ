import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getScopedUserMock,
  findUniqueMock,
  findFirstMock,
} = vi.hoisted(() => ({
  getScopedUserMock: vi.fn(),
  findUniqueMock: vi.fn(),
  findFirstMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getScopedUser: getScopedUserMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentRun: {
      findUnique: findUniqueMock,
    },
    membership: {
      findFirst: findFirstMock,
    },
  },
}));

import { GET } from "@/app/api/runs/[id]/route";

describe("GET /api/runs/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no valid session or bearer token is present", async () => {
    getScopedUserMock.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost:3000/api/runs/run_123") as never, {
      params: Promise.resolve({ id: "run_123" }),
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("returns 403 when the user is not in the run workspace", async () => {
    getScopedUserMock.mockResolvedValue({
      id: "user_123",
      email: "user@example.com",
      name: "User",
      status: "ACTIVE",
    });
    findUniqueMock.mockResolvedValue({
      id: "run_123",
      evaluations: [],
      project: { id: "project_123", workspaceId: "ws_other" },
      logfiles: [],
      traceSummary: null,
      metrics: null,
      ruleFlags: [],
      judgePacket: null,
    });
    findFirstMock.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost:3000/api/runs/run_123") as never, {
      params: Promise.resolve({ id: "run_123" }),
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("returns the run when the user has read access to its workspace", async () => {
    getScopedUserMock.mockResolvedValue({
      id: "user_123",
      email: "user@example.com",
      name: "User",
      status: "ACTIVE",
    });
    findUniqueMock.mockResolvedValue({
      id: "run_123",
      evaluations: [],
      project: { id: "project_123", workspaceId: "ws_123" },
      logfiles: [],
      traceSummary: null,
      metrics: null,
      ruleFlags: [],
      judgePacket: null,
    });
    findFirstMock.mockResolvedValue({ id: "membership_123" });

    const res = await GET(new Request("http://localhost:3000/api/runs/run_123") as never, {
      params: Promise.resolve({ id: "run_123" }),
    });

    expect(getScopedUserMock).toHaveBeenCalledWith("read");
    expect(findFirstMock).toHaveBeenCalledWith({
      where: {
        userId: "user_123",
        workspaceId: "ws_123",
      },
      select: { id: true },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.run.id).toBe("run_123");
    expect(body.evaluation).toBeNull();
  });
});
