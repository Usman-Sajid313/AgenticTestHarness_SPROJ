import { randomUUID } from 'crypto';
import { buildDefaultTestSuite, type TestSuite } from '@/lib/mockToolCatalog';

export type TestRunStatus = 'success' | 'partial' | 'failed' | 'error';

export type TestRunToolCall = {
  toolId: string;
  toolName: string;
  input: unknown;
  output: unknown;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
};

export type TestRunMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
};

export type TestRunRecord = {
  id: string;
  suiteId: string;
  status: TestRunStatus;
  startedAt: Date;
  completedAt: Date;
  summary: string;
  transcript: TestRunMessage[];
  toolCalls: TestRunToolCall[];
  metrics?: Record<string, number>;
  rawModelOutput?: unknown;
};

type UserSuiteState = {
  suite: TestSuite;
  runs: TestRunRecord[];
};

const MAX_RUN_HISTORY = 20;
const suiteStore = new Map<string, UserSuiteState>();


function createUserSuiteState(): UserSuiteState {
  const suite = buildDefaultTestSuite(); 
  return { suite, runs: [] };
}

export function ensureDefaultSuiteForUser(userId: string): TestSuite {
  if (!suiteStore.has(userId)) {
    
    suiteStore.set(userId, createUserSuiteState());
  }
  return suiteStore.get(userId)!.suite;
}

export function getSuiteForUser(userId: string): TestSuite {
  const existing = suiteStore.get(userId);
  if (existing) return existing.suite;
  return ensureDefaultSuiteForUser(userId);
}

export function getRecentRuns(userId: string, limit = 10): TestRunRecord[] {
  const state = suiteStore.get(userId);
  if (!state) return [];
  return state.runs.slice(0, limit);
}

type RecordSuiteRunInput = Omit<TestRunRecord, 'id'> & { id?: string };

export function recordSuiteRun(userId: string, input: RecordSuiteRunInput): TestRunRecord {
  const state = suiteStore.get(userId) ?? createUserSuiteState();
  suiteStore.set(userId, state);

  const record: TestRunRecord = {
    ...input,
    id: input.id ?? randomUUID(),
  };

  state.runs.unshift(record);
  if (state.runs.length > MAX_RUN_HISTORY) {
    state.runs.length = MAX_RUN_HISTORY;
  }

  return record;
}

export function clearSuiteStore() {
  suiteStore.clear();
}