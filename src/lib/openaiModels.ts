const MODEL_ENV_PREFIX = 'OPENAI_MODEL';

export type OpenAIModelConfig = {
  models: string[];
  defaultModel: string;
};

export function getConfiguredOpenAIModels(): OpenAIModelConfig {
  const seen = new Set<string>();
  const models: string[] = [];

  const defaultModel = process.env.OPENAI_MODEL?.trim();
  if (defaultModel) {
    models.push(defaultModel);
    seen.add(defaultModel);
  }

  for (const [key, value] of Object.entries(process.env)) {
    if (!value) continue;
    if (key === MODEL_ENV_PREFIX) continue;
    if (!key.startsWith(`${MODEL_ENV_PREFIX}_`)) continue;

    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    models.push(trimmed);
    seen.add(trimmed);
  }

  if (models.length === 0) {
    throw new Error('No OpenAI models are configured. Please set at least OPENAI_MODEL in your environment.');
  }

  return {
    models,
    defaultModel: defaultModel ?? models[0],
  };
}


