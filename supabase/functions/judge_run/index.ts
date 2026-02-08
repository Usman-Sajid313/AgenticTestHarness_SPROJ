import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.0";
import { Pool } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const RUBRIC_VERSION = "1.0.0";
const CONFIDENCE_THRESHOLD = 0.7;
const SCORE_DISAGREEMENT_THRESHOLD = 15;


/** Free plan limits (RPM = requests per minute). Min delay between requests = 60000 / RPM ms. */
const FREE_PLAN_RPM = 30; // most free-plan models are RPM 30; we space requests to stay under
const MIN_DELAY_MS = Math.ceil(60000 / FREE_PLAN_RPM); // 2000ms for 30 RPM

const RATE_LIMIT_CONFIG = {
  groqEvaluator: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 15000,
    backoffMultiplier: 2,
    minDelayBetweenRequests: MIN_DELAY_MS,
    requestTimeoutMs: 30000,
  },
  groqVerifier: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 15000,
    backoffMultiplier: 2,
    minDelayBetweenRequests: MIN_DELAY_MS,
    requestTimeoutMs: 30000,
  },
};

/** Primary evaluator (used as main/reference). Free plan: RPM 30, RPD 1K, TPM 12K, TPD 100K */
const GROQ_MODEL_PRIMARY = "llama-3.3-70b-versatile";
/** Verifier model. Free plan: RPM 30, RPD 14.4K, TPM 6K, TPD 500K */
const GROQ_MODEL_VERIFIER = "llama-3.1-8b-instant";

/**
 * Panel of models from the free plan only. Limits from Free Plan table:
 * - llama-3.3-70b-versatile: RPM 30, RPD 1K, TPM 12K, TPD 100K
 * - llama-3.1-8b-instant: RPM 30, RPD 14.4K, TPM 6K, TPD 500K
 * - groq/compound-mini: RPM 30, RPD 250, TPM 70K
 * - groq/compound: RPM 30, RPD 250, TPM 70K
 * - meta-llama/llama-4-scout-17b-16e-instruct: RPM 30, RPD 1K, TPM 30K, TPD 500K
 * - qwen/qwen3-32b: RPM 60, RPD 1K, TPM 6K, TPD 500K
 */
const GROQ_PANEL_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "groq/compound-mini",
  "groq/compound",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "qwen/qwen3-32b",
];

/** Per-model last request time for free-plan RPM adherence */
const lastRequestByModel = new Map<string, number>();
let lastGroqVerifierRequest = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateBackoffDelay(attempt: number, config: typeof RATE_LIMIT_CONFIG.groqEvaluator): number {
  const delay = Math.min(
    config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt),
    config.maxDelayMs
  );
  const jitter = delay * 0.2 * Math.random();
  return Math.floor(delay + jitter);
}

function isRateLimitError(error: unknown): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return (
    errorMessage.includes("429") ||
    errorMessage.includes("rate limit") ||
    errorMessage.includes("quota") ||
    errorMessage.includes("too many requests") ||
    errorMessage.includes("rate_limit_exceeded")
  );
}

function extractRetryAfter(error: unknown): number | null {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const match = errorMessage.match(/retry in ([\d.]+)s/i) || errorMessage.match(/retry-after[:\s]+(\d+)/i);
  if (match) {
    return Math.ceil(parseFloat(match[1]) * 1000);
  }
  return null;
}

async function ensureRateLimit(provider: "groqEvaluator" | "groqVerifier", modelId?: string): Promise<void> {
  const config = RATE_LIMIT_CONFIG[provider];
  const lastRequest = provider === "groqVerifier"
    ? lastGroqVerifierRequest
    : (modelId ? lastRequestByModel.get(modelId) ?? 0 : 0);
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequest;

  if (timeSinceLastRequest < config.minDelayBetweenRequests) {
    const waitTime = config.minDelayBetweenRequests - timeSinceLastRequest;
    await sleep(waitTime);
  }

  if (provider === "groqVerifier") {
    lastGroqVerifierRequest = Date.now();
  } else if (modelId) {
    lastRequestByModel.set(modelId, Date.now());
  }
}

interface DenoRequest {
  runId: string;
}

interface JudgePacket {
  meta: {
    logQuality: {
      totalEvents: number;
      totalSteps: number;
      format: string;
      encoding: string;
      parserVersion: string;
    };
  };
  task: {
    text: string;
    confidence: number;
    sourceEventIds: string[];
  };
  traceSummary: {
    steps: Array<{
      stepNumber: number;
      description: string;
      keyEventIds: string[];
      timestamp?: string;
    }>;
  };
  toolInteractions: Array<{
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
    argsRaw?: string;
    result?: unknown;
    resultSummary?: string;
    status: string;
    eventIds: string[];
    timestamp?: string;
  }>;
  errors: Array<{
    message: string;
    eventIds: string[];
    timestamp?: string;
  }>;
  metrics: {
    totalToolCalls: number;
    totalErrors: number;
    totalRetries: number;
    totalDurationMs?: number;
  };
  ruleFlags: Array<{
    flagType: string;
    severity: string;
    message: string;
    evidenceEventIds: string[];
  }>;
  redactionReport: {
    patternsMatched: string[];
    redactedCount: number;
  };
  trace?: Array<{ id: string; type: string; data: Record<string, unknown>; timestamp?: string }>;
  retries?: Array<{ attempt: number; eventIds: string[]; timestamp?: string }>;
  finalOutput?: { text: string; eventIds: string[] };
}

