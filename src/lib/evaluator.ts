import { prisma } from "@/lib/prisma";
import { downloadFile } from "@/lib/storage";
import { resolveWorkspaceModelConfig } from "@/lib/modelConfig";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  computeTotalScore,
  normalizeGeminiJSON,
  type MaybeGeminiJSON,
} from "@/lib/evaluatorNormalize";

export type { DimensionEval, NormalizedEval, MaybeGeminiJSON } from "@/lib/evaluatorNormalize";
export { normalizeGeminiJSON, computeTotalScore } from "@/lib/evaluatorNormalize";

export async function evaluateRunFromLogfile(runId: string) {
  const run = await prisma.agentRun.findUnique({
    where: { id: runId },
    include: { logfiles: true, project: true, testSuite: true },
  });

  if (!run) throw new Error("Run not found");
  if (!run.logfiles.length) throw new Error("No logfile attached to this run");

  const logfile = run.logfiles[0];

  let logfileBuffer: Buffer;
  try {
    logfileBuffer = await downloadFile(logfile.storageKey);
  } catch (err) {
    throw new Error(
      "Failed to download logfile from storage: " +
        (err instanceof Error ? err.message : String(err))
    );
  }

  const logfileText = logfileBuffer.toString("utf-8");
  const modelConfig = await resolveWorkspaceModelConfig(run.project.workspaceId);
  const geminiApiKey = process.env.GOOGLE_GEMINI_API;

  if (!geminiApiKey) {
    throw new Error("Missing GOOGLE_GEMINI_API environment variable");
  }

  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({
    model: modelConfig.evaluatorModel,
  });

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
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
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
