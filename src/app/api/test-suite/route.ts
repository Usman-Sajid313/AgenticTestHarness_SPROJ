import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { ensureDefaultSuiteForUser, getRecentRuns } from '@/lib/testSuiteStore';
import { getMockToolCatalog } from '@/lib/mockToolCatalog';
import { getConfiguredOpenAIModels } from '@/lib/openaiModels';
import { getActiveOpenAIKeyMetadata } from '@/lib/openaiKeys';

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const suite = ensureDefaultSuiteForUser(user.id);
  const runs = getRecentRuns(user.id).map((run) => ({
    ...run,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt.toISOString(),
    toolCalls: run.toolCalls.map((call) => ({
      ...call,
      startedAt: call.startedAt.toISOString(),
      completedAt: call.completedAt.toISOString(),
    })),
  }));

  const { models, defaultModel } = getConfiguredOpenAIModels();
  const activeKeyMetadata = getActiveOpenAIKeyMetadata();

  return NextResponse.json({
    suite,
    tools: getMockToolCatalog(),
    runs,
    models,
    defaultModel,
    activeKeyEnvVar: activeKeyMetadata.envVar,
    activeKeyIndex: activeKeyMetadata.index,
    totalApiKeys: activeKeyMetadata.total,
  });
}



