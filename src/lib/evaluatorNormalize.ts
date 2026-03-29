export type DimensionEval = {
  score: number;
  strengths?: string;
  weaknesses?: string;
  summary?: string;
};

export type NormalizedEval = {
  overallComment: string;
  dimensions: Record<string, DimensionEval>;
};

export type MaybeGeminiJSON =
  | {
      overallComment?: unknown;
      overall_comment?: unknown;
      dimensions?: unknown;
    }
  | null;

export function normalizeGeminiJSON(input: MaybeGeminiJSON): NormalizedEval {
  if (!input || typeof input !== "object")
    return {
      overallComment: "Malformed evaluation JSON.",
      dimensions: {},
    };

  const overallComment =
    (typeof input.overallComment === "string"
      ? input.overallComment
      : typeof input.overall_comment === "string"
        ? input.overall_comment
        : "No overall comment provided.") || "";

  const rawDimensions = input.dimensions;

  if (Array.isArray(rawDimensions)) {
    const obj: Record<string, DimensionEval> = {};

    rawDimensions.forEach((d) => {
      if (
        d &&
        typeof d === "object" &&
        "name" in d &&
        typeof (d as { name: unknown }).name === "string"
      ) {
        const key = (d as { name: string }).name;
        obj[key] = {
          score: Number((d as { score?: unknown }).score ?? 0),
          strengths: (d as { strengths?: string }).strengths,
          weaknesses: (d as { weaknesses?: string }).weaknesses,
          summary: (d as { summary?: string }).summary,
        };
      }
    });

    return { overallComment, dimensions: obj };
  }

  if (rawDimensions && typeof rawDimensions === "object") {
    const dimsObj = rawDimensions as Record<string, unknown>;
    const dimsTyped: Record<string, DimensionEval> = {};

    for (const [k, v] of Object.entries(dimsObj)) {
      if (v && typeof v === "object") {
        const val = v as Record<string, unknown>;
        dimsTyped[k] = {
          score: Number(val.score ?? 0),
          strengths: typeof val.strengths === "string" ? val.strengths : undefined,
          weaknesses:
            typeof val.weaknesses === "string" ? val.weaknesses : undefined,
          summary: typeof val.summary === "string" ? val.summary : undefined,
        };
      }
    }

    return { overallComment, dimensions: dimsTyped };
  }

  return {
    overallComment,
    dimensions: {},
  };
}

export function computeTotalScore(ev: NormalizedEval): number {
  const scores = Object.values(ev.dimensions)
    .map((d) => d.score)
    .filter((s): s is number => typeof s === "number");

  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
}
