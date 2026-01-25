import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getActiveOpenAIKeyMetadata, rotateOpenAIKey } from '@/lib/openaiKeys';

export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { metadata, rotated } = rotateOpenAIKey();

    return NextResponse.json({
      message: rotated
        ? `Switched to ${metadata.envVar} (${metadata.index + 1}/${metadata.total}).`
        : 'Only one API key configured; nothing to rotate.',
      activeKeyEnvVar: metadata.envVar,
      activeKeyIndex: metadata.index,
      totalApiKeys: metadata.total,
      rotated,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const metadata = getActiveOpenAIKeyMetadata();
    return NextResponse.json({
      activeKeyEnvVar: metadata.envVar,
      activeKeyIndex: metadata.index,
      totalApiKeys: metadata.total,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}


