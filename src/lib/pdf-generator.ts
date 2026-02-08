import jsPDF from "jspdf";

type EvaluationData = {
  runId: string;
  projectName?: string;
  createdAt: string;
  completedAt?: string;
  totalScore: number | null;
  confidence: number | null;
  summary: string | null;
  metricBreakdown: {
    overallComment: string;
    dimensions: Record<string, {
      score: number;
      summary?: string;
      strengths?: string;
      weaknesses?: string;
    }>;
  } | null;
};

const MARGIN = 20;
const FOOTER_HEIGHT = 18;
const LINE_HEIGHT = 5;
const SECTION_GAP = 14;
const BULLET_INDENT = 6;

/** Split "item1; item2" into trimmed array; single item returns one element. */
function splitList(text: string): string[] {
  if (!text || !text.trim()) return [];
  return text
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function generateRunPDF(data: EvaluationData): Promise<void> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - 2 * MARGIN;
  const safeBottom = pageHeight - MARGIN - FOOTER_HEIGHT;
  let yPos = MARGIN;

  const checkPageBreak = (requiredHeight: number) => {
    if (yPos + requiredHeight > safeBottom) {
      doc.addPage();
      yPos = MARGIN;
    }
  };

  // ---- Header ----
  doc.setFontSize(22);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.text("Evaluation Report", MARGIN, yPos);
  yPos += 12;

  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.setFont("helvetica", "normal");
  doc.text(`Run ID: ${data.runId}`, MARGIN, yPos);
  yPos += LINE_HEIGHT + 2;
  doc.text(`Created: ${new Date(data.createdAt).toLocaleString()}`, MARGIN, yPos);
  yPos += LINE_HEIGHT;
  if (data.completedAt) {
    doc.text(`Completed: ${new Date(data.completedAt).toLocaleString()}`, MARGIN, yPos);
    yPos += LINE_HEIGHT;
  }
  if (data.projectName) {
    doc.text(`Project: ${data.projectName}`, MARGIN, yPos);
    yPos += LINE_HEIGHT;
  }
  yPos += SECTION_GAP;

  // ---- Overall Score (score and summary clearly separated) ----
  if (data.totalScore !== null) {
    const score = Math.round(data.totalScore);

    // Score block: label + score box on one row
    checkPageBreak(50);
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.text("Overall Score", MARGIN, yPos + 8);

    const scoreBoxSize = 36;
    const scoreBoxX = pageWidth - MARGIN - scoreBoxSize;
    doc.setFillColor(139, 92, 246);
    doc.rect(scoreBoxX, yPos, scoreBoxSize, scoreBoxSize, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(score.toString(), scoreBoxX + scoreBoxSize / 2, yPos + scoreBoxSize / 2 + 2, {
      align: "center",
      baseline: "middle",
    });
    yPos += scoreBoxSize + SECTION_GAP;

    // Summary full width below the score row
    if (data.metricBreakdown?.overallComment) {
      checkPageBreak(30);
      doc.setFontSize(10);
      doc.setTextColor(50, 50, 50);
      doc.setFont("helvetica", "normal");
      const commentLines = doc.splitTextToSize(
        data.metricBreakdown.overallComment,
        contentWidth
      );
      doc.text(commentLines, MARGIN, yPos + LINE_HEIGHT);
      yPos += commentLines.length * LINE_HEIGHT + SECTION_GAP;
    }
  }

  // ---- Low confidence banner ----
  if (data.confidence !== null && data.confidence < 0.7) {
    checkPageBreak(16);
    doc.setFillColor(253, 224, 71);
    doc.rect(MARGIN, yPos, contentWidth, 12, "F");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.text(
      `Low confidence evaluation (${Math.round(data.confidence * 100)}%). Judges disagreed significantly.`,
      MARGIN + 4,
      yPos + 8
    );
    yPos += 18;
  }

  // ---- Dimensions ----
  if (data.metricBreakdown?.dimensions) {
    const dimensions = Object.entries(data.metricBreakdown.dimensions);
    const colWidth = (contentWidth - 8) / 2;

    for (const [key, dim] of dimensions) {
      const dimensionName = key
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

      // Section header bar + title + score (right-aligned)
      checkPageBreak(40);
      doc.setFillColor(245, 245, 245);
      doc.rect(MARGIN, yPos, contentWidth, 10, "F");
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text(dimensionName, MARGIN + 4, yPos + 7);
      doc.setFontSize(11);
      doc.setTextColor(139, 92, 246);
      doc.text(`${dim.score} / 100`, pageWidth - MARGIN - 4, yPos + 7, {
        align: "right",
      });
      yPos += 14;

      // Summary
      if (dim.summary) {
        const summaryLines = doc.splitTextToSize(dim.summary, contentWidth);
        const summaryHeight = summaryLines.length * LINE_HEIGHT + 4;
        checkPageBreak(summaryHeight);
        doc.setFontSize(9);
        doc.setTextColor(60, 60, 60);
        doc.setFont("helvetica", "normal");
        doc.text(summaryLines, MARGIN, yPos + LINE_HEIGHT);
        yPos += summaryHeight;
      }

      // What went well / Where to improve (two columns, bullet lists)
      const strengthsItems = splitList(dim.strengths ?? "");
      const weaknessesItems = splitList(dim.weaknesses ?? "");
      const bulletWidth = colWidth - BULLET_INDENT - 4;
      const leftX = MARGIN + BULLET_INDENT;
      const rightX = MARGIN + colWidth + 4 + BULLET_INDENT;

      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(16, 185, 129);
      doc.text("What went well", MARGIN, yPos + 5);
      doc.setTextColor(220, 38, 127);
      doc.text("Where to improve", MARGIN + colWidth + 4, yPos + 5);
      yPos += 8;

      doc.setFontSize(8);
      doc.setTextColor(50, 50, 50);
      doc.setFont("helvetica", "normal");

      const maxRows = Math.max(strengthsItems.length, weaknessesItems.length);
      for (let i = 0; i < maxRows; i++) {
        const leftItem = strengthsItems[i];
        const rightItem = weaknessesItems[i];
        const leftLines = leftItem
          ? doc.splitTextToSize(`• ${leftItem}`, bulletWidth)
          : [];
        const rightLines = rightItem
          ? doc.splitTextToSize(`• ${rightItem}`, bulletWidth)
          : [];
        const rowHeight =
          Math.max(leftLines.length, rightLines.length) * LINE_HEIGHT + 2;
        checkPageBreak(rowHeight + 2);
        if (leftItem) doc.text(leftLines, leftX, yPos + LINE_HEIGHT);
        if (rightItem) doc.text(rightLines, rightX, yPos + LINE_HEIGHT);
        yPos += rowHeight;
      }

      yPos += SECTION_GAP;
    }
  }

  // ---- Footer on every page ----
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Generated on ${new Date().toLocaleString()}`,
      MARGIN,
      pageHeight - 10
    );
    doc.text(
      `Page ${i} of ${totalPages}`,
      pageWidth - MARGIN,
      pageHeight - 10,
      { align: "right" }
    );
  }

  const filename = `evaluation-${data.runId.slice(0, 12)}-${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(filename);
}
