const KEY_ENV_PREFIX = 'OPENAI_API_KEY';

type OpenAIKeyEntry = {
  envVar: string;
  value: string;
};

export type OpenAIKeyMetadata = {
  envVar: string;
  index: number;
  total: number;
};

let activeKeyIndex = 0;

function loadKeyEntries(): OpenAIKeyEntry[] {
  const entries: OpenAIKeyEntry[] = [];
  const seenValues = new Set<string>();

  const defaultKey = process.env[KEY_ENV_PREFIX]?.trim();
  if (defaultKey) {
    entries.push({ envVar: KEY_ENV_PREFIX, value: defaultKey });
    seenValues.add(defaultKey);
  }

  for (const [envVar, rawValue] of Object.entries(process.env)) {
    if (envVar === KEY_ENV_PREFIX) continue;
    if (!envVar.startsWith(`${KEY_ENV_PREFIX}_`)) continue;

    const value = rawValue?.trim();
    if (!value || seenValues.has(value)) continue;

    entries.push({ envVar, value });
    seenValues.add(value);
  }

  if (entries.length === 0) {
    throw new Error('No OpenAI API keys configured. Set OPENAI_API_KEY in your environment.');
  }

  if (activeKeyIndex >= entries.length) {
    activeKeyIndex = 0;
  }

  return entries;
}

function buildMetadata(entries: OpenAIKeyEntry[]): OpenAIKeyMetadata {
  return {
    envVar: entries[activeKeyIndex].envVar,
    index: activeKeyIndex,
    total: entries.length,
  };
}

export function getActiveOpenAIKey(): string {
  const entries = loadKeyEntries();
  return entries[activeKeyIndex].value;
}

export function getActiveOpenAIKeyMetadata(): OpenAIKeyMetadata {
  const entries = loadKeyEntries();
  return buildMetadata(entries);
}

export function rotateOpenAIKey(): { metadata: OpenAIKeyMetadata; rotated: boolean } {
  const entries = loadKeyEntries();
  if (entries.length === 1) {
    return {
      metadata: buildMetadata(entries),
      rotated: false,
    };
  }

  activeKeyIndex = (activeKeyIndex + 1) % entries.length;
  return {
    metadata: buildMetadata(entries),
    rotated: true,
  };
}


