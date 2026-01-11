import { prisma } from "@/lib/prisma";
import { supabaseServerClient } from "@/lib/supabase";
import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API!;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
});

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

type GeminiRawJSON = Record<string, unknown>;

type MaybeGeminiJSON =
  | {
      overallComment?: unknown;
      overall_comment?: unknown;
      dimensions?: unknown;
    }
  | null;


export async function evaluateRunFromLogfile(runId: string) {
  const run = await prisma.agentRun.findUnique({
    where: { id: runId },
    include: { logfiles: true, project: true, testSuite: true },
  });

  if (!run) throw new Error("Run not found");
  if (!run.logfiles.length) throw new Error("No logfile attached to this run");

  const logfile = run.logfiles[0];

  const { data, error } = await supabaseServerClient.storage
    .from("agent-logs")
    .download(logfile.storageKey);

  if (error) {
    throw new Error(
      "Failed to download logfile from storage: " + error.message
    );
  }

  const logfileText = await data.text();

  const summary = {
    toolCalls: (logfileText.match(/\[TOOL_CALL]/g) || []).length,
    errors: (logfileText.match(/\[ERROR]/g) || []).length,
    length: logfileText.length,
  };

  const trimmed =
    logfileText.length > 20000
      ? logfileText.slice(0, 20000) + "\n\n[TRUNCATED]"
      : logfileText;

  const prompt = `
You are an expert evaluator of autonomous tool-using agents.

Return STRICT JSON using the following structure:

{
  "overallComment": "string",
  "dimensions": {
    "correctness_and_task_compliance": { "score": 0-100, "strengths": "...", "weaknesses": "..." },
    "resilience_and_error_handling": { "score": 0-100, "strengths": "...", "weaknesses": "..." },
    "efficiency": { "score": 0-100, "strengths": "...", "weaknesses": "..." },
    "logical_coherence_and_reasoning": { "score": 0-100, "strengths": "...", "weaknesses": "..." },
    "robustness_to_constraints": { "score": 0-100, "strengths": "...", "weaknesses": "..." },
    "output_quality": { "score": 0-100, "strengths": "...", "weaknesses": "..." },
    "logging_and_metadata_reliability": { "score": 0-100, "strengths": "...", "weaknesses": "..." }
  }
}

Heuristic stats:
${JSON.stringify(summary, null, 2)}

Logfile:
"""
${trimmed}
"""
`;

  let raw: string;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    raw = result.response.text();
  } catch {
    throw new Error("Model call failed");
  }

  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  let parsed: MaybeGeminiJSON;

  try {
    parsed = JSON.parse(cleaned) as GeminiRawJSON;
  } catch {
    parsed = null;
  }

  const normalized = normalizeGeminiJSON(parsed);
  const totalScore = computeTotalScore(normalized);

  const evaluation = await prisma.runEvaluation.create({
    data: {
      runId: run.id,
      projectId: run.projectId,
      testSuiteId: run.testSuiteId,
      status: "COMPLETED",
      totalScore,
      metricBreakdown: normalized,
      summary: normalized.overallComment,
    },
  });

  await prisma.agentRun.update({
    where: { id: run.id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });

  return evaluation;
}

function normalizeGeminiJSON(input: MaybeGeminiJSON): NormalizedEval {
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

function computeTotalScore(ev: NormalizedEval): number {
  const scores = Object.values(ev.dimensions)
    .map((d) => d.score)
    .filter((s): s is number => typeof s === "number");

  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
}
