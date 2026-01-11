import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { MetricBreakdown } from "@/types/evaluation";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const run = await prisma.agentRun.findUnique({
    where: { id },
    include: {
      evaluations: true,
      project: true,
      logfiles: true,
      traceSummary: true,
      metrics: true,
      ruleFlags: true,
      judgePacket: true,
    },
  });

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  let evaluation = run.evaluations[0] ?? null;
  if (evaluation && evaluation.finalScorecard) {
    try {
      const scorecard = typeof evaluation.finalScorecard === 'string'
        ? JSON.parse(evaluation.finalScorecard)
        : evaluation.finalScorecard as {
          overallScore: number;
          confidence: number;
          dimensions: Record<string, {
            score: number;
            reasoning: string;
            evidenceEventIds: string[];
          }>;
          strengths: string[];
          weaknesses: string[];
          missingData?: string[];
        };

      const dimensions: Record<string, { score: number; summary?: string; strengths?: string; weaknesses?: string }> = {};

      for (const [key, dimValue] of Object.entries(scorecard.dimensions || {})) {
        const dim = dimValue as {
          score: number;
          reasoning: string;
          evidenceEventIds: string[];
          strengths?: string[];
          weaknesses?: string[];
        };
        dimensions[key] = {
          score: dim.score,
          summary: dim.reasoning,
          strengths: (dim.strengths && dim.strengths.length > 0)
            ? dim.strengths.join("; ")
            : (scorecard.strengths?.filter((s: string) =>
                s.toLowerCase().includes(key.toLowerCase()) ||
                dim.reasoning.toLowerCase().includes(s.toLowerCase())
              ).join("; ") || undefined),
          weaknesses: (dim.weaknesses && dim.weaknesses.length > 0)
            ? dim.weaknesses.join("; ")
            : (scorecard.weaknesses?.filter((w: string) =>
                w.toLowerCase().includes(key.toLowerCase()) ||
                dim.reasoning.toLowerCase().includes(w.toLowerCase())
              ).join("; ") || undefined),
        };
      }

      const metricBreakdown = {
        overallComment: evaluation.summary ||
          `Score: ${scorecard.overallScore}/100. ` +
          (scorecard.strengths?.length ? `Strengths: ${scorecard.strengths.join("; ")}. ` : "") +
          (scorecard.weaknesses?.length ? `Areas for improvement: ${scorecard.weaknesses.join("; ")}.` : ""),
        dimensions,
      };

      evaluation = {
        ...evaluation,
        metricBreakdown: metricBreakdown as MetricBreakdown,
      };
    } catch (error) {
      console.error("Failed to convert finalScorecard to metricBreakdown:", error);
    }
  }

  return NextResponse.json({
    run,
    evaluation,
    traceSummary: run.traceSummary,
    metrics: run.metrics,
    ruleFlags: run.ruleFlags,
    judgePacket: run.judgePacket ? {
      ...run.judgePacket,
      packet: run.judgePacket.packet ? JSON.parse(run.judgePacket.packet) : null,
    } : null,
  });
}
