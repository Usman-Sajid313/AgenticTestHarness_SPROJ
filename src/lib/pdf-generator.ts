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

export async function generateRunPDF(data: EvaluationData): Promise<void> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - 2 * margin;
  let yPos = margin;

  const checkPageBreak = (requiredHeight: number) => {
    if (yPos + requiredHeight > pageHeight - margin) {
      doc.addPage();
      yPos = margin;
    }
  };

  doc.setFontSize(24);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.text("Evaluation Report", margin, yPos);
  yPos += 15;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.setFont("helvetica", "normal");
  doc.text(`Run ID: ${data.runId}`, margin, yPos);
  yPos += 6;
  doc.text(`Created: ${new Date(data.createdAt).toLocaleString()}`, margin, yPos);
  yPos += 6;
  if (data.completedAt) {
    doc.text(`Completed: ${new Date(data.completedAt).toLocaleString()}`, margin, yPos);
    yPos += 6;
  }
  if (data.projectName) {
    doc.text(`Project: ${data.projectName}`, margin, yPos);
    yPos += 6;
  }
  yPos += 10;

  if (data.totalScore !== null) {
    checkPageBreak(40);
    const score = Math.round(data.totalScore);

    doc.setFillColor(139, 92, 246);
    doc.rect(margin, yPos, 40, 40, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text(score.toString(), margin + 20, yPos + 25, { align: "center" });

    if (data.metricBreakdown?.overallComment) {
      doc.setFontSize(12);
      doc.setTextColor(50, 50, 50);
      doc.setFont("helvetica", "normal");
      const commentLines = doc.splitTextToSize(data.metricBreakdown.overallComment, contentWidth - 50);
      doc.text(commentLines, margin + 50, yPos + 15);
      yPos += Math.max(40, commentLines.length * 6);
    } else {
      yPos += 40;
    }
    yPos += 10;
  }

  if (data.confidence !== null && data.confidence < 0.7) {
    checkPageBreak(15);
    doc.setFillColor(234, 179, 8);
    doc.rect(margin, yPos, contentWidth, 12, "F");
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.text(
      `⚠️ Low confidence evaluation (${Math.round(data.confidence * 100)}%). Judges disagreed significantly.`,
      margin + 5,
      yPos + 8
    );
    yPos += 18;
  }

  if (data.metricBreakdown?.dimensions) {
    const dimensions = Object.entries(data.metricBreakdown.dimensions);

    for (const [key, dim] of dimensions) {
      checkPageBreak(60);

      doc.setFillColor(240, 240, 240);
      doc.rect(margin, yPos, contentWidth, 8, "F");

      const dimensionName = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text(dimensionName, margin + 5, yPos + 6);

      doc.setFontSize(12);
      doc.setTextColor(139, 92, 246);
      doc.setFont("helvetica", "bold");
      doc.text(`${dim.score} / 100`, pageWidth - margin - 30, yPos + 6);
      yPos += 12;

      if (dim.summary) {
        checkPageBreak(20);
        doc.setFontSize(10);
        doc.setTextColor(50, 50, 50);
        doc.setFont("helvetica", "normal");
        const summaryLines = doc.splitTextToSize(dim.summary, contentWidth);
        doc.text(summaryLines, margin + 5, yPos + 5);
        yPos += summaryLines.length * 5 + 5;
      }

      checkPageBreak(30);
      const colWidth = (contentWidth - 10) / 2;

      if (dim.strengths) {
        doc.setFontSize(9);
        doc.setTextColor(16, 185, 129);
        doc.setFont("helvetica", "bold");
        doc.text("What went well", margin + 5, yPos + 5);
        doc.setFontSize(8);
        doc.setTextColor(50, 50, 50);
        doc.setFont("helvetica", "normal");
        const strengthsLines = doc.splitTextToSize(dim.strengths, colWidth - 10);
        doc.text(strengthsLines, margin + 5, yPos + 10);
      }

      if (dim.weaknesses) {
        doc.setFontSize(9);
        doc.setTextColor(251, 113, 133);
        doc.setFont("helvetica", "bold");
        doc.text("Where to improve", margin + colWidth + 5, yPos + 5);
        doc.setFontSize(8);
        doc.setTextColor(50, 50, 50);
        doc.setFont("helvetica", "normal");
        const weaknessesLines = doc.splitTextToSize(dim.weaknesses, colWidth - 10);
        doc.text(weaknessesLines, margin + colWidth + 5, yPos + 10);
      }

      yPos += 35;
    }
  }

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: "center" }
    );
    doc.text(
      `Generated on ${new Date().toLocaleString()}`,
      margin,
      pageHeight - 10
    );
  }

  const filename = `evaluation-${data.runId.slice(0, 12)}-${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(filename);
}

