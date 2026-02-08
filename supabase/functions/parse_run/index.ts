import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.0";
import { Pool } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const PARSER_VERSION = "1.1.0";
const MAX_PACKET_SIZE_BYTES = 500000;
const MAX_TOOL_INTERACTIONS = 50;
const MAX_STORED_EVENTS = 5000;
const MAX_TRACE_EVENTS_IN_PACKET = 200;
const MAX_EVENT_DATA_CHARS = 400;

interface DenoRequest {
  runId: string;
  ingestionId?: string;
  sourceType?: string;
  formatHint?: string;
  mappingConfig?: Record<string, unknown> | null;
}

interface ParsedEvent {
  id: string;
  type: string;
  timestamp?: string;
  data: Record<string, unknown>;
  sequence: number;
}

interface ToolInteraction {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  argsRaw?: string;
  result?: unknown;
  resultSummary?: string;
  status: "success" | "error" | "timeout" | "missing";
  eventIds: string[];
  timestamp?: string;
}

interface ParseContext {
  sourceType?: string;
  formatHint?: string;
  mappingConfig?: Record<string, unknown> | null;
}

interface StrictParseReport {
  adapterUsed: string;
  detectedFormat: string;
  sourceTypeRequested: string;
  confidence: number;
  totalInputRecords: number;
  parsedEvents: number;
  droppedRecords: number;
  timestampCoverage: number;
  typedEventCoverage: number;
  warnings: string[];
  errors: string[];
}

interface AdapterParseResult {
  events: ParsedEvent[];
  sourceMeta: Record<string, unknown>;
  strictReport: StrictParseReport;
}

interface IngestionAdapter {
  name: string;
  sourceTypes: string[];
  canHandle: (text: string, detectedFormat: string) => boolean;
  parse: (text: string, context: ParseContext, detectedFormat: string) => AdapterParseResult;
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
  toolInteractions: ToolInteraction[];
  errors: Array<{
    message: string;
    eventIds: string[];
    timestamp?: string;
  }>;
  retries: Array<{
    attempt: number;
    eventIds: string[];
    timestamp?: string;
  }>;
  finalOutput?: {
    text: string;
    eventIds: string[];
  };
  metrics: {
    totalToolCalls: number;
    totalErrors: number;
    totalRetries: number;
    totalDurationMs?: number;
  };
  ruleFlags: Array<{
    flagType: string;
    severity: "low" | "medium" | "high";
    message: string;
    evidenceEventIds: string[];
  }>;
  scoringRubric?: {
    dimensions: string[];
    weights?: Record<string, number>;
  };
  requiredOutputSchema?: Record<string, unknown>;
  redactionReport: {
    patternsMatched: string[];
    redactedCount: number;
  };
  trace?: Array<{ id: string; type: string; data: Record<string, unknown>; timestamp?: string }>;
}