interface Scorecard {
  overallScore: number;
  confidence: number;
  dimensions: Record<string, {
    score: number;
    reasoning: string;
    evidenceEventIds: string[];
    strengths?: string[];
    weaknesses?: string[];
  }>;
  strengths: string[];
  weaknesses: string[];
  missingData?: string[];
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        },
      });
    }

    let requestBody;
    try {
      requestBody = await req.json();
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { runId }: DenoRequest = requestBody;

    if (!runId) {
      return new Response(
        JSON.stringify({ error: "runId is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("PROJECT_URL");
    const supabaseServiceKey = Deno.env.get("SERVICE_ROLE_KEY");
    const dbUrl = Deno.env.get("DATABASE_URL");

    if (!supabaseUrl || !supabaseServiceKey || !dbUrl) {
      return new Response(
        JSON.stringify({
          error: "Missing environment variables",
          missing: {
            PROJECT_URL: !supabaseUrl,
            SERVICE_ROLE_KEY: !supabaseServiceKey,
            DATABASE_URL: !dbUrl,
          },
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    let pool: Pool;
    try {
      pool = new Pool(dbUrl, 1, true);
    } catch (e) {
      return new Response(
        JSON.stringify({
          error: "Failed to create database connection",
          details: e instanceof Error ? e.message : String(e),
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const dbQuery = async <T>(query: string, params?: unknown[]): Promise<T[]> => {
      const client = await pool.connect();
      try {
        const result = await client.queryObject<T>(query, params);
        return result.rows;
      } finally {
        client.release();
      }
    };

    const dbExecute = async (query: string, params?: unknown[]): Promise<void> => {
      const client = await pool.connect();
      try {
        await client.queryObject(query, params);
      } finally {
        client.release();
      }
    };

    console.log("[judge_run] Starting for runId=", runId);

    try {
      const runs = await dbQuery<{
        id: string;
        projectId: string;
        testSuiteId: string | null;
        rubricId: string | null;
        status: string;
      }>(
        'SELECT id, "projectId", "testSuiteId", "rubricId", status FROM "AgentRun" WHERE id = $1',
        [runId]
      );

      if (runs.length === 0) {
        return new Response(
          JSON.stringify({ error: "Run not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      const run = runs[0];

      // Fetch rubric if this run has one
      let rubric: any = null;
      let rubricId = run.rubricId;

      // If no direct rubric, check if test suite has one
      if (!rubricId && run.testSuiteId) {
        const testSuites = await dbQuery<{
          rubricId: string | null;
        }>(
          'SELECT "rubricId" FROM "TestSuite" WHERE id = $1',
          [run.testSuiteId]
        );
        if (testSuites.length > 0) {
          rubricId = testSuites[0].rubricId;
        }
      }

      // Fetch the rubric data if we have a rubric ID
      if (rubricId) {
        const rubrics = await dbQuery<{
          id: string;
          name: string;
          dimensions: string;
        }>(
          'SELECT id, name, dimensions FROM "EvaluationRubric" WHERE id = $1',
          [rubricId]
        );
        if (rubrics.length > 0) {
          rubric = {
            ...rubrics[0],
            dimensions: JSON.parse(rubrics[0].dimensions),
          };
        }
      }

      if (run.status !== "READY_FOR_JUDGING" && run.status !== "JUDGING") {
        return new Response(
          JSON.stringify({ error: `Run is not ready for judging (current: ${run.status})` }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const packets = await dbQuery<{
        id: string;
        runId: string;
        packet: string;
        packetSizeBytes: number;
        parserVersion: string;
      }>(
        'SELECT id, "runId", packet, "packetSizeBytes", "parserVersion" FROM "RunJudgePacket" WHERE "runId" = $1',
        [runId]
      );

      if (packets.length === 0) {
        return new Response(
          JSON.stringify({ error: "Judge packet not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      const judgePacketData = packets[0];
      console.log("[judge_run] Packet loaded: size=", judgePacketData.packetSizeBytes, "bytes, parserVersion=", judgePacketData.parserVersion);

      let judgePacket: JudgePacket;
      try {
        judgePacket = JSON.parse(judgePacketData.packet) as JudgePacket;
      } catch (parseErr) {
        console.error("[judge_run] Invalid judge packet JSON:", parseErr);
        await dbExecute('UPDATE "AgentRun" SET status = $1 WHERE id = $2', ["FAILED", runId]);
        return new Response(
          JSON.stringify({
            error: "Invalid judge packet",
            details: "Stored packet is not valid JSON. Re-parse the run to regenerate the packet.",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Normalize packet shape so parser output from any adapter is safe to use
      if (!judgePacket.task || typeof judgePacket.task !== "object") {
        judgePacket.task = { text: "Task not found", confidence: 0, sourceEventIds: [] };
      }
      if (!judgePacket.meta?.logQuality) {
        judgePacket.meta = {
          logQuality: {
            totalEvents: 0,
            totalSteps: 0,
            format: "unknown",
            encoding: "utf-8",
            parserVersion: "",
          },
        };
      }
      if (!judgePacket.metrics || typeof judgePacket.metrics !== "object") {
        judgePacket.metrics = { totalToolCalls: 0, totalErrors: 0, totalRetries: 0 };
      }
      if (!Array.isArray(judgePacket.ruleFlags)) {
        judgePacket.ruleFlags = [];
      }
      if (!Array.isArray(judgePacket.toolInteractions)) {
        judgePacket.toolInteractions = [];
      }
      if (!judgePacket.traceSummary?.steps) {
        judgePacket.traceSummary = { steps: [] };
      }
      if (!Array.isArray(judgePacket.errors)) {
        judgePacket.errors = [];
      }
      if (!judgePacket.redactionReport || typeof judgePacket.redactionReport !== "object") {
        judgePacket.redactionReport = { patternsMatched: [], redactedCount: 0 };
      }
      if (!Array.isArray(judgePacket.retries)) {
        judgePacket.retries = [];
      }
      if (!judgePacket.finalOutput || typeof judgePacket.finalOutput !== "object") {
        judgePacket.finalOutput = undefined;
      }
      if (!Array.isArray(judgePacket.trace)) {
        judgePacket.trace = [];
      }

      const packetSummary = {
        totalEvents: judgePacket.meta?.logQuality?.totalEvents ?? 0,
        totalSteps: judgePacket.meta?.logQuality?.totalSteps ?? 0,
        traceLength: judgePacket.trace?.length ?? 0,
        toolInteractions: judgePacket.toolInteractions?.length ?? 0,
        errors: judgePacket.errors?.length ?? 0,
        taskText: judgePacket.task?.text?.slice(0, 80) + (judgePacket.task?.text && judgePacket.task.text.length > 80 ? "..." : ""),
      };
      console.log("[judge_run] Judge packet summary:", JSON.stringify(packetSummary));

      if (run.status !== "JUDGING") {
        await dbExecute('UPDATE "AgentRun" SET status = $1 WHERE id = $2', ["JUDGING", runId]);
      }

      const groqApiKey = Deno.env.get("GROQ_API_KEY");
      if (!groqApiKey) {
        await dbExecute('UPDATE "AgentRun" SET status = $1 WHERE id = $2', ["FAILED", runId]);
        return new Response(
          JSON.stringify({
            error: "Missing GROQ_API_KEY environment variable",
            details: "Groq API key is required for judging",
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      // Run multi-model panel (all free GROQ models)
      const packetSizeForPrompt = new TextEncoder().encode(JSON.stringify(judgePacket)).length;
      console.log("[judge_run] Running panel: models=", GROQ_PANEL_MODELS.length, "packetSize=", packetSizeForPrompt, "bytes");

      let panelResults: Array<{ model: string; scorecard: Scorecard }>;
      try {
        panelResults = await runPanelEvaluators(judgePacket, groqApiKey, rubric);
        console.log("[judge_run] Panel complete: succeeded=", panelResults.length, "/", GROQ_PANEL_MODELS.length);
      } catch (panelError) {
        const errorMessage = panelError instanceof Error ? panelError.message : String(panelError);
        console.error("[judge_run] Panel failed:", errorMessage);
        if (errorMessage.includes("quota") || errorMessage.includes("429") || errorMessage.includes("billing") || errorMessage.includes("rate limit exceeded")) {
          await dbExecute('UPDATE "AgentRun" SET status = $1 WHERE id = $2', ["FAILED", runId]);
          return new Response(
            JSON.stringify({
              error: "Groq API quota/rate limit exceeded",
              details: "All retry attempts exhausted. Your Groq API quota has been exceeded. Please check your billing or wait for the quota to reset.",
              retryAfter: extractRetryAfter(panelError),
            }),
            { status: 429, headers: { "Content-Type": "application/json" } }
          );
        }
        throw panelError;
      }

      if (panelResults.length === 0) {
        console.error("[judge_run] All panel models failed: count=", GROQ_PANEL_MODELS.length);
        await dbExecute('UPDATE "AgentRun" SET status = $1 WHERE id = $2', ["FAILED", runId]);
        return new Response(
          JSON.stringify({
            error: "All panel evaluators failed",
            details: "No GROQ model returned a valid scorecard. Please try again or check API availability.",
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      console.log("[judge_run] Primary model:", panelResults[0]!.model, "score=", panelResults[0]!.scorecard.overallScore);

      // Optional verifier (checks primary evaluator for consistency)
      const primaryScorecard = panelResults[0]!.scorecard;
      let groqVerifierJudgement: Scorecard | null = null;
      try {
        await sleep(500);
        const verifierPromise = callGroqVerifier(judgePacket, primaryScorecard, groqApiKey, rubric);
        const verifierTimeout = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Groq verifier call timeout")), 25000);
        });
        groqVerifierJudgement = await Promise.race([verifierPromise, verifierTimeout]);
      } catch (verifierError) {
        console.warn("[judge_run] Verifier failed, continuing without verification:", verifierError);
        groqVerifierJudgement = null;
      }

      const finalScorecard = adjudicateMulti(panelResults, groqVerifierJudgement, judgePacket);
      console.log("[judge_run] Adjudication complete: finalScore=", finalScorecard.overallScore);
      const confidence = computeConfidenceMulti(panelResults, groqVerifierJudgement, finalScorecard);

      const evaluations = await dbQuery<{
        id: string;
        runId: string;
      }>(
        'SELECT id, "runId" FROM "RunEvaluation" WHERE "runId" = $1',
        [runId]
      );

      const summary = finalScorecard.strengths.join("; ") + " | " + finalScorecard.weaknesses.join("; ");
      const primaryGroqJudgement = panelResults[0]!.scorecard;
      const multiModelPayload = {
        panel: panelResults.map((r) => ({ model: r.model, scorecard: r.scorecard })),
        verifier: groqVerifierJudgement ?? null,
      };

      if (evaluations.length > 0) {
        await dbExecute(
          `UPDATE "RunEvaluation" SET
            "geminiJudgement" = $1,
            "groqJudgement" = $2,
            "finalScorecard" = $3,
            confidence = $4,
            "totalScore" = $5,
            status = $6,
            summary = $7,
            "updatedAt" = NOW()
           WHERE id = $8`,
          [
            JSON.stringify(multiModelPayload),
            JSON.stringify(primaryGroqJudgement),
            JSON.stringify(finalScorecard),
            confidence,
            finalScorecard.overallScore,
            "COMPLETED",
            summary,
            evaluations[0].id,
          ]
        );
      } else {
        await dbExecute(
          `INSERT INTO "RunEvaluation" (id, "runId", "projectId", "testSuiteId", "geminiJudgement", "groqJudgement", "finalScorecard", confidence, "totalScore", status, summary, "createdAt", "updatedAt")
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
          [
            runId,
            run.projectId,
            run.testSuiteId,
            JSON.stringify(multiModelPayload),
            JSON.stringify(primaryGroqJudgement),
            JSON.stringify(finalScorecard),
            confidence,
            finalScorecard.overallScore,
            "COMPLETED",
            summary,
          ]
        );
      }

      const finalStatus = confidence >= CONFIDENCE_THRESHOLD ? "COMPLETED" : "COMPLETED_LOW_CONFIDENCE";
      await dbExecute(
        'UPDATE "AgentRun" SET status = $1, "completedAt" = NOW() WHERE id = $2',
        [finalStatus, runId]
      );

      console.log("[judge_run] Success: runId=", runId, "status=", finalStatus, "score=", finalScorecard.overallScore);

      return new Response(
        JSON.stringify({
          success: true,
          runId,
          status: finalStatus,
          score: finalScorecard.overallScore,
          confidence,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    } catch (dbError) {
      console.error("[judge_run] Database error:", dbError);
      try {
        await dbExecute('UPDATE "AgentRun" SET status = $1 WHERE id = $2', ["FAILED", runId]);
      } catch {
      }
      await pool.end();
      return new Response(
        JSON.stringify({
          error: "Database operation failed",
          details: dbError instanceof Error ? dbError.message : String(dbError),
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    await pool.end();
  } catch (error) {
    console.error("[judge_run] Judge error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (errorMessage.includes("timeout") || errorMessage.includes("WORKER_LIMIT")) {
      return new Response(
        JSON.stringify({
          error: "Function timeout",
          details: "The judging function exceeded the maximum execution time. This may be due to API rate limits or network issues. Please try again later.",
          suggestion: "Consider reducing the size of the judge packet or waiting before retrying.",
        }),
        { status: 504, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        error: errorMessage,
        details: error instanceof Error ? error.stack : String(error),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

/**
 * Call a single GROQ model with the evaluator prompt.
 * Used for both primary evaluator and panel models.
 */
async function callGroqEvaluatorWithModel(
  judgePacket: JudgePacket,
  apiKey: string,
  modelId: string,
  rubric?: any
): Promise<Scorecard> {
  const prompt = buildGroqEvaluatorPrompt(judgePacket, rubric);
  const config = RATE_LIMIT_CONFIG.groqEvaluator;

  let lastError: unknown = null;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      await ensureRateLimit("groqEvaluator", modelId);

      const requestBody: {
        model: string;
        messages: Array<{ role: string; content: string }>;
        temperature: number;
        response_format?: { type: string };
      } = {
        model: modelId,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      };

      console.log(`Calling Groq evaluator with model: ${modelId}`);

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        let errorDetails = `${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorDetails = errorData.error?.message || errorData.message || JSON.stringify(errorData);
        } catch {
        }

        if (response.status === 429) {
          const retryAfter = response.headers.get("retry-after");
          const rawDelay = retryAfter ? parseInt(retryAfter, 10) * 1000 : calculateBackoffDelay(attempt, config);
          const delay = Math.min(rawDelay, config.maxDelayMs);

          if (attempt < config.maxRetries - 1) {
            console.log(`Groq evaluator rate limit hit, retrying after ${delay}ms (capped from ${rawDelay}ms)...`);
            await sleep(delay);
            continue;
          } else {
            throw new Error(
              `Groq API rate limit exceeded after ${config.maxRetries} attempts. ` +
              `Details: ${errorDetails}`
            );
          }
        }

        if (response.status === 400) {
          throw new Error(`Groq API error (400 Bad Request): ${errorDetails}`);
        }

        throw new Error(`Groq API error: ${errorDetails}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("Groq API returned empty response");
      }

      const cleaned = content
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```$/i, "")
        .trim();

      const parsed = JSON.parse(cleaned);
      return validateAndNormalizeScorecard(parsed);
    } catch (error) {
      lastError = error;
      console.error(`Groq evaluator call failed (attempt ${attempt + 1}/${config.maxRetries}):`, error);

      if (isRateLimitError(error) || (error instanceof Error && error.message.includes("429"))) {
        const retryAfter = extractRetryAfter(error);
        const rawDelay = retryAfter || calculateBackoffDelay(attempt, config);
        const delay = Math.min(rawDelay, config.maxDelayMs);

        if (attempt < config.maxRetries - 1) {
          console.log(`Rate limit hit, retrying after ${delay}ms (capped from ${rawDelay}ms)...`);
          await sleep(delay);
          continue;
        } else {
          throw new Error(
            `Groq API rate limit exceeded after ${config.maxRetries} attempts. ` +
            `Please wait before retrying. Original error: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      if (attempt < config.maxRetries - 1) {
        const delay = calculateBackoffDelay(attempt, config);
        console.log(`Retrying after ${delay}ms due to error...`);
        await sleep(delay);
        continue;
      }

      throw new Error(
        `Groq evaluator failed after ${config.maxRetries} attempts: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  throw new Error(
    `Groq evaluator failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

/** Primary evaluator call (backward-compatible). */
async function callGroqEvaluator(
  judgePacket: JudgePacket,
  apiKey: string,
  rubric?: any
): Promise<Scorecard> {
  return callGroqEvaluatorWithModel(judgePacket, apiKey, GROQ_MODEL_PRIMARY, rubric);
}

/**
 * Run the full panel of models and return successful scorecards with model id.
 * Uses only free-plan models; spacing respects RPM (30/min for most).
 * Failed models are skipped.
 */
async function runPanelEvaluators(
  judgePacket: JudgePacket,
  apiKey: string,
  rubric?: any
): Promise<Array<{ model: string; scorecard: Scorecard }>> {
  const results: Array<{ model: string; scorecard: Scorecard }> = [];

  for (const modelId of GROQ_PANEL_MODELS) {
    try {
      await sleep(MIN_DELAY_MS);
      const scorecard = await callGroqEvaluatorWithModel(judgePacket, apiKey, modelId, rubric);
      results.push({ model: modelId, scorecard });
      console.log("[judge_run] Panel:", modelId, "succeeded");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[judge_run] Panel:", modelId, "failed:", msg);
    }
  }

  return results;
}

async function callGroqVerifier(
  judgePacket: JudgePacket,
  evaluatorScorecard: Scorecard,
  apiKey: string,
  rubric?: any
): Promise<Scorecard> {
  const prompt = buildGroqVerifierPrompt(judgePacket, evaluatorScorecard, rubric);
  const config = RATE_LIMIT_CONFIG.groqVerifier;

  let lastError: unknown = null;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      await ensureRateLimit("groqVerifier");

      const requestBody: {
        model: string;
        messages: Array<{ role: string; content: string }>;
        temperature: number;
        response_format?: { type: string };
      } = {
        model: GROQ_MODEL_VERIFIER,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      };

      console.log(`Calling Groq verifier with model: ${GROQ_MODEL_VERIFIER}`);

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        let errorDetails = `${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorDetails = errorData.error?.message || errorData.message || JSON.stringify(errorData);
        } catch {
        }

        if (response.status === 429) {
          const retryAfter = response.headers.get("retry-after");
          const rawDelay = retryAfter ? parseInt(retryAfter, 10) * 1000 : calculateBackoffDelay(attempt, config);
          const delay = Math.min(rawDelay, config.maxDelayMs);

          if (attempt < config.maxRetries - 1) {
            console.log(`Groq verifier rate limit hit, retrying after ${delay}ms (capped from ${rawDelay}ms)...`);
            await sleep(delay);
            continue;
          } else {
            throw new Error(
              `Groq API rate limit exceeded after ${config.maxRetries} attempts. ` +
              `Details: ${errorDetails}`
            );
          }
        }

        if (response.status === 400) {
          throw new Error(`Groq API error (400 Bad Request): ${errorDetails}`);
        }

        throw new Error(`Groq API error: ${errorDetails}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("Groq API returned empty response");
      }

      const cleaned = content
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```$/i, "")
        .trim();

      const parsed = JSON.parse(cleaned);
      return validateAndNormalizeScorecard(parsed);
    } catch (error) {
      lastError = error;
      console.error(`Groq verifier call failed (attempt ${attempt + 1}/${config.maxRetries}):`, error);

      if (isRateLimitError(error) || (error instanceof Error && error.message.includes("429"))) {
        const retryAfter = extractRetryAfter(error);
        const rawDelay = retryAfter || calculateBackoffDelay(attempt, config);
        const delay = Math.min(rawDelay, config.maxDelayMs);

        if (attempt < config.maxRetries - 1) {
          console.log(`Rate limit hit, retrying after ${delay}ms (capped from ${rawDelay}ms)...`);
          await sleep(delay);
          continue;
        } else {
          throw new Error(
            `Groq API rate limit exceeded after ${config.maxRetries} attempts. ` +
            `Please wait before retrying. Original error: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      if (attempt < config.maxRetries - 1) {
        const delay = calculateBackoffDelay(attempt, config);
        console.log(`Retrying after ${delay}ms due to error...`);
        await sleep(delay);
        continue;
      }

      throw new Error(
        `Groq verifier failed after ${config.maxRetries} attempts: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  throw new Error(
    `Groq verifier failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

function buildRubricSection(rubric?: any): string {
  if (!rubric || !rubric.dimensions || !Array.isArray(rubric.dimensions)) {
    // Use default rubric
    return `## SCORING RUBRIC

### 1. Correctness and Task Compliance (0-100)
**Evaluate:**
- Did the agent complete the intended task?
- Were tool calls used correctly for the task?
- Is the final output correct and complete?
- Were there any fundamental misunderstandings?

**Scoring Guide:**
- 90-100: Task completed perfectly, output is correct and complete
- 70-89: Task mostly completed with minor issues
- 50-69: Task partially completed or significant errors
- 30-49: Task attempted but major failures
- 0-29: Task not completed or completely wrong approach

### 2. Resilience and Error Handling (0-100)
**Evaluate:**
- How did the agent handle errors and failures?
- Did it retry appropriately or give up too quickly?
- Were errors recovered from gracefully?
- Did the agent learn from mistakes?

**Scoring Guide:**
- 90-100: Excellent error recovery, appropriate retries, learned from mistakes
- 70-89: Good error handling with minor issues
- 50-69: Some error handling but gave up on some failures
- 30-49: Poor error handling, many failures not recovered
- 0-29: No error handling, agent failed on first error

### 3. Efficiency (0-100)
**Evaluate:**
- Were tool calls necessary and well-chosen?
- Did the agent take unnecessary steps?
- Was the path to solution optimal?
- Could fewer steps have achieved the same result?

**Scoring Guide:**
- 90-100: Highly efficient, optimal path, minimal unnecessary steps
- 70-89: Efficient with minor inefficiencies
- 50-69: Some inefficiency, some unnecessary steps
- 30-49: Inefficient, many unnecessary tool calls
- 0-29: Very inefficient, many redundant or wasteful steps

### 4. Logical Coherence and Reasoning (0-100)
**Evaluate:**
- Was the agent's reasoning logical and coherent?
- Did steps follow a clear plan or seem random?
- Were tool calls sequenced appropriately?
- Did the agent show understanding of intermediate results?

**Scoring Guide:**
- 90-100: Excellent reasoning, clear logical flow, well-planned
- 70-89: Good reasoning with minor gaps
- 50-69: Some logical issues, unclear planning
- 30-49: Poor reasoning, steps seem disconnected
- 0-29: No clear reasoning, random or illogical steps

### 5. Robustness to Constraints (0-100)
**Evaluate:**
- Did the agent handle edge cases and constraints?
- Were tool arguments validated before use?
- Did it handle missing or unexpected data?
- Were there rule violations (see ruleFlags)?

**Scoring Guide:**
- 90-100: Handled all constraints well, no violations
- 70-89: Mostly robust with minor constraint issues
- 50-69: Some constraint handling but missed some cases
- 30-49: Poor constraint handling, several violations
- 0-29: No constraint handling, many rule violations

### 6. Output Quality (0-100)
**Evaluate:**
- Is the final output well-formed and useful?
- Does it meet the task requirements?
- Is it complete and properly formatted?
- Would a human find it satisfactory?

**Scoring Guide:**
- 90-100: Excellent output, complete and well-formed
- 70-89: Good output with minor issues
- 50-69: Acceptable output but incomplete or has issues
- 30-49: Poor output, missing key elements
- 0-29: Very poor or no useful output`;
  }

  // Use custom rubric
  let rubricText = `## SCORING RUBRIC\n\n**Rubric:** ${rubric.name || "Custom Evaluation"}\n`;

  rubric.dimensions.forEach((dim: any, idx: number) => {
    const weight = ((dim.weight || 0) * 100).toFixed(0);
    rubricText += `\n### ${idx + 1}. ${dim.name} (0-100, weight: ${weight}%)\n`;
    rubricText += `**Evaluate:** ${dim.description}\n\n`;

    if (dim.scoringCriteria && Array.isArray(dim.scoringCriteria)) {
      rubricText += `**Scoring Guide:**\n`;
      dim.scoringCriteria.forEach((criteria: any) => {
        const range = criteria.scoreRange || [0, 10];
        const scaledRange = `${range[0] * 10}-${range[1] * 10}`;
        rubricText += `- ${scaledRange}: ${criteria.label} - ${criteria.description}\n`;
      });
    }
  });

  return rubricText;
}

function buildDimensionsSchema(rubric?: any): string {
  if (!rubric || !rubric.dimensions || !Array.isArray(rubric.dimensions)) {
    // Default dimensions
    return `    "correctness_and_task_compliance": {
      "score": number (0-100),
      "reasoning": string (3-5 sentences with specific examples and evidenceEventIds),
      "evidenceEventIds": string[] (specific event IDs that support this score),
      "strengths": string[] (1-3 specific strengths for THIS dimension),
      "weaknesses": string[] (1-3 specific weaknesses for THIS dimension)
    },
    "resilience_and_error_handling": {
      "score": number (0-100),
      "reasoning": string (3-5 sentences with specific examples),
      "evidenceEventIds": string[],
      "strengths": string[] (1-3 specific strengths for THIS dimension),
      "weaknesses": string[] (1-3 specific weaknesses for THIS dimension)
    },
    "efficiency": {
      "score": number (0-100),
      "reasoning": string (3-5 sentences with specific examples),
      "evidenceEventIds": string[],
      "strengths": string[] (1-3 specific strengths for THIS dimension),
      "weaknesses": string[] (1-3 specific weaknesses for THIS dimension)
    },
    "logical_coherence_and_reasoning": {
      "score": number (0-100),
      "reasoning": string (3-5 sentences with specific examples),
      "evidenceEventIds": string[],
      "strengths": string[] (1-3 specific strengths for THIS dimension),
      "weaknesses": string[] (1-3 specific weaknesses for THIS dimension)
    },
    "robustness_to_constraints": {
      "score": number (0-100),
      "reasoning": string (3-5 sentences with specific examples),
      "evidenceEventIds": string[],
      "strengths": string[] (1-3 specific strengths for THIS dimension),
      "weaknesses": string[] (1-3 specific weaknesses for THIS dimension)
    },
    "output_quality": {
      "score": number (0-100),
      "reasoning": string (3-5 sentences with specific examples),
      "evidenceEventIds": string[],
      "strengths": string[] (1-3 specific strengths for THIS dimension),
      "weaknesses": string[] (1-3 specific weaknesses for THIS dimension)
    }`;
  }

  // Custom dimensions
  return rubric.dimensions.map((dim: any, idx: number) => {
    const key = dim.name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const isLast = idx === rubric.dimensions.length - 1;
    return `    "${key}": {
      "score": number (0-100),
      "reasoning": string (3-5 sentences with specific examples and evidenceEventIds),
      "evidenceEventIds": string[] (specific event IDs that support this score),
      "strengths": string[] (1-3 specific strengths for THIS dimension),
      "weaknesses": string[] (1-3 specific weaknesses for THIS dimension)
    }${isLast ? "" : ","}`;
  }).join("\n");
}

function buildGroqEvaluatorPrompt(judgePacket: JudgePacket, rubric?: any): string {
  const taskText = judgePacket.task?.text || "Unknown task";
  const totalSteps = judgePacket.meta?.logQuality?.totalSteps || 0;
  const totalErrors = judgePacket.metrics?.totalErrors || 0;
  const totalRetries = judgePacket.metrics?.totalRetries || 0;
  const totalToolCalls = judgePacket.metrics?.totalToolCalls || 0;
  const ruleFlags = judgePacket.ruleFlags || [];
  const highSeverityFlags = ruleFlags.filter(f => f.severity === "high").length;

  // Build the rubric section dynamically
  const rubricSection = buildRubricSection(rubric);
  const dimensionsSchema = buildDimensionsSchema(rubric);

  return `You are an expert evaluator of autonomous tool-using AI agents. Your job is to provide detailed, actionable feedback that helps improve the agent's performance.

## EVALUATION CONTEXT

**Task Goal:** ${taskText}
**Run Statistics:**
- Total Steps: ${totalSteps}
- Tool Calls: ${totalToolCalls}
- Errors: ${totalErrors}
- Retries: ${totalRetries}
- High-Severity Issues: ${highSeverityFlags}

## EVALUATION INSTRUCTIONS

CRITICAL RULES:
1. Use ONLY information from the judge_packet. Do NOT invent events or results.
2. Every score and claim MUST reference specific evidenceEventIds.
3. Provide detailed, specific reasoning (3-5 sentences per dimension).
4. Give actionable feedback - explain WHAT went wrong/right and WHY.
5. Lower confidence if evidence is missing or incomplete.

${rubricSection}

## JUDGE PACKET DATA

${JSON.stringify(judgePacket, null, 2)}

## OUTPUT FORMAT

Return STRICT JSON matching this exact schema:
{
  "overallScore": number (0-100, weighted average of dimensions),
  "confidence": number (0-1, based on evidence completeness),
  "dimensions": {
${dimensionsSchema}
  },
  "strengths": string[] (3-5 specific, actionable strengths with evidence references),
  "weaknesses": string[] (3-5 specific, actionable weaknesses with improvement suggestions),
  "missingData": string[] (optional, list any missing evidence that would improve evaluation)
}

## QUALITY REQUIREMENTS

- Reasoning must be DETAILED (3-5 sentences minimum per dimension)
- Include SPECIFIC examples from the trace (reference tool names, error messages, step numbers)
- Provide ACTIONABLE feedback (what to improve and how)
- Reference evidenceEventIds for EVERY claim
- **CRITICAL**: Each dimension MUST have its own unique strengths and weaknesses arrays (1-3 items each)
- Dimension strengths/weaknesses should focus ONLY on that specific dimension's performance
- Overall strengths/weaknesses should summarize cross-cutting themes
- Overall score should reflect a weighted average considering task importance`;
}

function buildGroqVerifierPrompt(
  judgePacket: JudgePacket,
  evaluatorScorecard: Scorecard,
  rubric?: any
): string {
  const dimensionsSchema = buildDimensionsSchema(rubric);

  return `You are a verification evaluator and quality assurance reviewer. Your job is to:
1. Verify the primary evaluator's scorecard is accurate and well-supported
2. Check that all evidenceEventIds actually exist in the judge_packet
3. Identify any scoring biases or missed insights
4. Provide your own independent evaluation with potentially different perspectives

## VERIFICATION TASKS

For each dimension in the primary evaluator's scorecard:
1. **Verify Evidence Links**: Check that all evidenceEventIds exist in the judge_packet
2. **Assess Scoring Accuracy**: Is the score appropriate given the evidence?
3. **Check Reasoning Quality**: Is the reasoning detailed and specific enough?
4. **Identify Gaps**: Did the evaluator miss important positive or negative aspects?

## YOUR EVALUATION APPROACH

- Be INDEPENDENT: Don't just copy the primary evaluator's scores
- Be THOROUGH: Look for evidence the primary evaluator might have missed
- Be SPECIFIC: Provide detailed reasoning (3-5 sentences per dimension)
- Be ACTIONABLE: Give concrete feedback that helps improve the agent

## JUDGE PACKET DATA

${JSON.stringify(judgePacket, null, 2)}

## PRIMARY EVALUATOR'S SCORECARD

${JSON.stringify(evaluatorScorecard, null, 2)}

## YOUR TASK

1. Review the primary evaluator's evidenceEventIds - do they all exist in the judge_packet?
2. For each dimension, provide your own independent score and reasoning
3. If you disagree significantly (>15 points), explain why with specific evidence
4. If evidenceEventIds are invalid, adjust scores and note this in reasoning
5. Provide your own strengths/weaknesses list (may differ from primary evaluator)

CRITICAL: Use ONLY information from the judge_packet. Do NOT invent events. If evidence is missing, lower confidence and cite "missing_data".

Return STRICT JSON matching this exact schema:
{
  "overallScore": number (0-100),
  "confidence": number (0-1),
  "dimensions": {
${dimensionsSchema}
  },
  "strengths": string[] (your independent list, 3-5 specific items),
  "weaknesses": string[] (your independent list, 3-5 specific items),
  "missingData": string[] (optional, note any evidence gaps or invalid event IDs)
}

## QUALITY REQUIREMENTS

- If primary evaluator's evidenceEventIds are invalid, mention this in reasoning
- If you disagree with scores, explain why with specific evidence
- Provide detailed reasoning (3-5 sentences minimum per dimension)
- Be independent - don't just echo the primary evaluator's assessment`;
}

function validateAndNormalizeScorecard(input: unknown): Scorecard {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid scorecard format");
  }

  const obj = input as Record<string, unknown>;

  const overallScore = typeof obj.overallScore === "number" ? Math.max(0, Math.min(100, obj.overallScore)) : 50;
  const confidence = typeof obj.confidence === "number" ? Math.max(0, Math.min(1, obj.confidence)) : 0.5;

  const dimensions: Record<string, {
    score: number;
    reasoning: string;
    evidenceEventIds: string[];
    strengths?: string[];
    weaknesses?: string[];
  }> = {};

  if (obj.dimensions && typeof obj.dimensions === "object") {
    const dims = obj.dimensions as Record<string, unknown>;
    for (const [key, value] of Object.entries(dims)) {
      if (value && typeof value === "object") {
        const dim = value as Record<string, unknown>;
        dimensions[key] = {
          score: typeof dim.score === "number" ? Math.max(0, Math.min(100, dim.score)) : 50,
          reasoning: typeof dim.reasoning === "string" ? dim.reasoning : "",
          evidenceEventIds: Array.isArray(dim.evidenceEventIds)
            ? dim.evidenceEventIds.filter((id): id is string => typeof id === "string")
            : [],
          strengths: Array.isArray(dim.strengths)
            ? dim.strengths.filter((s): s is string => typeof s === "string")
            : undefined,
          weaknesses: Array.isArray(dim.weaknesses)
            ? dim.weaknesses.filter((w): w is string => typeof w === "string")
            : undefined,
        };
      }
    }
  }

  const strengths = Array.isArray(obj.strengths)
    ? obj.strengths.filter((s): s is string => typeof s === "string")
    : [];
  const weaknesses = Array.isArray(obj.weaknesses)
    ? obj.weaknesses.filter((w): w is string => typeof w === "string")
    : [];
  const missingData = Array.isArray(obj.missingData)
    ? obj.missingData.filter((m): m is string => typeof m === "string")
    : undefined;

  return {
    overallScore,
    confidence,
    dimensions,
    strengths,
    weaknesses,
    missingData,
  };
}

/**
 * Combine multiple model scorecards into one (multi-model panel).
 * Uses median for overall/dimension scores (robust to outliers), merges pros/cons.
 */
function adjudicateMulti(
  panelResults: Array<{ model: string; scorecard: Scorecard }>,
  verifierScorecard: Scorecard | null,
  judgePacket: JudgePacket
): Scorecard {
  const allScorecards = [
    ...panelResults.map((r) => r.scorecard),
    ...(verifierScorecard ? [verifierScorecard] : []),
  ];

  if (allScorecards.length === 0) {
    throw new Error("No scorecards to combine");
  }
  if (allScorecards.length === 1) {
    return allScorecards[0];
  }

  const overallScores = allScorecards.map((s) => s.overallScore);
  const overallScore = median(overallScores);
  const scoreStd = stdDev(overallScores);
  const confidence = Math.max(0.3, Math.min(1, 0.5 + 0.5 * (1 - Math.min(1, scoreStd / 25))));

  const allDimKeys = new Set<string>();
  for (const s of allScorecards) {
    Object.keys(s.dimensions).forEach((k) => allDimKeys.add(k));
  }

  const dimensions: Record<string, {
    score: number;
    reasoning: string;
    evidenceEventIds: string[];
    strengths?: string[];
    weaknesses?: string[];
  }> = {};

  for (const key of allDimKeys) {
    const dimScores = allScorecards
      .map((s) => s.dimensions[key]?.score)
      .filter((n): n is number => typeof n === "number");
    const scores = dimScores.length > 0 ? dimScores : [50];
    const reasoningParts = allScorecards
      .filter((s) => s.dimensions[key]?.reasoning)
      .map((s) => s.dimensions[key].reasoning)
      .slice(0, 2);
    const evidenceIds = [...new Set(allScorecards.flatMap((s) => s.dimensions[key]?.evidenceEventIds ?? []))];
    const strengths = dedupeStrings(allScorecards.flatMap((s) => s.dimensions[key]?.strengths ?? []));
    const weaknesses = dedupeStrings(allScorecards.flatMap((s) => s.dimensions[key]?.weaknesses ?? []));

    dimensions[key] = {
      score: Math.round(median(scores)),
      reasoning: reasoningParts.join(" ").slice(0, 800) || "Combined panel evaluation.",
      evidenceEventIds: evidenceIds,
      strengths: strengths.length > 0 ? strengths : undefined,
      weaknesses: weaknesses.length > 0 ? weaknesses : undefined,
    };
  }

  const strengths = dedupeStrings(allScorecards.flatMap((s) => s.strengths));
  const weaknesses = dedupeStrings(allScorecards.flatMap((s) => s.weaknesses));
  const missingData = [...new Set(allScorecards.flatMap((s) => s.missingData ?? []))];

  return {
    overallScore: Math.round(overallScore),
    confidence,
    dimensions,
    strengths,
    weaknesses,
    missingData: missingData.length > 0 ? missingData : undefined,
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 50;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const squareDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / values.length);
}

function dedupeStrings(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const n = s.trim();
    if (!n) continue;
    const key = n.toLowerCase().slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out.slice(0, 10);
}

function adjudicate(
  evaluatorScorecard: Scorecard,
  verifierScorecard: Scorecard | null,
  judgePacket: JudgePacket
): Scorecard {
  if (!verifierScorecard) {
    return evaluatorScorecard;
  }

  // Check for significant disagreement
  const scoreDiff = Math.abs(evaluatorScorecard.overallScore - verifierScorecard.overallScore);

  if (scoreDiff <= SCORE_DISAGREEMENT_THRESHOLD) {
    // Average within threshold
    const avgScore = (evaluatorScorecard.overallScore + verifierScorecard.overallScore) / 2;
    const avgConfidence = (evaluatorScorecard.confidence + verifierScorecard.confidence) / 2;

    const dimensions: Record<string, {
      score: number;
      reasoning: string;
      evidenceEventIds: string[];
      strengths?: string[];
      weaknesses?: string[];
    }> = {};

    // Average dimension scores
    const allDimKeys = new Set([
      ...Object.keys(evaluatorScorecard.dimensions),
      ...Object.keys(verifierScorecard.dimensions),
    ]);

    for (const key of allDimKeys) {
      const evaluatorDim = evaluatorScorecard.dimensions[key];
      const verifierDim = verifierScorecard.dimensions[key];

      if (evaluatorDim && verifierDim) {
        // Merge strengths and weaknesses from both evaluators
        const mergedStrengths = [
          ...(evaluatorDim.strengths || []),
          ...(verifierDim.strengths || []),
        ];
        const mergedWeaknesses = [
          ...(evaluatorDim.weaknesses || []),
          ...(verifierDim.weaknesses || []),
        ];

        dimensions[key] = {
          score: (evaluatorDim.score + verifierDim.score) / 2,
          reasoning: `${evaluatorDim.reasoning} [Verified: ${verifierDim.reasoning}]`,
          evidenceEventIds: [...new Set([...evaluatorDim.evidenceEventIds, ...verifierDim.evidenceEventIds])],
          strengths: mergedStrengths.length > 0 ? [...new Set(mergedStrengths)] : undefined,
          weaknesses: mergedWeaknesses.length > 0 ? [...new Set(mergedWeaknesses)] : undefined,
        };
      } else if (evaluatorDim) {
        dimensions[key] = evaluatorDim;
      } else if (verifierDim) {
        dimensions[key] = verifierDim;
      }
    }

    return {
      overallScore: avgScore,
      confidence: avgConfidence,
      dimensions,
      strengths: [...new Set([...evaluatorScorecard.strengths, ...verifierScorecard.strengths])],
      weaknesses: [...new Set([...evaluatorScorecard.weaknesses, ...verifierScorecard.weaknesses])],
      missingData: [
        ...new Set([
          ...(evaluatorScorecard.missingData || []),
          ...(verifierScorecard.missingData || []),
        ]),
      ],
    };
  } else {
    // Significant disagreement - prefer deterministic flags
    const deterministicFlags = (judgePacket.ruleFlags || []).filter(
      (f) => f.severity === "high" && f.flagType !== "orphan_tool_result"
    );

    // Prefer the scorecard with better evidence links
    const evaluatorEvidenceCount = Object.values(evaluatorScorecard.dimensions).reduce(
      (sum, dim) => sum + dim.evidenceEventIds.length,
      0
    );
    const verifierEvidenceCount = Object.values(verifierScorecard.dimensions).reduce(
      (sum, dim) => sum + dim.evidenceEventIds.length,
      0
    );

    const preferred = verifierEvidenceCount > evaluatorEvidenceCount ? verifierScorecard : evaluatorScorecard;

    return {
      ...preferred,
      confidence: Math.min(preferred.confidence, 0.6), // Lower confidence due to disagreement
      missingData: [
        ...(preferred.missingData || []),
        `Score disagreement: Evaluator=${evaluatorScorecard.overallScore}, Verifier=${verifierScorecard.overallScore}`,
      ],
    };
  }
}

function computeConfidence(
  evaluatorScorecard: Scorecard,
  verifierScorecard: Scorecard | null,
  finalScorecard: Scorecard
): number {
  if (!verifierScorecard) {
    return evaluatorScorecard.confidence;
  }

  const scoreDiff = Math.abs(evaluatorScorecard.overallScore - verifierScorecard.overallScore);
  const baseConfidence = finalScorecard.confidence;

  // Reduce confidence if there's disagreement
  if (scoreDiff > SCORE_DISAGREEMENT_THRESHOLD) {
    return Math.max(0.3, baseConfidence * 0.7);
  }

  // Increase confidence if both agree
  return Math.min(1.0, (evaluatorScorecard.confidence + verifierScorecard.confidence) / 2);
}

/** Confidence for multi-model panel: based on agreement and verifier if present. */
function computeConfidenceMulti(
  panelResults: Array<{ model: string; scorecard: Scorecard }>,
  verifierScorecard: Scorecard | null,
  finalScorecard: Scorecard
): number {
  let base = finalScorecard.confidence;
  if (panelResults.length > 1) {
    const scores = panelResults.map((r) => r.scorecard.overallScore);
    const std = stdDev(scores);
    base = Math.max(0.3, Math.min(1, 0.5 + 0.5 * (1 - Math.min(1, std / 25))));
  }
  if (verifierScorecard) {
    const panelAvg = panelResults.length > 0
      ? panelResults.reduce((s, r) => s + r.scorecard.overallScore, 0) / panelResults.length
      : finalScorecard.overallScore;
    const diff = Math.abs(panelAvg - verifierScorecard.overallScore);
    if (diff > SCORE_DISAGREEMENT_THRESHOLD) {
      base = Math.max(0.3, base * 0.75);
    } else {
      base = Math.min(1, base * 1.05);
    }
  }
  return base;
}

