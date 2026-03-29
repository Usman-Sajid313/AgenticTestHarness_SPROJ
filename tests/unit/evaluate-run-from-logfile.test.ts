import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.GOOGLE_GEMINI_API = 'test-key';

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
  downloadFile: vi.fn(),
  resolveWorkspaceModelConfig: vi.fn(),
  findUnique: vi.fn(),
  runEvaluationCreate: vi.fn(),
  agentRunUpdate: vi.fn(),
}));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: () => ({
      generateContent: mocks.generateContent,
    }),
  })),
}));

vi.mock('@/lib/storage', () => ({
  downloadFile: (...args: unknown[]) => mocks.downloadFile(...args),
}));

vi.mock('@/lib/modelConfig', () => ({
  resolveWorkspaceModelConfig: (...args: unknown[]) =>
    mocks.resolveWorkspaceModelConfig(...args),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    agentRun: {
      findUnique: (...args: unknown[]) => mocks.findUnique(...args),
      update: (...args: unknown[]) => mocks.agentRunUpdate(...args),
    },
    runEvaluation: {
      create: (...args: unknown[]) => mocks.runEvaluationCreate(...args),
    },
  },
}));

import { evaluateRunFromLogfile } from '@/lib/evaluator';

describe('evaluateRunFromLogfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.downloadFile.mockResolvedValue(Buffer.from('[TOOL_CALL]\nagent log line'));
    mocks.resolveWorkspaceModelConfig.mockResolvedValue({
      evaluatorModel: 'gemini-2.5-flash',
    });
    mocks.findUnique.mockResolvedValue({
      id: 'run_1',
      projectId: 'p1',
      testSuiteId: null,
      logfiles: [{ storageKey: 'key1' }],
      project: { workspaceId: 'ws1' },
    });
    mocks.generateContent.mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({
            overallComment: 'Good.',
            dimensions: {
              correctness_and_task_compliance: { score: 80, strengths: 'a', weaknesses: 'b' },
              resilience_and_error_handling: { score: 70, strengths: '', weaknesses: '' },
            },
          }),
      },
    });
    mocks.runEvaluationCreate.mockResolvedValue({
      id: 'ev1',
      totalScore: 75,
      runId: 'run_1',
    });
    mocks.agentRunUpdate.mockResolvedValue({});
  });

  it('calls Gemini, normalizes JSON, persists RunEvaluation, updates run', async () => {
    const result = await evaluateRunFromLogfile('run_1');
    expect(mocks.downloadFile).toHaveBeenCalledWith('key1');
    expect(mocks.generateContent).toHaveBeenCalled();
    expect(mocks.runEvaluationCreate).toHaveBeenCalled();
    const createData = mocks.runEvaluationCreate.mock.calls[0][0].data;
    expect(createData.status).toBe('COMPLETED');
    expect(createData.totalScore).toBe(75);
    expect(mocks.agentRunUpdate).toHaveBeenCalledWith({
      where: { id: 'run_1' },
      data: { status: 'COMPLETED', completedAt: expect.any(Date) },
    });
    expect(result.id).toBe('ev1');
  });

  it('handles fenced JSON from model response text()', async () => {
    mocks.generateContent.mockResolvedValue({
      response: {
        text: () =>
          '```json\n' +
          JSON.stringify({
            overallComment: 'Ok',
            dimensions: {
              output_quality: { score: 50 },
            },
          }) +
          '\n```',
      },
    });
    await evaluateRunFromLogfile('run_1');
    const createData = mocks.runEvaluationCreate.mock.calls[0][0].data;
    expect(createData.metricBreakdown.overallComment).toBe('Ok');
    expect(createData.totalScore).toBe(50);
  });
});
