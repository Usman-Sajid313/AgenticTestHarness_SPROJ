import { prisma } from "@/lib/prisma";
import RunView, { type Evaluation as RunViewEvaluation } from "@/app/components/runs/RunView";
import type { MetricBreakdown, Evaluation } from "@/types/evaluation";

export default async function RunPage(context: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await context.params;

  const run = await prisma.agentRun.findUnique({
    where: { id },
    include: {
      evaluations: true,
      project: true,
      traceSummary: true,
      metrics: true,
      ruleFlags: true,
      judgePacket: true,
    },
  });

  if (!run) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p>Run not found.</p>
      </main>
    );
  }

  let evaluation: Evaluation | null = null;

  if (run.evaluations.length > 0) {
    const ev = run.evaluations[0];

    if (ev.status === "COMPLETED") {
      let metricBreakdown = ev.metricBreakdown as MetricBreakdown | null;

      if (!metricBreakdown && ev.finalScorecard) {
        try {
          const scorecard = typeof ev.finalScorecard === 'string'
            ? JSON.parse(ev.finalScorecard)
            : ev.finalScorecard as {
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

          for (const [key, dim] of Object.entries(scorecard.dimensions || {})) {
            const dimTyped = dim as {
              score: number;
              reasoning: string;
              strengths?: string[];
              weaknesses?: string[];
            };
            dimensions[key] = {
              score: dimTyped.score,
              summary: dimTyped.reasoning,
              strengths: (dimTyped.strengths && dimTyped.strengths.length > 0)
                ? dimTyped.strengths.join("; ")
                : (scorecard.strengths?.filter((s: string) =>
                    s.toLowerCase().includes(key.toLowerCase()) ||
                    dimTyped.reasoning.toLowerCase().includes(s.toLowerCase())
                  ).join("; ") || undefined),
              weaknesses: (dimTyped.weaknesses && dimTyped.weaknesses.length > 0)
                ? dimTyped.weaknesses.join("; ")
                : (scorecard.weaknesses?.filter((w: string) =>
                    w.toLowerCase().includes(key.toLowerCase()) ||
                    dimTyped.reasoning.toLowerCase().includes(w.toLowerCase())
                  ).join("; ") || undefined),
            };
          }

          metricBreakdown = {
            overallComment: ev.summary ||
              `Score: ${scorecard.overallScore}/100. ` +
              (scorecard.strengths?.length ? `Strengths: ${scorecard.strengths.join("; ")}. ` : "") +
              (scorecard.weaknesses?.length ? `Areas for improvement: ${scorecard.weaknesses.join("; ")}.` : ""),
            dimensions,
          };
        } catch (error) {
          console.error("Failed to convert finalScorecard to metricBreakdown:", error);
        }
      }

      evaluation = {
        id: ev.id,
        status: ev.status,
        totalScore: ev.totalScore,
        summary: ev.summary,
        createdAt: ev.createdAt,
        updatedAt: ev.updatedAt,
        metricBreakdown,
        geminiJudgement: ev.geminiJudgement,
        groqJudgement: ev.groqJudgement,
        finalScorecard: ev.finalScorecard,
        confidence: ev.confidence,
      };
    }
  }

  return (
    <main className="relative min-h-screen w-full bg-black">
      <div className="absolute inset-0 bg-deep-space" />
      <div className="absolute inset-0 bg-deep-space-anim opacity-70" />

      <div className="relative mx-auto max-w-5xl px-6 py-16">
        <RunView initialRun={run} initialEvaluation={evaluation as RunViewEvaluation | null} />
      </div>
    </main>
  );
}
