import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.0";
import { Pool } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const PARSER_VERSION = "1.0.0";
const MAX_PACKET_SIZE_BYTES = 500000;
const MAX_TOOL_INTERACTIONS = 50;

interface DenoRequest {
  runId: string;
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

    console.log("Querying run:", runId);

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
      }>(
        'SELECT id, "runId", "storageKey", url, "sizeBytes", "contentType" FROM "RunLogfile" WHERE "runId" = $1 LIMIT 1',
        [runId]
      );

      if (logfiles.length === 0) {
        return new Response(
          JSON.stringify({ error: "No logfile found for this run" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      const logfile = logfiles[0];

      // Update status to PARSING
      await dbExecute('UPDATE "AgentRun" SET status = $1 WHERE id = $2', ["PARSING", runId]);

    // Download logfile from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("agent-logs")
      .download(logfile.storageKey);

      if (downloadError || !fileData) {
        await dbExecute('UPDATE "AgentRun" SET status = $1 WHERE id = $2', ["FAILED", runId]);
        return new Response(
          JSON.stringify({ error: "Failed to download logfile" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

    // Normalize encoding and newlines
    const rawText = await fileData.text();
    const normalizedText = normalizeText(rawText);
    const format = detectFormat(normalizedText);

    // Parse into events
    const events = parseEvents(normalizedText, format);

    // Link tool calls to results
    const toolInteractions = linkToolCalls(events);

    // Segment steps
    const steps = segmentSteps(events);

    // Extract task candidate
    const task = extractTask(events);

    // Compute metrics
    const metrics = computeMetrics(events, toolInteractions);

    // Compute rule flags
    const ruleFlags = computeRuleFlags(events, toolInteractions);

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

      // Store normalized trace (full)
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
            totalEvents: events.length,
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

      // Update run status
      await dbExecute('UPDATE "AgentRun" SET status = $1 WHERE id = $2', ["READY_FOR_JUDGING", runId]);

      return new Response(
        JSON.stringify({
          success: true,
          runId,
          status: "READY_FOR_JUDGING",
          packetSizeBytes,
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
      console.error("Database error:", dbError);
      try {
        await dbExecute('UPDATE "AgentRun" SET status = $1 WHERE id = $2', ["FAILED", runId]);
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
    console.error("Parse error:", error);
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

function detectFormat(text: string): string {
  // Try to detect JSONL (one JSON object per line)
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length > 0) {
    let jsonlCount = 0;
    for (const line of lines.slice(0, 10)) {
      try {
        JSON.parse(line.trim());
        jsonlCount++;
      } catch {
        // Not JSON
      }
    }
    if (jsonlCount >= lines.slice(0, 10).length * 0.8) {
      return "jsonl";
    }
  }

  // Try to detect JSON array
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return "json";
    }
  } catch {
    // Not JSON
  }

  // Default to text
  return "text";
}

function parseEvents(text: string, format: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  let sequence = 0;

  if (format === "jsonl") {
    const lines = text.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      try {
        const data = JSON.parse(line.trim());
        events.push({
          id: data.id || `event_${sequence}`,
          type: data.type || data.event_type || "unknown",
          timestamp: data.timestamp || data.time,
          data,
          sequence: sequence++,
        });
      } catch {
        // Skip invalid JSON lines
      }
    }
  } else if (format === "json") {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          events.push({
            id: item.id || `event_${sequence}`,
            type: item.type || item.event_type || "unknown",
            timestamp: item.timestamp || item.time,
            data: item,
            sequence: sequence++,
          });
        }
      }
    } catch {
      // Invalid JSON
    }
  } else {
    // Text format - try to parse line by line
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.trim()) {
        events.push({
          id: `event_${sequence}`,
          type: "log",
          data: { text: line.trim() },
          sequence: sequence++,
        });
      }
    }
  }

  return events;
}

function linkToolCalls(events: ParsedEvent[]): ToolInteraction[] {
  const interactions: ToolInteraction[] = [];
  const toolCallMap = new Map<string, ParsedEvent>();
  const toolResultMap = new Map<string, ParsedEvent>();

  // First pass: identify tool calls and results
  for (const event of events) {
    const type = event.type.toLowerCase();
    if (type.includes("tool") && type.includes("call")) {
      const toolCallId = extractToolCallId(event);
      if (toolCallId) {
        toolCallMap.set(toolCallId, event);
      }
    }
    if (type.includes("tool") && type.includes("result")) {
      const toolCallId = extractToolCallId(event);
      if (toolCallId) {
        toolResultMap.set(toolCallId, event);
      }
    }
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
      toolCallId,
      toolName,
      args,
      argsRaw,
      result,
      resultSummary,
      status,
      eventIds: resultEvent
        ? [callEvent.id, resultEvent.id]
        : [callEvent.id],
      timestamp: callEvent.timestamp,
    });
  }

  // Also check for orphan results
  for (const [toolCallId, resultEvent] of toolResultMap.entries()) {
    if (!toolCallMap.has(toolCallId)) {
      interactions.push({
        toolCallId,
        toolName: "unknown",
        args: {},
        status: "missing",
        eventIds: [resultEvent.id],
        timestamp: resultEvent.timestamp,
      });
    }
  }

  return interactions;
}

function extractToolCallId(event: ParsedEvent): string | null {
  return (
    event.data.tool_call_id ||
    event.data.toolCallId ||
    event.data.id ||
    null
  );
}

function extractToolName(event: ParsedEvent): string {
  return (
    event.data.tool_name ||
    event.data.toolName ||
    event.data.name ||
    "unknown"
  );
}

function extractToolArgs(event: ParsedEvent): Record<string, unknown> {
  return (
    event.data.args ||
    event.data.arguments ||
    event.data.input ||
    {}
  );
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
  return (
    data.task ||
    data.task_text ||
    data.text ||
    data.content ||
    data.message ||
    null
  );
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
        redactedStr = redactedStr.replace(pattern, (match) => {
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
      eventIds: [e.id],
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
        eventIds: interaction.eventIds,
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
          eventIds: [finalEvents[finalEvents.length - 1].id],
        }
      : undefined;

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
    toolInteractions: topInteractions,
    errors: errors.slice(0, 20), // Limit errors
    retries: retries.slice(0, 10), // Limit retries
    finalOutput,
    metrics,
    ruleFlags: ruleFlags.map((f) => ({
      flagType: f.flagType,
      severity: f.severity as "low" | "medium" | "high",
      message: f.message,
      evidenceEventIds: f.evidenceEventIds,
    })),
    redactionReport,
  };

  // Enforce size bounds
  let packetJson = JSON.stringify(packet);
  let packetSizeBytes = new TextEncoder().encode(packetJson).length;

  if (packetSizeBytes > MAX_PACKET_SIZE_BYTES) {
    // Truncate tool interactions further
    const targetSize = MAX_PACKET_SIZE_BYTES * 0.9; // 90% of max
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