serve(async (req) => {
  try {
    // Handle CORS
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
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const {
      runId,
      ingestionId,
      sourceType,
      formatHint,
      mappingConfig,
    }: DenoRequest = requestBody;

    if (!runId) {
      return new Response(
        JSON.stringify({ error: "runId is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("PROJECT_URL");
    const supabaseServiceKey = Deno.env.get("SERVICE_ROLE_KEY");
    const dbUrl = Deno.env.get("DATABASE_URL");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({
          error: "Missing environment variables",
          missing: {
            PROJECT_URL: !supabaseUrl,
            SERVICE_ROLE_KEY: !supabaseServiceKey,
          },
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Use direct Postgres connection to bypass REST API permission issues
    if (!dbUrl) {
      return new Response(
        JSON.stringify({
          error: "Missing DATABASE_URL environment variable",
          details: "Direct database connection is required for this function",
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

    // Create Supabase client for Storage access only
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    console.log("[parse_run] Starting for runId=", runId);

    // Helper function for database queries
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

    try {
      // Get run
      const runs = await dbQuery<{
        id: string;
        projectId: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
      }>(
        'SELECT id, "projectId", status, "createdAt", "updatedAt" FROM "AgentRun" WHERE id = $1',
        [runId]
      );

      if (runs.length === 0) {
        return new Response(
          JSON.stringify({ error: "Run not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      const run = runs[0];

      if (run.status !== "UPLOADED") {
        return new Response(
          JSON.stringify({ error: `Run is not UPLOADED (current: ${run.status})` }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Get logfile
      const logfiles = await dbQuery<{
        id: string;
        runId: string;
        storageKey: string;
        url: string;
        sizeBytes: number;
        contentType: string;
        metadata: Record<string, unknown> | null;
      }>(
        'SELECT id, "runId", "storageKey", url, "sizeBytes", "contentType", metadata FROM "RunLogfile" WHERE "runId" = $1 LIMIT 1',
        [runId]
      );

      if (logfiles.length === 0) {
        return new Response(
          JSON.stringify({ error: "No logfile found for this run" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      const logfile = logfiles[0];

      let latestIngestion: {
        id: string;
        sourceType: string;
        formatHint: string | null;
        mappingConfig: Record<string, unknown> | null;
      } | null = null;
      try {
        const ingestions = await dbQuery<{
          id: string;
          sourceType: string;
          formatHint: string | null;
          mappingConfig: Record<string, unknown> | null;
        }>(
          `SELECT id, "sourceType", "formatHint", "mappingConfig"
           FROM "RunIngestion"
           WHERE "runId" = $1
           ORDER BY "createdAt" DESC
           LIMIT 1`,
          [runId]
        );
        latestIngestion = ingestions.length > 0 ? ingestions[0] : null;
      } catch (ingestionLookupError) {
        console.warn("RunIngestion lookup skipped:", ingestionLookupError);
      }
      const logfileMeta = isObject(logfile.metadata)
        ? (logfile.metadata as Record<string, unknown>)
        : {};
      const resolvedIngestionId = ingestionId || latestIngestion?.id || null;
      const parseContext: ParseContext = {
        sourceType:
          sourceType ||
          latestIngestion?.sourceType ||
          asString(logfileMeta.sourceType),
        formatHint:
          formatHint ||
          latestIngestion?.formatHint ||
          asString(logfileMeta.formatHint),
        mappingConfig:
          mappingConfig ??
          latestIngestion?.mappingConfig ??
          (isObject(logfileMeta.mappingConfig)
            ? (logfileMeta.mappingConfig as Record<string, unknown>)
            : null),
      };

      // Update status to PARSING
      await dbExecute('UPDATE "AgentRun" SET status = $1 WHERE id = $2', ["PARSING", runId]);
      if (resolvedIngestionId) {
        try {
          await dbExecute(
            `UPDATE "RunIngestion"
             SET status = $1, "startedAt" = NOW(), "failureDetails" = NULL, "updatedAt" = NOW()
             WHERE id = $2`,
            ["PROCESSING", resolvedIngestionId]
          );
        } catch (ingestionUpdateError) {
          console.warn("RunIngestion start update skipped:", ingestionUpdateError);
        }
      }

    // Download logfile from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("agent-logs")
      .download(logfile.storageKey);

      if (downloadError || !fileData) {
        await dbExecute('UPDATE "AgentRun" SET status = $1 WHERE id = $2', ["FAILED", runId]);
        if (resolvedIngestionId) {
          try {
            await dbExecute(
              `UPDATE "RunIngestion"
               SET status = $1, "failureDetails" = $2, "updatedAt" = NOW()
               WHERE id = $3`,
              ["FAILED", "Failed to download logfile", resolvedIngestionId]
            );
          } catch (ingestionFailError) {
            console.warn("RunIngestion failure update skipped:", ingestionFailError);
          }
        }
        return new Response(
          JSON.stringify({ error: "Failed to download logfile" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

    // Normalize encoding and newlines
    const rawText = await fileData.text();
    const normalizedText = normalizeText(rawText);
    console.log("[parse_run] Logfile loaded: rawLength=", rawText.length, "normalizedLength=", normalizedText.length);

    // Parse with adapter-based ingestion pipeline
    const adapterResult = parseWithAdapters(normalizedText, parseContext);
    const events = adapterResult.events;
    const format = adapterResult.strictReport.detectedFormat;
    const eventTypes = events.reduce((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc; }, {} as Record<string, number>);
    console.log("[parse_run] Parsed: adapter=", adapterResult.strictReport.adapterUsed, "format=", format, "events=", events.length, "confidence=", adapterResult.strictReport.confidence, "eventTypes=", JSON.stringify(eventTypes));

    // Link tool calls to results
    const toolInteractions = linkToolCalls(events);
    console.log("[parse_run] Tool interactions: ", toolInteractions.length);

    // Segment steps
    const steps = segmentSteps(events);
    console.log("[parse_run] Steps: ", steps.length);

    // Extract task candidate
    const task = extractTask(events);
    console.log("[parse_run] Task: text=", task.text?.slice(0, 100) + (task.text?.length > 100 ? "..." : ""), "confidence=", task.confidence);

    // Compute metrics
    const metrics = computeMetrics(events, toolInteractions);

    // Compute rule flags
    const ruleFlags = computeRuleFlags(events, toolInteractions);
    console.log("[parse_run] Rule flags: ", ruleFlags.length);

    // Redact secrets
    const { redactedEvents, redactionReport } = redactSecrets(events);

    // Build judge packet
    const judgePacket = buildJudgePacket(
      events,
      redactedEvents,
      toolInteractions,
      steps,
      task,
      metrics,
      ruleFlags,
      redactionReport,
      format
    );

    // Store results in database
    const packetJson = JSON.stringify(judgePacket);
    const packetSizeBytes = new TextEncoder().encode(packetJson).length;
    console.log("[parse_run] Judge packet built: size=", packetSizeBytes, "traceEvents=", judgePacket.trace?.length ?? 0, "toolInteractions=", judgePacket.toolInteractions.length, "steps=", judgePacket.traceSummary.steps.length);

      // Persist normalized events (Phase 1 dual-write): keep trace summary and write row-level events.
      await dbExecute('DELETE FROM "RunEvent" WHERE "runId" = $1', [runId]);
      for (const event of redactedEvents.slice(0, MAX_STORED_EVENTS)) {
        await dbExecute(
          `INSERT INTO "RunEvent" (id, "runId", "eventType", "eventData", timestamp, sequence, "createdAt")
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW())`,
          [
            runId,
            event.type,
            JSON.stringify(event.data),
            event.timestamp || null,
            event.sequence,
          ]
        );
      }

      // Store normalized trace (existing write path)
      await dbExecute(
        `INSERT INTO "RunTraceSummary" (id, "runId", "normalizedTrace", "parserVersion", "parseReport", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT ("runId") DO UPDATE SET
           "normalizedTrace" = EXCLUDED."normalizedTrace",
           "parserVersion" = EXCLUDED."parserVersion",
           "parseReport" = EXCLUDED."parseReport",
           "updatedAt" = NOW()`,
        [
          runId,
          JSON.stringify(redactedEvents),
          PARSER_VERSION,
          JSON.stringify({
            format,
            adapterUsed: adapterResult.strictReport.adapterUsed,
            sourceTypeRequested: adapterResult.strictReport.sourceTypeRequested,
            parserConfidence: adapterResult.strictReport.confidence,
            strictReport: adapterResult.strictReport,
            sourceMeta: adapterResult.sourceMeta,
            totalEvents: events.length,
            persistedEvents: Math.min(redactedEvents.length, MAX_STORED_EVENTS),
            packetSizeBytes,
            truncated: packetSizeBytes > MAX_PACKET_SIZE_BYTES,
          }),
        ]
      );

      // Store metrics
      await dbExecute(
        `INSERT INTO "RunMetrics" (id, "runId", "totalSteps", "totalToolCalls", "totalErrors", "totalRetries", "totalDurationMs", "parserVersion", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         ON CONFLICT ("runId") DO UPDATE SET
           "totalSteps" = EXCLUDED."totalSteps",
           "totalToolCalls" = EXCLUDED."totalToolCalls",
           "totalErrors" = EXCLUDED."totalErrors",
           "totalRetries" = EXCLUDED."totalRetries",
           "totalDurationMs" = EXCLUDED."totalDurationMs",
           "parserVersion" = EXCLUDED."parserVersion",
           "updatedAt" = NOW()`,
        [
          runId,
          steps.length,
          metrics.totalToolCalls,
          metrics.totalErrors,
          metrics.totalRetries,
          metrics.totalDurationMs,
          PARSER_VERSION,
        ]
      );

      // Store rule flags
      await dbExecute('DELETE FROM "RunRuleFlag" WHERE "runId" = $1', [runId]);
      if (ruleFlags.length > 0) {
        for (const flag of ruleFlags) {
          await dbExecute(
            `INSERT INTO "RunRuleFlag" (id, "runId", "flagType", severity, message, "evidenceEventIds", "createdAt")
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW())`,
            [
              runId,
              flag.flagType,
              flag.severity,
              flag.message,
              flag.evidenceEventIds,
            ]
          );
        }
      }

      // Store judge packet
      await dbExecute(
        `INSERT INTO "RunJudgePacket" (id, "runId", packet, "packetSizeBytes", "parserVersion", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT ("runId") DO UPDATE SET
           packet = EXCLUDED.packet,
           "packetSizeBytes" = EXCLUDED."packetSizeBytes",
           "parserVersion" = EXCLUDED."parserVersion",
           "updatedAt" = NOW()`,
        [runId, packetJson, packetSizeBytes, PARSER_VERSION]
      );

      if (resolvedIngestionId) {
        try {
          await dbExecute(
            `UPDATE "RunIngestion"
             SET status = $1,
                 "parserVersion" = $2,
                 "parserConfidence" = $3,
                 "strictReport" = $4,
                 "sourceMeta" = $5,
                 "completedAt" = NOW(),
                 "updatedAt" = NOW()
             WHERE id = $6`,
            [
              "COMPLETED",
              PARSER_VERSION,
              adapterResult.strictReport.confidence,
              JSON.stringify(adapterResult.strictReport),
              JSON.stringify(adapterResult.sourceMeta),
              resolvedIngestionId,
            ]
          );
        } catch (ingestionCompleteError) {
          console.warn("RunIngestion completion update skipped:", ingestionCompleteError);
        }
      }

      // Update run status
      await dbExecute('UPDATE "AgentRun" SET status = $1 WHERE id = $2', ["READY_FOR_JUDGING", runId]);

      console.log("[parse_run] Success: runId=", runId, "status=READY_FOR_JUDGING");

      return new Response(
        JSON.stringify({
          success: true,
          runId,
          ingestionId: resolvedIngestionId,
          status: "READY_FOR_JUDGING",
          packetSizeBytes,
          parserConfidence: adapterResult.strictReport.confidence,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    } catch (dbError) {
      console.error("[parse_run] Database error:", dbError);
      try {
        await dbExecute('UPDATE "AgentRun" SET status = $1 WHERE id = $2', ["FAILED", runId]);
        if (resolvedIngestionId) {
          try {
            await dbExecute(
              `UPDATE "RunIngestion"
               SET status = $1, "failureDetails" = $2, "updatedAt" = NOW()
               WHERE id = $3`,
              [
                "FAILED",
                dbError instanceof Error ? dbError.message : String(dbError),
                resolvedIngestionId,
              ]
            );
          } catch (ingestionFailError) {
            console.warn("RunIngestion DB failure update skipped:", ingestionFailError);
          }
        }
      } catch {
        // Ignore cleanup errors
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
    console.error("[parse_run] Parse error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        details: error instanceof Error ? error.stack : String(error),
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});

function normalizeText(text: string): string {
  // Normalize line endings to \n
  let normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Try to detect and handle encoding issues
  // Remove null bytes
  normalized = normalized.replace(/\0/g, "");

  return normalized;
}

function detectFormat(text: string, formatHint?: string): string {
  const normalizedHint = formatHint?.toLowerCase().trim();
  if (normalizedHint === "json" || normalizedHint === "jsonl" || normalizedHint === "text") {
    return normalizedHint;
  }

  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length > 0) {
    let jsonlCount = 0;
    for (const line of lines.slice(0, 20)) {
      try {
        JSON.parse(line.trim());
        jsonlCount++;
      } catch {
        // ignore
      }
    }
    if (jsonlCount >= lines.slice(0, 20).length * 0.8) {
      return "jsonl";
    }
  }

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) || isObject(parsed)) {
      return "json";
    }
  } catch {
    // ignore
  }

  return "text";
}

function parseWithAdapters(text: string, context: ParseContext): AdapterParseResult {
  const requestedSourceType = (context.sourceType || "generic_jsonl").toLowerCase();
  const detectedFormat = detectFormat(text, context.formatHint);

  const adapters: IngestionAdapter[] = [
    openAIAgentsAdapter(),
    langChainAdapter(),
    genericJsonlAdapter(),
  ];

  const bySourceType = adapters.find((adapter) =>
    adapter.sourceTypes.includes(requestedSourceType)
  );
  const adapter =
    bySourceType ||
    adapters.find((candidate) => candidate.canHandle(text, detectedFormat)) ||
    genericJsonlAdapter();

  const parsed = adapter.parse(text, context, detectedFormat);
  const normalizedEvents = parsed.events.map((event, idx) => ({
    id: event.id || `event_${idx}`,
    type: event.type || "unknown",
    timestamp: normalizeTimestamp(event.timestamp),
    data: event.data || {},
    sequence: idx,
  }));

  const timestampCoverage =
    normalizedEvents.length === 0
      ? 0
      : normalizedEvents.filter((e) => !!e.timestamp).length / normalizedEvents.length;
  const typedCoverage =
    normalizedEvents.length === 0
      ? 0
      : normalizedEvents.filter((e) => e.type !== "unknown").length / normalizedEvents.length;
  const droppedRecords = Math.max(
    0,
    parsed.strictReport.totalInputRecords - normalizedEvents.length
  );
  const confidence = clamp01(
    (normalizedEvents.length > 0 ? 0.35 : 0) +
      Math.min(0.35, typedCoverage * 0.35) +
      Math.min(0.2, timestampCoverage * 0.2) +
      Math.max(0, 0.1 - droppedRecords * 0.01) -
      parsed.strictReport.errors.length * 0.1
  );

  const strictReport: StrictParseReport = {
    adapterUsed: adapter.name,
    detectedFormat,
    sourceTypeRequested: requestedSourceType,
    confidence,
    totalInputRecords: parsed.strictReport.totalInputRecords,
    parsedEvents: normalizedEvents.length,
    droppedRecords,
    timestampCoverage,
    typedEventCoverage: typedCoverage,
    warnings: parsed.strictReport.warnings,
    errors: parsed.strictReport.errors,
  };

  return {
    events: normalizedEvents,
    sourceMeta: {
      ...parsed.sourceMeta,
      adapter: adapter.name,
      detectedFormat,
      requestedSourceType,
    },
    strictReport,
  };
}

function openAIAgentsAdapter(): IngestionAdapter {
  return {
    name: "openai_agents",
    sourceTypes: ["openai_agents", "openai"],
    canHandle: (text, detectedFormat) => {
      if (detectedFormat === "text") return false;
      return text.includes('"tool_call_id"') || text.includes('"response.output_text"');
    },
    parse: (text, context, detectedFormat) =>
      parseGenericEvents(text, detectedFormat, context.mappingConfig, "openai_agents"),
  };
}

function langChainAdapter(): IngestionAdapter {
  return {
    name: "langchain",
    sourceTypes: ["langchain"],
    canHandle: (text, detectedFormat) => {
      if (detectedFormat === "text") return false;
      return text.includes('"lc"') || text.includes('"run_id"') || text.includes('"tool_input"');
    },
    parse: (text, context, detectedFormat) =>
      parseGenericEvents(text, detectedFormat, context.mappingConfig, "langchain"),
  };
}

function genericJsonlAdapter(): IngestionAdapter {
  return {
    name: "generic_jsonl",
    sourceTypes: ["generic_jsonl", "generic_json", "generic"],
    canHandle: () => true,
    parse: (text, context, detectedFormat) =>
      parseGenericEvents(text, detectedFormat, context.mappingConfig, "generic_jsonl"),
  };
}

function parseGenericEvents(
  text: string,
  format: string,
  mappingConfig: Record<string, unknown> | null | undefined,
  adapterName: string
): AdapterParseResult {
  const events: ParsedEvent[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  let totalInputRecords = 0;

  if (format === "jsonl") {
    const lines = text.split("\n").filter((l) => l.trim());
    totalInputRecords = lines.length;

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line.trim());
        const event = toParsedEvent(parsed, events.length, mappingConfig);
        if (event) {
          events.push(event);
        } else {
          warnings.push("Skipped JSONL line due to invalid object shape");
        }
      } catch {
        errors.push("Invalid JSONL line encountered");
      }
    }
  } else if (format === "json") {
    try {
      const parsed = JSON.parse(text);

      if (Array.isArray(parsed)) {
        totalInputRecords = parsed.length;
        for (const item of parsed) {
          const event = toParsedEvent(item, events.length, mappingConfig);
          if (event) {
            events.push(event);
          } else {
            warnings.push("Skipped JSON array item due to invalid object shape");
          }
        }
      } else if (isObject(parsed)) {
        const root = parsed as Record<string, unknown>;
        const candidates = firstArrayCandidate(root);
        if (candidates) {
          totalInputRecords = candidates.length;
          for (const item of candidates) {
            const event = toParsedEvent(item, events.length, mappingConfig);
            if (event) {
              events.push(event);
            }
          }
        } else {
          totalInputRecords = 1;
          const event = toParsedEvent(parsed, 0, mappingConfig);
          if (event) {
            events.push(event);
          } else {
            warnings.push("Root JSON object could not be normalized as an event");
          }
        }
      } else {
        totalInputRecords = 1;
        warnings.push("JSON payload is scalar; converted to synthetic text event");
        events.push({
          id: "event_0",
          type: "log",
          data: { value: parsed },
          sequence: 0,
        });
      }
    } catch {
      errors.push("Invalid JSON payload");
    }
  } else {
    const lines = text.split("\n").filter((l) => l.trim());
    totalInputRecords = lines.length;
    for (const line of lines) {
      events.push({
        id: `event_${events.length}`,
        type: "log",
        data: { text: line.trim() },
        sequence: events.length,
      });
    }
  }

  return {
    events,
    sourceMeta: {
      adapter: adapterName,
      format,
      mappingKeys: mappingConfig ? Object.keys(mappingConfig) : [],
    },
    strictReport: {
      adapterUsed: adapterName,
      detectedFormat: format,
      sourceTypeRequested: adapterName,
      confidence: 0,
      totalInputRecords,
      parsedEvents: events.length,
      droppedRecords: Math.max(0, totalInputRecords - events.length),
      timestampCoverage: 0,
      typedEventCoverage: 0,
      warnings,
      errors,
    },
  };
}

function toParsedEvent(
  raw: unknown,
  sequence: number,
  mappingConfig?: Record<string, unknown> | null
): ParsedEvent | null {
  if (!isObject(raw)) {
    return null;
  }

  const idPath = asString(mappingConfig?.idPath) || "id";
  const typePath = asString(mappingConfig?.typePath) || "type";
  const timePath = asString(mappingConfig?.timestampPath) || "timestamp";
  const dataPath = asString(mappingConfig?.dataPath);

  const id = asString(readPath(raw, idPath)) || `event_${sequence}`;
  const type =
    asString(readPath(raw, typePath)) ||
    asString((raw as Record<string, unknown>).event) ||
    asString((raw as Record<string, unknown>).event_type) ||
    "unknown";
  const timestamp =
    asString(readPath(raw, timePath)) ||
    asString((raw as Record<string, unknown>).time) ||
    undefined;

  const mappedData = dataPath ? readPath(raw, dataPath) : raw;
  return {
    id,
    type,
    timestamp: normalizeTimestamp(timestamp),
    data: isObject(mappedData) ? mappedData : { value: mappedData },
    sequence,
  };
}

function readPath(input: unknown, path: string): unknown {
  if (!path) return undefined;
  let current: unknown = input;
  for (const segment of path.split(".")) {
    if (!isObject(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function firstArrayCandidate(input: Record<string, unknown>): unknown[] | null {
  for (const value of Object.values(input)) {
    if (Array.isArray(value)) {
      return value;
    }
  }
  return null;
}

function normalizeTimestamp(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function linkToolCalls(events: ParsedEvent[]): ToolInteraction[] {
  const interactions: ToolInteraction[] = [];
  const toolCallMap = new Map<string, ParsedEvent>();
  const toolResultMap = new Map<string, ParsedEvent>();
  const orderedStarts: ParsedEvent[] = [];
  const orderedEnds: ParsedEvent[] = [];

  // First pass: identify tool calls and results (standard: tool_call / tool_result; LangChain-style: tool_start / tool_end)
  for (const event of events) {
    const type = event.type.toLowerCase();
    const isCall = (type.includes("tool") && type.includes("call")) || (type.includes("tool") && type.includes("start"));
    const isResult = (type.includes("tool") && type.includes("result")) || (type.includes("tool") && type.includes("end"));
    if (isCall) {
      const toolCallId = extractToolCallId(event);
      if (toolCallId) {
        toolCallMap.set(toolCallId, event);
      } else {
        orderedStarts.push(event);
      }
    }
    if (isResult) {
      const toolCallId = extractToolCallId(event);
      if (toolCallId) {
        toolResultMap.set(toolCallId, event);
      } else {
        orderedEnds.push(event);
      }
    }
  }

  // Pair LangChain-style tool_start/tool_end by order (first start with first end, etc.)
  for (let i = 0; i < Math.min(orderedStarts.length, orderedEnds.length); i++) {
    const key = `ord_${i}`;
    toolCallMap.set(key, orderedStarts[i]!);
    toolResultMap.set(key, orderedEnds[i]!);
  }

  // Second pass: link calls to results
  for (const [toolCallId, callEvent] of toolCallMap.entries()) {
    const resultEvent = toolResultMap.get(toolCallId);
    const toolName = extractToolName(callEvent);
    const args = extractToolArgs(callEvent);
    const argsRaw = JSON.stringify(args);

    let status: "success" | "error" | "timeout" | "missing" = "missing";
    let result: unknown;
    let resultSummary: string | undefined;

    if (resultEvent) {
      result = resultEvent.data;
      const resultType = resultEvent.type.toLowerCase();
      if (resultType.includes("error")) {
        status = "error";
      } else {
        status = "success";
      }
      resultSummary = summarizeResult(result);
    }

    interactions.push({
      toolCallId: String(toolCallId),
      toolName,
      args,
      argsRaw,
      result,
      resultSummary,
      status,
      eventIds: resultEvent
        ? [String(callEvent.id), String(resultEvent.id)]
        : [String(callEvent.id)],
      timestamp: callEvent.timestamp,
    });
  }

  // Also check for orphan results
  for (const [toolCallId, resultEvent] of toolResultMap.entries()) {
    if (!toolCallMap.has(toolCallId)) {
      interactions.push({
        toolCallId: String(toolCallId),
        toolName: "unknown",
        args: {},
        status: "missing",
        eventIds: [String(resultEvent.id)],
        timestamp: resultEvent.timestamp,
      });
    }
  }

  return interactions;
}

function extractToolCallId(event: ParsedEvent): string | null {
  const val =
    event.data.tool_call_id ??
    event.data.toolCallId ??
    event.data.id ??
    null;
  return val != null ? String(val) : null;
}

function extractToolName(event: ParsedEvent): string {
  const val =
    event.data.tool_name ??
    event.data.toolName ??
    event.data.name;
  return typeof val === "string" ? val : "unknown";
}

function extractToolArgs(event: ParsedEvent): Record<string, unknown> {
  const val =
    event.data.args ??
    event.data.arguments ??
    event.data.input ??
    event.data.tool_input;
  return isObject(val) ? val : {};
}

function summarizeResult(result: unknown): string {
  if (typeof result === "string") {
    return result.length > 200 ? result.slice(0, 200) + "..." : result;
  }
  const json = JSON.stringify(result);
  return json.length > 200 ? json.slice(0, 200) + "..." : json;
}

function segmentSteps(events: ParsedEvent[]): Array<{
  stepNumber: number;
  description: string;
  keyEventIds: string[];
  timestamp?: string;
}> {
  const steps: Array<{
    stepNumber: number;
    description: string;
    keyEventIds: string[];
    timestamp?: string;
  }> = [];

  let currentStep = 1;
  let currentEventIds: string[] = [];
  let stepStartTime: string | undefined;

  for (const event of events) {
    const type = event.type.toLowerCase();

    // Detect step boundaries (user messages, tool call starts, etc.)
    if (
      type.includes("user") ||
      type.includes("message") ||
      (type.includes("tool") && type.includes("start"))
    ) {
      if (currentEventIds.length > 0) {
        steps.push({
          stepNumber: currentStep++,
          description: `Step ${currentStep - 1}`,
          keyEventIds: [...currentEventIds],
          timestamp: stepStartTime,
        });
        currentEventIds = [];
      }
      stepStartTime = event.timestamp;
    }

    currentEventIds.push(event.id);
  }

  // Add final step
  if (currentEventIds.length > 0) {
    steps.push({
      stepNumber: currentStep,
      description: `Step ${currentStep}`,
      keyEventIds: currentEventIds,
      timestamp: stepStartTime,
    });
  }

  return steps.length > 0 ? steps : [{ stepNumber: 1, description: "Single step", keyEventIds: events.map((e) => e.id) }];
}

function extractTask(events: ParsedEvent[]): {
  text: string;
  confidence: number;
  sourceEventIds: string[];
} {
  // Look for task definition in early events
  for (const event of events.slice(0, 20)) {
    const type = event.type.toLowerCase();
    if (type.includes("task") || type.includes("user") || type.includes("message")) {
      const text = extractTaskText(event);
      if (text) {
        return {
          text,
          confidence: 0.8,
          sourceEventIds: [event.id],
        };
      }
    }
  }

  // Fallback: use first event
  if (events.length > 0) {
    return {
      text: JSON.stringify(events[0].data).slice(0, 500),
      confidence: 0.3,
      sourceEventIds: [events[0].id],
    };
  }

  return {
    text: "Task not found",
    confidence: 0.0,
    sourceEventIds: [],
  };
}

function extractTaskText(event: ParsedEvent): string | null {
  const data = event.data;
  const val =
    data.task ?? data.task_text ?? data.text ?? data.content ?? data.message;
  return typeof val === "string" ? val : null;
}

function computeMetrics(
  events: ParsedEvent[],
  toolInteractions: ToolInteraction[]
): {
  totalToolCalls: number;
  totalErrors: number;
  totalRetries: number;
  totalDurationMs?: number;
} {
  const totalToolCalls = toolInteractions.length;
  const totalErrors = toolInteractions.filter((t) => t.status === "error").length;

  // Count retries (heuristic: same tool called multiple times)
  const toolCallCounts = new Map<string, number>();
  for (const interaction of toolInteractions) {
    const count = toolCallCounts.get(interaction.toolName) || 0;
    toolCallCounts.set(interaction.toolName, count + 1);
  }
  const totalRetries = Array.from(toolCallCounts.values())
    .filter((c) => c > 1)
    .reduce((a, b) => a + b - 1, 0);

  // Compute duration if timestamps available
  let totalDurationMs: number | undefined;
  const timestamps = events
    .map((e) => e.timestamp)
    .filter((t): t is string => !!t)
    .map((t) => new Date(t).getTime())
    .filter((t) => !isNaN(t));
  if (timestamps.length >= 2) {
    totalDurationMs = Math.max(...timestamps) - Math.min(...timestamps);
  }

  return {
    totalToolCalls,
    totalErrors,
    totalRetries,
    totalDurationMs,
  };
}

function computeRuleFlags(
  events: ParsedEvent[],
  toolInteractions: ToolInteraction[]
): Array<{
  flagType: string;
  severity: "low" | "medium" | "high";
  message: string;
  evidenceEventIds: string[];
}> {
  const flags: Array<{
    flagType: string;
    severity: "low" | "medium" | "high";
    message: string;
    evidenceEventIds: string[];
  }> = [];

  // Check for missing tool results
  const missingResults = toolInteractions.filter((t) => t.status === "missing");
  if (missingResults.length > 0) {
    flags.push({
      flagType: "missing_tool_result",
      severity: "high",
      message: `${missingResults.length} tool call(s) missing results`,
      evidenceEventIds: missingResults.flatMap((t) => t.eventIds),
    });
  }

  // Check for invalid tool args (heuristic: parse errors)
  const invalidArgs = toolInteractions.filter((t) => {
    try {
      JSON.parse(t.argsRaw || "{}");
      return false;
    } catch {
      return true;
    }
  });
  if (invalidArgs.length > 0) {
    flags.push({
      flagType: "invalid_tool_args",
      severity: "medium",
      message: `${invalidArgs.length} tool call(s) with invalid arguments`,
      evidenceEventIds: invalidArgs.flatMap((t) => t.eventIds),
    });
  }

  // Check for loops (same tool called many times)
  const toolCallCounts = new Map<string, number>();
  for (const interaction of toolInteractions) {
    const count = toolCallCounts.get(interaction.toolName) || 0;
    toolCallCounts.set(interaction.toolName, count + 1);
  }
  for (const [toolName, count] of toolCallCounts.entries()) {
    if (count > 10) {
      const loopInteractions = toolInteractions.filter((t) => t.toolName === toolName);
      flags.push({
        flagType: "tool_loop",
        severity: "high",
        message: `Tool "${toolName}" called ${count} times (possible loop)`,
        evidenceEventIds: loopInteractions.flatMap((t) => t.eventIds),
      });
    }
  }

  // Check for orphan results
  const orphanResults = toolInteractions.filter(
    (t) => t.toolName === "unknown" && t.status === "missing"
  );
  if (orphanResults.length > 0) {
    flags.push({
      flagType: "orphan_tool_result",
      severity: "low",
      message: `${orphanResults.length} orphan tool result(s)`,
      evidenceEventIds: orphanResults.flatMap((t) => t.eventIds),
    });
  }

  return flags;
}

function redactSecrets(events: ParsedEvent[]): {
  redactedEvents: ParsedEvent[];
  redactionReport: { patternsMatched: string[]; redactedCount: number };
} {
  const patterns = [
    /sk-[a-zA-Z0-9]{32,}/g, // OpenAI API keys
    /AIza[0-9A-Za-z-_]{35}/g, // Google API keys
    /Bearer\s+[a-zA-Z0-9._-]+/gi, // Bearer tokens
    /password["\s:=]+([^"}\s,]+)/gi, // Passwords
    /api[_-]?key["\s:=]+([^"}\s,]+)/gi, // API keys
    /secret["\s:=]+([^"}\s,]+)/gi, // Secrets
  ];

  const patternsMatched: string[] = [];
  let redactedCount = 0;
  const redactedEvents = events.map((event) => {
    const eventStr = JSON.stringify(event.data);
    let redactedStr = eventStr;

    for (const pattern of patterns) {
      if (pattern.test(redactedStr)) {
        patternsMatched.push(pattern.source);
        redactedStr = redactedStr.replace(pattern, () => {
          redactedCount++;
          return "[REDACTED]";
        });
      }
    }

    if (redactedStr !== eventStr) {
      return {
        ...event,
        data: JSON.parse(redactedStr),
      };
    }
    return event;
  });

  return {
    redactedEvents,
    redactionReport: {
      patternsMatched: [...new Set(patternsMatched)],
      redactedCount,
    },
  };
}

function buildJudgePacket(
  events: ParsedEvent[],
  redactedEvents: ParsedEvent[],
  toolInteractions: ToolInteraction[],
  steps: Array<{ stepNumber: number; description: string; keyEventIds: string[]; timestamp?: string }>,
  task: { text: string; confidence: number; sourceEventIds: string[] },
  metrics: { totalToolCalls: number; totalErrors: number; totalRetries: number; totalDurationMs?: number },
  ruleFlags: Array<{ flagType: string; severity: string; message: string; evidenceEventIds: string[] }>,
  redactionReport: { patternsMatched: string[]; redactedCount: number },
  format: string
): JudgePacket {
  // Prioritize tool interactions: failures first, then final steps, then loops
  const prioritizedInteractions = [...toolInteractions].sort((a, b) => {
    if (a.status === "error" && b.status !== "error") return -1;
    if (a.status !== "error" && b.status === "error") return 1;
    return 0;
  });

  // Take top-K interactions
  const topInteractions = prioritizedInteractions.slice(0, MAX_TOOL_INTERACTIONS);

  // Extract errors
  const errors = events
    .filter((e) => e.type.toLowerCase().includes("error"))
    .map((e) => ({
      message: JSON.stringify(e.data).slice(0, 500),
      eventIds: [String(e.id)],
      timestamp: e.timestamp,
    }));

  // Extract retries (heuristic)
  const retries: Array<{ attempt: number; eventIds: string[]; timestamp?: string }> = [];
  const toolAttempts = new Map<string, number>();
  for (const interaction of toolInteractions) {
    const attempt = (toolAttempts.get(interaction.toolCallId) || 0) + 1;
    toolAttempts.set(interaction.toolCallId, attempt);
    if (attempt > 1) {
      retries.push({
        attempt,
        eventIds: interaction.eventIds.map((id) => String(id)),
        timestamp: interaction.timestamp,
      });
    }
  }

  // Extract final output (last non-tool event)
  const finalEvents = events.filter(
    (e) => !e.type.toLowerCase().includes("tool")
  );
  const finalOutput =
    finalEvents.length > 0
      ? {
          text: JSON.stringify(finalEvents[finalEvents.length - 1].data).slice(0, 1000),
          eventIds: [String(finalEvents[finalEvents.length - 1].id)],
        }
      : undefined;

  // Build trace for judge: events with truncated data so LLM has full context
  const trace = redactedEvents.slice(0, MAX_TRACE_EVENTS_IN_PACKET).map((e) => {
    const dataStr = JSON.stringify(e.data);
    const truncatedData =
      dataStr.length > MAX_EVENT_DATA_CHARS
        ? { _truncated: true, _preview: dataStr.slice(0, MAX_EVENT_DATA_CHARS) + "..." }
        : e.data;
    return {
      id: String(e.id),
      type: e.type,
      data: isObject(truncatedData) ? truncatedData : { value: truncatedData },
      timestamp: e.timestamp,
    };
  });

  const packet: JudgePacket = {
    meta: {
      logQuality: {
        totalEvents: events.length,
        totalSteps: steps.length,
        format,
        encoding: "utf-8",
        parserVersion: PARSER_VERSION,
      },
    },
    task,
    traceSummary: {
      steps: steps.slice(0, 100), // Limit steps
    },
    trace,
    toolInteractions: topInteractions,
    errors: errors.slice(0, 20), // Limit errors
    retries: retries.slice(0, 10), // Limit retries
    finalOutput,
    metrics,
    ruleFlags: ruleFlags.map((f) => ({
      flagType: f.flagType,
      severity: f.severity as "low" | "medium" | "high",
      message: f.message,
      evidenceEventIds: f.evidenceEventIds.map((id) => String(id)),
    })),
    redactionReport,
  };

  // Enforce size bounds
  let packetJson = JSON.stringify(packet);
  let packetSizeBytes = new TextEncoder().encode(packetJson).length;

  if (packetSizeBytes > MAX_PACKET_SIZE_BYTES) {
    const targetSize = MAX_PACKET_SIZE_BYTES * 0.9; // 90% of max
    // First truncate trace if present
    while (packetSizeBytes > targetSize && packet.trace && packet.trace.length > 20) {
      packet.trace.pop();
      packetJson = JSON.stringify(packet);
      packetSizeBytes = new TextEncoder().encode(packetJson).length;
    }
    // Then truncate tool interactions
    while (packetSizeBytes > targetSize && packet.toolInteractions.length > 10) {
      packet.toolInteractions.pop();
      packetJson = JSON.stringify(packet);
      packetSizeBytes = new TextEncoder().encode(packetJson).length;
    }
    // Truncate result summaries
    for (const interaction of packet.toolInteractions) {
      if (interaction.resultSummary && interaction.resultSummary.length > 100) {
        interaction.resultSummary = interaction.resultSummary.slice(0, 100) + "...";
      }
    }
    packetJson = JSON.stringify(packet);
    packetSizeBytes = new TextEncoder().encode(packetJson).length;
  }

  return packet;
}

