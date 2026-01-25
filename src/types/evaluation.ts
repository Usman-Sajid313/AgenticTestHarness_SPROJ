export type DimensionResult = {
  score: number;
  strengths: string;
  weaknesses: string;
};

export type MetricBreakdown = {
  overallComment: string;
  dimensions: Record<string, {
    score: number;
    strengths?: string;
    weaknesses?: string;
    summary?: string;
  }>;
};

export type Evaluation = {
  id: string;
  status: string;
  totalScore: number | null;
  summary: string | null;
  metricBreakdown: MetricBreakdown | null;
  geminiJudgement?: unknown;
  groqJudgement?: unknown;
  finalScorecard?: unknown;
  confidence?: number | null;
  createdAt: Date;
  updatedAt: Date;
};
