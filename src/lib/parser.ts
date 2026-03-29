import { prisma } from "@/lib/prisma";
import { downloadFile } from "@/lib/storage";
import type { Prisma } from "@prisma/client";

const PARSER_VERSION = "1.2.1";
const MAX_PACKET_SIZE_BYTES = 500000;
const TARGET_JUDGE_PACKET_BYTES = 200000;
const MAX_TOOL_INTERACTIONS = 50;
const MAX_STORED_EVENTS = 5000;
const MAX_TRACE_EVENTS_IN_PACKET = 200;
const MAX_EVENT_DATA_CHARS = 400;
const MAX_TOOL_INTERACTION_ARGS_CHARS = 500;
const MAX_TOOL_INTERACTION_RESULT_CHARS = 1200;
const MAX_TOOL_INTERACTION_SUMMARY_CHARS = 300;

export interface ParsedEvent {
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

export interface ParseContext {
  sourceType?: string;
  formatHint?: string;
  mappingConfig?: Record<string, unknown> | null;
}

export interface StrictParseReport {
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

export interface AdapterParseResult {
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

// ---------------------------------------------------------------------------
// Main exported function
// ---------------------------------------------------------------------------

export async function parseRun(params: {
  runId: string;
  ingestionId?: string;
  sourceType?: string;
  formatHint?: string;
  mappingConfig?: Record<string, unknown> | null;
}): Promise<{
  success: boolean;
  runId: string;
  ingestionId?: string;
  status: string;
  packetSizeBytes: number;
  parserConfidence: number;
}> {
  const { runId, ingestionId, sourceType, formatHint, mappingConfig } = params;

  if (!runId) {
    throw new Error("runId is required");
  }

  console.log("[parse_run] Starting for runId=", runId);

  // Get run
  const run = await prisma.agentRun.findUnique({
    where: { id: runId },
    select: { id: true, projectId: true, status: true, createdAt: true, updatedAt: true },
  });

  if (!run) {
    throw new Error("Run not found");
  }

  if (run.status !== "UPLOADED") {
    throw new Error(`Run is not UPLOADED (current: ${run.status})`);
  }

  // Get logfile
  const logfile = await prisma.runLogfile.findFirst({
    where: { runId },
  });

  if (!logfile) {
    throw new Error("No logfile found for this run");
  }

  let latestIngestion: {
    id: string;
    sourceType: string;
    formatHint: string | null;
    mappingConfig: Record<string, unknown> | null;
  } | null = null;
  try {
    const ingestionRecord = await prisma.runIngestion.findFirst({
      where: { runId },
      orderBy: { createdAt: "desc" },
      select: { id: true, sourceType: true, formatHint: true, mappingConfig: true },
    });
    if (ingestionRecord) {
      latestIngestion = {
        id: ingestionRecord.id,
        sourceType: ingestionRecord.sourceType,
        formatHint: ingestionRecord.formatHint,
        mappingConfig: ingestionRecord.mappingConfig as Record<string, unknown> | null,
      };
    }
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
  await prisma.agentRun.update({ where: { id: runId }, data: { status: "PARSING" } });
  if (resolvedIngestionId) {
    try {
      await prisma.runIngestion.update({
        where: { id: resolvedIngestionId },
        data: {
          status: "PROCESSING",
          startedAt: new Date(),
          failureDetails: null,
          updatedAt: new Date(),
        },
      });
    } catch (ingestionUpdateError) {
      console.warn("RunIngestion start update skipped:", ingestionUpdateError);
    }
  }

  // Download logfile from storage
  let rawText: string;
  try {
    const fileBuffer = await downloadFile(logfile.storageKey);
    rawText = fileBuffer.toString("utf-8");
  } catch {
    await prisma.agentRun.update({ where: { id: runId }, data: { status: "FAILED" } });
    if (resolvedIngestionId) {
      try {
        await prisma.runIngestion.update({
          where: { id: resolvedIngestionId },
          data: {
            status: "FAILED",
            failureDetails: "Failed to download logfile",
            updatedAt: new Date(),
          },
        });
      } catch (ingestionFailError) {
        console.warn("RunIngestion failure update skipped:", ingestionFailError);
      }
    }
    throw new Error("Failed to download logfile");
  }

  try {
    // Normalize encoding and newlines
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
    await prisma.runEvent.deleteMany({ where: { runId } });
    for (const event of redactedEvents.slice(0, MAX_STORED_EVENTS)) {
      await prisma.runEvent.create({
        data: {
          id: crypto.randomUUID(),
          runId,
          eventType: event.type,
          eventData: event.data as Prisma.InputJsonValue,
          timestamp: event.timestamp ? new Date(event.timestamp) : null,
          sequence: event.sequence,
          createdAt: new Date(),
        },
      });
    }

    // Store normalized trace (existing write path)
    const parseReportData = {
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
    };
    await prisma.runTraceSummary.upsert({
      where: { runId },
      create: {
        id: crypto.randomUUID(),
        runId,
        normalizedTrace: JSON.stringify(redactedEvents),
        parserVersion: PARSER_VERSION,
        parseReport: parseReportData as unknown as Prisma.InputJsonValue,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      update: {
        normalizedTrace: JSON.stringify(redactedEvents),
        parserVersion: PARSER_VERSION,
        parseReport: parseReportData as unknown as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });

    // Store metrics
    await prisma.runMetrics.upsert({
      where: { runId },
      create: {
        id: crypto.randomUUID(),
        runId,
        totalSteps: steps.length,
        totalToolCalls: metrics.totalToolCalls,
        totalErrors: metrics.totalErrors,
        totalRetries: metrics.totalRetries,
        totalDurationMs: metrics.totalDurationMs ?? null,
        parserVersion: PARSER_VERSION,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      update: {
        totalSteps: steps.length,
        totalToolCalls: metrics.totalToolCalls,
        totalErrors: metrics.totalErrors,
        totalRetries: metrics.totalRetries,
        totalDurationMs: metrics.totalDurationMs ?? null,
        parserVersion: PARSER_VERSION,
        updatedAt: new Date(),
      },
    });

    // Store rule flags
    await prisma.runRuleFlag.deleteMany({ where: { runId } });
    if (ruleFlags.length > 0) {
      for (const flag of ruleFlags) {
        await prisma.runRuleFlag.create({
          data: {
            id: crypto.randomUUID(),
            runId,
            flagType: flag.flagType,
            severity: flag.severity,
            message: flag.message,
            evidenceEventIds: flag.evidenceEventIds,
            createdAt: new Date(),
          },
        });
      }
    }

    // Store judge packet
    await prisma.runJudgePacket.upsert({
      where: { runId },
      create: {
        id: crypto.randomUUID(),
        runId,
        packet: packetJson,
        packetSizeBytes,
        parserVersion: PARSER_VERSION,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      update: {
        packet: packetJson,
        packetSizeBytes,
        parserVersion: PARSER_VERSION,
        updatedAt: new Date(),
      },
    });

    if (resolvedIngestionId) {
      try {
        await prisma.runIngestion.update({
          where: { id: resolvedIngestionId },
          data: {
            status: "COMPLETED",
            parserVersion: PARSER_VERSION,
            parserConfidence: adapterResult.strictReport.confidence,
            strictReport: adapterResult.strictReport as unknown as Prisma.InputJsonValue,
            sourceMeta: adapterResult.sourceMeta as Prisma.InputJsonValue,
            completedAt: new Date(),
            updatedAt: new Date(),
          },
        });
      } catch (ingestionCompleteError) {
        console.warn("RunIngestion completion update skipped:", ingestionCompleteError);
      }
    }

    // Update run status
    await prisma.agentRun.update({ where: { id: runId }, data: { status: "READY_FOR_JUDGING" } });

    console.log("[parse_run] Success: runId=", runId, "status=READY_FOR_JUDGING");

    return {
      success: true,
      runId,
      ingestionId: resolvedIngestionId ?? undefined,
      status: "READY_FOR_JUDGING",
      packetSizeBytes,
      parserConfidence: adapterResult.strictReport.confidence,
    };
  } catch (dbError) {
    console.error("[parse_run] Database error:", dbError);
    try {
      await prisma.agentRun.update({ where: { id: runId }, data: { status: "FAILED" } });
      if (resolvedIngestionId) {
        try {
          await prisma.runIngestion.update({
            where: { id: resolvedIngestionId },
            data: {
              status: "FAILED",
              failureDetails: dbError instanceof Error ? dbError.message : String(dbError),
              updatedAt: new Date(),
            },
          });
        } catch (ingestionFailError) {
          console.warn("RunIngestion DB failure update skipped:", ingestionFailError);
        }
      }
    } catch {
      // Ignore cleanup errors
    }
    throw new Error(
      `Database operation failed: ${dbError instanceof Error ? dbError.message : String(dbError)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Pure logic helpers (ported verbatim from the edge function)
// ---------------------------------------------------------------------------

export function previewParseLog(params: {
  text: string;
  sourceType?: string;
  formatHint?: string;
  mappingConfig?: Record<string, unknown> | null;
}): {
  normalizedText: string;
  events: ParsedEvent[];
  strictReport: StrictParseReport;
  sourceMeta: Record<string, unknown>;
  toolInteractions: ToolInteraction[];
  steps: Array<{
    stepNumber: number;
    description: string;
    keyEventIds: string[];
    timestamp?: string;
  }>;
  task: {
    text: string;
    confidence: number;
    sourceEventIds: string[];
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
  redactionReport: {
    patternsMatched: string[];
    redactedCount: number;
  };
  judgePacket: JudgePacket;
} {
  const normalizedText = normalizeText(params.text);
  const adapterResult = parseWithAdapters(normalizedText, {
    sourceType: params.sourceType,
    formatHint: params.formatHint,
    mappingConfig: params.mappingConfig,
  });
  const events = adapterResult.events;
  const toolInteractions = linkToolCalls(events);
  const steps = segmentSteps(events);
  const task = extractTask(events);
  const metrics = computeMetrics(events, toolInteractions);
  const ruleFlags = computeRuleFlags(events, toolInteractions);
  const { redactedEvents, redactionReport } = redactSecrets(events);
  const judgePacket = buildJudgePacket(
    events,
    redactedEvents,
    toolInteractions,
    steps,
    task,
    metrics,
    ruleFlags,
    redactionReport,
    adapterResult.strictReport.detectedFormat
  );

  return {
    normalizedText,
    events,
    strictReport: adapterResult.strictReport,
    sourceMeta: adapterResult.sourceMeta,
    toolInteractions,
    steps,
    task,
    metrics,
    ruleFlags,
    redactionReport,
    judgePacket,
  };
}

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
  const genericSourceTypes = new Set(["generic_jsonl", "generic_json", "generic", "auto"]);

  const adapters: IngestionAdapter[] = [
    openAIAgentsAdapter(),
    langChainAdapter(),
    publicDataTrajectoryAdapter(),
    genericJsonlAdapter(),
  ];

  const bySourceType = genericSourceTypes.has(requestedSourceType)
    ? undefined
    : adapters.find((adapter) => adapter.sourceTypes.includes(requestedSourceType));
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

export function parseLogTextWithAdapters(
  text: string,
  context: ParseContext = {},
): AdapterParseResult {
  return parseWithAdapters(text, context);
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

function publicDataTrajectoryAdapter(): IngestionAdapter {
  return {
    name: "public_data_trajectory",
    sourceTypes: ["public_data", "public_data_trajectory", "agent_public_data"],
    canHandle: (text, detectedFormat) => {
      if (detectedFormat !== "json") return false;
      return (
        text.includes('"query"') &&
        text.includes('"final_answer"') &&
        (text.includes('"tool list"') || text.includes('"tool_list"'))
      );
    },
    parse: (text, context, detectedFormat) =>
      parsePublicDataTrajectories(text, detectedFormat, context.mappingConfig),
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

function parsePublicDataTrajectories(
  text: string,
  format: string,
  mappingConfig?: Record<string, unknown> | null
): AdapterParseResult {
  const events: ParsedEvent[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  let totalInputRecords = 0;
  let trajectoryCount = 0;
  const selectedTrajectoryIndex = parsePublicDataTrajectoryIndex(mappingConfig);

  if (format !== "json") {
    warnings.push("public_data_trajectory adapter expected JSON; falling back to empty parse");
    return {
      events,
      sourceMeta: {
        adapter: "public_data_trajectory",
        format,
        trajectoryCount,
      },
      strictReport: {
        adapterUsed: "public_data_trajectory",
        detectedFormat: format,
        sourceTypeRequested: "public_data_trajectory",
        confidence: 0,
        totalInputRecords,
        parsedEvents: 0,
        droppedRecords: 0,
        timestampCoverage: 0,
        typedEventCoverage: 0,
        warnings,
        errors,
      },
    };
  }

  try {
    const parsed = JSON.parse(text);
    const allTrajectories = extractPublicDataTrajectoryRecords(parsed);
    totalInputRecords = allTrajectories.length;

    let trajectories = allTrajectories;
    if (selectedTrajectoryIndex !== undefined) {
      if (
        selectedTrajectoryIndex < 0 ||
        selectedTrajectoryIndex >= allTrajectories.length
      ) {
        warnings.push(
          `Requested publicDataTrajectoryIndex ${selectedTrajectoryIndex} is out of range (0-${Math.max(0, allTrajectories.length - 1)})`
        );
        trajectories = [];
      } else {
        trajectories = [allTrajectories[selectedTrajectoryIndex]!];
      }
    }
    trajectoryCount = trajectories.length;

    if (trajectories.length === 0) {
      warnings.push(
        "JSON payload did not match public_data trajectory shape (expected objects with query, tool list, and final_answer)"
      );
    }

    for (let trajectoryIndex = 0; trajectoryIndex < trajectories.length; trajectoryIndex++) {
      const record = trajectories[trajectoryIndex];
      if (!record) continue;
      const trajectoryEvents = buildPublicDataTrajectoryEvents(
        record,
        trajectoryIndex,
        events.length,
        warnings
      );
      events.push(...trajectoryEvents);
    }
  } catch {
    errors.push("Invalid JSON payload");
  }

  return {
    events,
    sourceMeta: {
      adapter: "public_data_trajectory",
      format,
      trajectoryCount,
      selectedTrajectoryIndex,
    },
    strictReport: {
      adapterUsed: "public_data_trajectory",
      detectedFormat: format,
      sourceTypeRequested: "public_data_trajectory",
      confidence: 0,
      totalInputRecords,
      parsedEvents: events.length,
      droppedRecords: Math.max(0, totalInputRecords - trajectoryCount),
      timestampCoverage: 0,
      typedEventCoverage: 0,
      warnings,
      errors,
    },
  };
}

function extractPublicDataTrajectoryRecords(input: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(input)) {
    return input.filter(isPublicDataTrajectoryRecord);
  }

  if (!isObject(input)) {
    return [];
  }

  const root = input as Record<string, unknown>;
  if (isPublicDataTrajectoryRecord(root)) {
    return [root];
  }

  const arrayCandidate = firstArrayCandidate(root);
  if (!arrayCandidate) {
    return [];
  }

  return arrayCandidate.filter(isPublicDataTrajectoryRecord);
}

function parsePublicDataTrajectoryIndex(
  mappingConfig?: Record<string, unknown> | null
): number | undefined {
  if (!mappingConfig || !isObject(mappingConfig)) return undefined;

  const raw =
    mappingConfig.publicDataTrajectoryIndex ??
    mappingConfig.trajectoryIndex ??
    mappingConfig["public_data_trajectory_index"];

  if (typeof raw === "number" && Number.isInteger(raw)) {
    return raw;
  }

  if (typeof raw === "string" && raw.trim()) {
    const parsed = Number(raw);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function isPublicDataTrajectoryRecord(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) return false;
  const record = value as Record<string, unknown>;
  const hasQuery = typeof record.query === "string";
  const hasFinalAnswer = "final_answer" in record || "final answer" in record;
  const toolListValue =
    record["tool list"] ??
    record.tool_list ??
    record.toolList;
  const hasToolList = Array.isArray(toolListValue);
  return hasQuery && hasFinalAnswer && hasToolList;
}

function buildPublicDataTrajectoryEvents(
  record: Record<string, unknown>,
  trajectoryIndex: number,
  startingSequence: number,
  warnings: string[]
): ParsedEvent[] {
  const events: ParsedEvent[] = [];

  const generationInfo = isObject(record.generation_info)
    ? (record.generation_info as Record<string, unknown>)
    : null;
  const baseTimestamp =
    asString(generationInfo?.timestamp) ||
    asString(record.timestamp) ||
    asString(record.created_at) ||
    asString(record.createdAt);
  let timestampOffsetSeconds = 0;

  const nextTimestamp = () =>
    syntheticOffsetTimestamp(baseTimestamp, timestampOffsetSeconds++);

  const queryText = asString(record.query) || "";
  events.push({
    id: `traj_${trajectoryIndex}_user`,
    type: "user_message",
    timestamp: nextTimestamp(),
    sequence: startingSequence + events.length,
    data: {
      text: queryText,
      trajectory_index: trajectoryIndex,
      trajectory_type: asString(record.trajectory_type) || asString(record["trajectory type"]),
      domain: asString(record.domain),
      sequence_name: asString(record.sequence_name) || asString(record["sequence name"]),
      sequence_description:
        asString(record.sequence_description) || asString(record["sequence description"]),
      source_format: "public_data_trajectory",
    },
  });

  const rawToolList =
    record["tool list"] ??
    record.tool_list ??
    record.toolList;
  const toolList = Array.isArray(rawToolList) ? rawToolList : [];
  if (!Array.isArray(rawToolList)) {
    warnings.push(`Trajectory ${trajectoryIndex}: missing tool list array`);
  }

  for (let toolIndex = 0; toolIndex < toolList.length; toolIndex++) {
    const rawTool = toolList[toolIndex];
    if (!isObject(rawTool)) {
      warnings.push(`Trajectory ${trajectoryIndex}: skipped non-object tool entry at index ${toolIndex}`);
      continue;
    }

    const tool = rawTool as Record<string, unknown>;
    const toolCallId = `traj_${trajectoryIndex}_tool_${toolIndex}`;
    const toolName =
      asString(tool["tool name"]) ||
      asString(tool.tool_name) ||
      asString(tool.name) ||
      `tool_${toolIndex + 1}`;

    const requiredParamsRaw =
      tool["required parameters"] ??
      tool.required_parameters ??
      tool.requiredParams;
    const optionalParamsRaw =
      tool["optional parameters"] ??
      tool.optional_parameters ??
      tool.optionalParams;
    const requiredArgs = parameterListToObject(requiredParamsRaw);
    const optionalArgs = parameterListToObject(optionalParamsRaw);
    const args = { ...optionalArgs, ...requiredArgs };

    const executionStatusRaw =
      asString(tool.execution_status) ||
      asString(tool.executionStatus) ||
      inferPublicDataToolStatus(tool);
    const normalizedExecutionStatus = normalizePublicDataToolStatus(executionStatusRaw);

    events.push({
      id: `traj_${trajectoryIndex}_tool_${toolIndex}_start`,
      type: "tool_start",
      timestamp: nextTimestamp(),
      sequence: startingSequence + events.length,
      data: {
        tool_call_id: toolCallId,
        tool_name: toolName,
        args,
        required_parameters: requiredArgs,
        optional_parameters: optionalArgs,
        tool_description:
          asString(tool["tool description"]) || asString(tool.tool_description),
        api_name: asString(tool["API name"]) || asString(tool.api_name),
        domain_name: asString(tool["domain name"]) || asString(tool.domain_name),
        parent_tool_name:
          asString(tool["parent tool name"]) || asString(tool.parent_tool_name),
        execution_status: normalizedExecutionStatus,
        trajectory_index: trajectoryIndex,
        tool_index: toolIndex,
      },
    });

    const executedOutputValue =
      tool.executed_output ??
      tool.executedOutput ??
      tool.output ??
      null;
    const parsedOutput = parseStructuredOutputMaybe(executedOutputValue);
    const resultType =
      normalizedExecutionStatus === "error" || normalizedExecutionStatus === "timeout"
        ? "tool_end_error"
        : "tool_end";

    const resultData: Record<string, unknown> = {
      tool_call_id: toolCallId,
      tool_name: toolName,
      execution_status: normalizedExecutionStatus,
      trajectory_index: trajectoryIndex,
      tool_index: toolIndex,
      raw_output: stringifyUnknown(executedOutputValue),
    };
    if (parsedOutput !== undefined) {
      resultData.output = parsedOutput;
    }
    if (normalizedExecutionStatus === "error" || normalizedExecutionStatus === "timeout") {
      resultData.error = stringifyUnknown(executedOutputValue) || executionStatusRaw;
    }

    events.push({
      id: `traj_${trajectoryIndex}_tool_${toolIndex}_end`,
      type: resultType,
      timestamp: nextTimestamp(),
      sequence: startingSequence + events.length,
      data: resultData,
    });
  }

  const finalAnswerValue = record.final_answer ?? record["final answer"];
  const finalAnswer = normalizePublicDataFinalAnswer(finalAnswerValue);
  events.push({
    id: `traj_${trajectoryIndex}_assistant`,
    type: "assistant_message",
    timestamp: nextTimestamp(),
    sequence: startingSequence + events.length,
    data: {
      text: finalAnswer.text,
      reason: finalAnswer.reason,
      trajectory_index: trajectoryIndex,
      source_format: "public_data_trajectory",
    },
  });

  return events;
}

function parameterListToObject(value: unknown): Record<string, unknown> {
  if (!Array.isArray(value)) {
    return {};
  }

  const result: Record<string, unknown> = {};
  for (const item of value) {
    if (!isObject(item)) continue;
    const entry = item as Record<string, unknown>;
    const name = asString(entry.name) || asString(entry.key);
    if (!name) continue;
    result[name] = entry.value;
  }
  return result;
}

function inferPublicDataToolStatus(tool: Record<string, unknown>): string {
  const rawOutput =
    stringifyUnknown(tool.executed_output ?? tool.executedOutput ?? tool.output) || "";
  if (/^\s*error\b/i.test(rawOutput) || /failed after \d+ attempts/i.test(rawOutput)) {
    return "failed";
  }
  return "success";
}

function normalizePublicDataToolStatus(
  status: string | undefined
): "success" | "error" | "timeout" {
  const normalized = status?.toLowerCase().trim() || "success";
  if (normalized.includes("timeout")) return "timeout";
  if (normalized.includes("fail") || normalized.includes("error")) return "error";
  return "success";
}

function parseStructuredOutputMaybe(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!(trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.startsWith("\""))) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function stringifyUnknown(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizePublicDataFinalAnswer(value: unknown): {
  text: string;
  reason?: string;
} {
  if (typeof value === "string") {
    return { text: value };
  }

  if (isObject(value)) {
    const record = value as Record<string, unknown>;
    const text =
      asString(record.answer) ||
      asString(record.text) ||
      asString(record.final_answer) ||
      stringifyUnknown(value) ||
      "";
    const reason = asString(record.reason);
    return reason ? { text, reason } : { text };
  }

  return {
    text: stringifyUnknown(value) || "",
  };
}

function syntheticOffsetTimestamp(
  baseTimestamp: string | undefined,
  offsetSeconds: number
): string | undefined {
  if (!baseTimestamp) return undefined;
  const base = new Date(baseTimestamp);
  if (Number.isNaN(base.getTime())) return undefined;
  return new Date(base.getTime() + offsetSeconds * 1000).toISOString();
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

function truncateString(value: string | undefined, maxChars: number): string | undefined {
  if (!value) return value;
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars) + "...";
}

function truncateJsonValue(value: unknown, maxChars: number): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    if (value.length <= maxChars) return value;
    return { _truncated: true, _preview: value.slice(0, maxChars) + "..." };
  }

  try {
    const json = JSON.stringify(value);
    if (json.length <= maxChars) return value;
    return { _truncated: true, _preview: json.slice(0, maxChars) + "..." };
  } catch {
    const fallback = String(value);
    if (fallback.length <= maxChars) return fallback;
    return { _truncated: true, _preview: fallback.slice(0, maxChars) + "..." };
  }
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
  const redactValue = (value: unknown): unknown => {
    if (typeof value === "string") {
      let redacted = value;
      for (const pattern of patterns) {
        let matched = false;
        redacted = redacted.replace(new RegExp(pattern.source, pattern.flags), () => {
          matched = true;
          redactedCount++;
          return "[REDACTED]";
        });
        if (matched) {
          patternsMatched.push(pattern.source);
        }
      }
      return redacted;
    }

    if (Array.isArray(value)) {
      return value.map((item) => redactValue(item));
    }

    if (isObject(value)) {
      const result: Record<string, unknown> = {};
      for (const [key, nestedValue] of Object.entries(value)) {
        result[key] = redactValue(nestedValue);
      }
      return result;
    }

    return value;
  };

  const redactedEvents = events.map((event) => ({
    ...event,
    data: redactValue(event.data) as Record<string, unknown>,
  }));

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

  // Take top-K interactions and compact large fields to keep prompts manageable
  const topInteractions = prioritizedInteractions.slice(0, MAX_TOOL_INTERACTIONS);
  const compactInteractions = topInteractions.map((interaction) => ({
    ...interaction,
    args: truncateJsonValue(
      interaction.args,
      MAX_TOOL_INTERACTION_ARGS_CHARS
    ) as Record<string, unknown>,
    argsRaw: truncateString(interaction.argsRaw, MAX_TOOL_INTERACTION_ARGS_CHARS),
    result: truncateJsonValue(
      interaction.result,
      MAX_TOOL_INTERACTION_RESULT_CHARS
    ),
    resultSummary: truncateString(
      interaction.resultSummary,
      MAX_TOOL_INTERACTION_SUMMARY_CHARS
    ),
    eventIds: interaction.eventIds.map((id) => String(id)),
  }));

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
    toolInteractions: compactInteractions,
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

  // Enforce size bounds (target smaller than hard max to keep LLM prompts reliable)
  let packetJson = JSON.stringify(packet);
  let packetSizeBytes = new TextEncoder().encode(packetJson).length;
  const targetSize = Math.min(MAX_PACKET_SIZE_BYTES * 0.9, TARGET_JUDGE_PACKET_BYTES);

  if (packetSizeBytes > targetSize) {
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

    // If still large, strip heavy fields from tool interactions
    if (packetSizeBytes > targetSize) {
      for (const interaction of packet.toolInteractions) {
        interaction.result = undefined;
        interaction.argsRaw = truncateString(interaction.argsRaw, 200);
        interaction.args = truncateJsonValue(interaction.args, 200) as Record<string, unknown>;
        interaction.resultSummary = truncateString(interaction.resultSummary, 200);
      }
      packetJson = JSON.stringify(packet);
      packetSizeBytes = new TextEncoder().encode(packetJson).length;
    }

    // If still large, reduce trace and interactions further
    if (packetSizeBytes > targetSize) {
      if (packet.trace && packet.trace.length > 20) {
        packet.trace = packet.trace.slice(0, 20);
      }
      if (packet.toolInteractions.length > 5) {
        packet.toolInteractions = packet.toolInteractions.slice(0, 5);
      }
      packetJson = JSON.stringify(packet);
      packetSizeBytes = new TextEncoder().encode(packetJson).length;
    }
  }

  return packet;
}
