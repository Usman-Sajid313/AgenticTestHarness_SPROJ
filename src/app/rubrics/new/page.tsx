"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Dimension = {
  name: string;
  description: string;
  weight: number;
  scoringCriteria: Array<{
    scoreRange: [number, number];
    label: string;
    description: string;
  }>;
};

type RubricTemplate = {
  name: string;
  description: string;
  dimensions: Dimension[];
};

const TEMPLATES: Record<string, RubricTemplate> = {
  general: {
    name: "General AI Agent Evaluation",
    description: "Balanced rubric for evaluating general-purpose AI agents",
    dimensions: [
      {
        name: "Task Completion",
        description: "How well the agent completed the assigned task",
        weight: 0.3,
        scoringCriteria: [
          {
            scoreRange: [0, 3],
            label: "Incomplete",
            description: "Task largely incomplete or incorrect",
          },
          {
            scoreRange: [4, 6],
            label: "Partial",
            description: "Task partially completed with some errors",
          },
          {
            scoreRange: [7, 8],
            label: "Complete",
            description: "Task completed correctly",
          },
          {
            scoreRange: [9, 10],
            label: "Excellent",
            description: "Task completed with excellence and attention to detail",
          },
        ],
      },
      {
        name: "Efficiency",
        description: "Resource usage and number of steps taken",
        weight: 0.2,
        scoringCriteria: [
          {
            scoreRange: [0, 4],
            label: "Inefficient",
            description: "Excessive steps or resource waste",
          },
          {
            scoreRange: [5, 7],
            label: "Acceptable",
            description: "Reasonable efficiency with some optimization opportunities",
          },
          {
            scoreRange: [8, 10],
            label: "Optimal",
            description: "Highly efficient approach with minimal waste",
          },
        ],
      },
      {
        name: "Error Handling",
        description: "How well errors and edge cases were handled",
        weight: 0.2,
        scoringCriteria: [
          {
            scoreRange: [0, 4],
            label: "Poor",
            description: "Fails on errors or ignores edge cases",
          },
          {
            scoreRange: [5, 7],
            label: "Adequate",
            description: "Handles common errors but misses some edge cases",
          },
          {
            scoreRange: [8, 10],
            label: "Robust",
            description: "Comprehensive error handling and edge case coverage",
          },
        ],
      },
      {
        name: "Communication",
        description: "Quality and clarity of agent communication",
        weight: 0.15,
        scoringCriteria: [
          {
            scoreRange: [0, 5],
            label: "Unclear",
            description: "Confusing or unhelpful communication",
          },
          {
            scoreRange: [6, 8],
            label: "Clear",
            description: "Generally clear and understandable",
          },
          {
            scoreRange: [9, 10],
            label: "Excellent",
            description: "Exceptionally clear, helpful, and professional",
          },
        ],
      },
      {
        name: "Tool Usage",
        description: "Appropriate selection and use of available tools",
        weight: 0.15,
        scoringCriteria: [
          {
            scoreRange: [0, 4],
            label: "Poor",
            description: "Incorrect or inefficient tool selection",
          },
          {
            scoreRange: [5, 7],
            label: "Adequate",
            description: "Generally appropriate tool usage",
          },
          {
            scoreRange: [8, 10],
            label: "Expert",
            description: "Optimal tool selection and usage",
          },
        ],
      },
    ],
  },
  customer_service: {
    name: "Customer Service Agent",
    description: "Specialized rubric for customer service AI agents",
    dimensions: [
      {
        name: "Problem Resolution",
        description: "Successfully resolving customer issues",
        weight: 0.35,
        scoringCriteria: [
          {
            scoreRange: [0, 3],
            label: "Unresolved",
            description: "Issue not resolved",
          },
          {
            scoreRange: [4, 6],
            label: "Partial",
            description: "Partial resolution or workaround provided",
          },
          {
            scoreRange: [7, 8],
            label: "Resolved",
            description: "Issue fully resolved",
          },
          {
            scoreRange: [9, 10],
            label: "Exceeded",
            description: "Issue resolved with proactive follow-up",
          },
        ],
      },
      {
        name: "Empathy & Tone",
        description: "Appropriate emotional intelligence and communication style",
        weight: 0.25,
        scoringCriteria: [
          {
            scoreRange: [0, 4],
            label: "Inappropriate",
            description: "Cold, robotic, or insensitive",
          },
          {
            scoreRange: [5, 7],
            label: "Professional",
            description: "Polite and professional",
          },
          {
            scoreRange: [8, 10],
            label: "Empathetic",
            description: "Highly empathetic and personalized",
          },
        ],
      },
      {
        name: "Response Time",
        description: "Speed of responses and overall interaction efficiency",
        weight: 0.15,
        scoringCriteria: [
          {
            scoreRange: [0, 5],
            label: "Slow",
            description: "Excessive delays or unnecessary steps",
          },
          {
            scoreRange: [6, 8],
            label: "Timely",
            description: "Reasonable response time",
          },
          {
            scoreRange: [9, 10],
            label: "Immediate",
            description: "Quick and efficient responses",
          },
        ],
      },
      {
        name: "Accuracy",
        description: "Correctness of information provided",
        weight: 0.15,
        scoringCriteria: [
          {
            scoreRange: [0, 5],
            label: "Inaccurate",
            description: "Incorrect or misleading information",
          },
          {
            scoreRange: [6, 8],
            label: "Accurate",
            description: "Correct information provided",
          },
          {
            scoreRange: [9, 10],
            label: "Comprehensive",
            description: "Accurate and thorough information",
          },
        ],
      },
      {
        name: "Policy Compliance",
        description: "Adherence to company policies and procedures",
        weight: 0.10,
        scoringCriteria: [
          {
            scoreRange: [0, 5],
            label: "Non-compliant",
            description: "Violates policies or procedures",
          },
          {
            scoreRange: [6, 8],
            label: "Compliant",
            description: "Follows policies appropriately",
          },
          {
            scoreRange: [9, 10],
            label: "Exemplary",
            description: "Perfect policy adherence with good judgment",
          },
        ],
      },
    ],
  },
  coding: {
    name: "Code Generation Agent",
    description: "Rubric for evaluating code generation AI agents",
    dimensions: [
      {
        name: "Correctness",
        description: "Code functionality and correctness",
        weight: 0.35,
        scoringCriteria: [
          {
            scoreRange: [0, 3],
            label: "Broken",
            description: "Code doesn't work or has critical bugs",
          },
          {
            scoreRange: [4, 6],
            label: "Functional",
            description: "Code works with minor issues",
          },
          {
            scoreRange: [7, 8],
            label: "Correct",
            description: "Code works correctly",
          },
          {
            scoreRange: [9, 10],
            label: "Robust",
            description: "Correct with comprehensive edge case handling",
          },
        ],
      },
      {
        name: "Code Quality",
        description: "Readability, maintainability, and best practices",
        weight: 0.25,
        scoringCriteria: [
          {
            scoreRange: [0, 4],
            label: "Poor",
            description: "Hard to read, poorly structured",
          },
          {
            scoreRange: [5, 7],
            label: "Adequate",
            description: "Readable with standard patterns",
          },
          {
            scoreRange: [8, 10],
            label: "Excellent",
            description: "Clean, well-documented, follows best practices",
          },
        ],
      },
      {
        name: "Performance",
        description: "Efficiency and optimization",
        weight: 0.15,
        scoringCriteria: [
          {
            scoreRange: [0, 5],
            label: "Inefficient",
            description: "Poor algorithm choice or excessive complexity",
          },
          {
            scoreRange: [6, 8],
            label: "Efficient",
            description: "Reasonable performance",
          },
          {
            scoreRange: [9, 10],
            label: "Optimal",
            description: "Highly optimized solution",
          },
        ],
      },
      {
        name: "Testing",
        description: "Test coverage and quality",
        weight: 0.15,
        scoringCriteria: [
          {
            scoreRange: [0, 4],
            label: "No Tests",
            description: "Missing or inadequate tests",
          },
          {
            scoreRange: [5, 7],
            label: "Basic",
            description: "Basic test coverage",
          },
          {
            scoreRange: [8, 10],
            label: "Comprehensive",
            description: "Thorough test coverage with edge cases",
          },
        ],
      },
      {
        name: "Documentation",
        description: "Code comments and documentation quality",
        weight: 0.10,
        scoringCriteria: [
          {
            scoreRange: [0, 5],
            label: "Minimal",
            description: "Little to no documentation",
          },
          {
            scoreRange: [6, 8],
            label: "Documented",
            description: "Adequate documentation",
          },
          {
            scoreRange: [9, 10],
            label: "Excellent",
            description: "Clear, comprehensive documentation",
          },
        ],
      },
    ],
  },
};

export default function NewRubricPage() {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showTemplates, setShowTemplates] = useState(true);

  useEffect(() => {
    const fetchWorkspace = async () => {
      const res = await fetch("/api/me");
      if (res.ok) {
        const data = await res.json();
        if (data.user?.memberships?.[0]) {
          setWorkspaceId(data.user.memberships[0].workspaceId);
        }
      }
    };
    fetchWorkspace();
  }, []);

  const loadTemplate = (templateKey: string) => {
    const template = TEMPLATES[templateKey];
    setName(template.name);
    setDescription(template.description);
    setDimensions(template.dimensions);
    setShowTemplates(false);
  };

  const addDimension = () => {
    setDimensions([
      ...dimensions,
      {
        name: "",
        description: "",
        weight: 0,
        scoringCriteria: [
          {
            scoreRange: [0, 3],
            label: "Poor",
            description: "",
          },
          {
            scoreRange: [4, 7],
            label: "Good",
            description: "",
          },
          {
            scoreRange: [8, 10],
            label: "Excellent",
            description: "",
          },
        ],
      },
    ]);
  };

  const updateDimension = (index: number, field: keyof Dimension, value: Dimension[keyof Dimension]) => {
    const updated = [...dimensions];
    updated[index] = { ...updated[index], [field]: value };
    setDimensions(updated);
  };

  const removeDimension = (index: number) => {
    setDimensions(dimensions.filter((_, i) => i !== index));
  };

  const normalizeWeights = () => {
    const total = dimensions.reduce((sum, d) => sum + d.weight, 0);
    if (total === 0) return;

    const normalized = dimensions.map((d) => ({
      ...d,
      weight: parseFloat((d.weight / total).toFixed(3)),
    }));
    setDimensions(normalized);
  };

  const handleSave = async () => {
    if (!workspaceId) {
      alert("Workspace not found");
      return;
    }

    if (!name.trim()) {
      alert("Please enter a rubric name");
      return;
    }

    if (dimensions.length === 0) {
      alert("Please add at least one dimension");
      return;
    }

    const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      alert(
        `Dimension weights must sum to 1.0 (currently ${totalWeight.toFixed(2)}). Click "Normalize Weights" to fix this automatically.`
      );
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/rubrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name,
          description,
          dimensions,
          isDefault,
        }),
      });

      if (res.ok) {
        router.push("/rubrics");
      } else {
        const error = await res.json();
        alert(error.error || "Failed to create rubric");
      }
    } catch (error) {
      console.error("Error creating rubric:", error);
      alert("Failed to create rubric");
    } finally {
      setSaving(false);
    }
  };

  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
  const weightsValid = Math.abs(totalWeight - 1.0) < 0.01;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="container mx-auto px-6 py-12 max-w-5xl">
        <div className="mb-8">
          <Link
            href="/rubrics"
            className="text-zinc-500 hover:text-zinc-300 transition text-sm mb-4 inline-block"
          >
            ← Back to Rubrics
          </Link>
          <h1 className="text-2xl font-semibold text-zinc-100 mb-2">
            Create Evaluation Rubric
          </h1>
          <p className="text-zinc-500">
            Define custom evaluation criteria for your AI agent tests
          </p>
        </div>

        {showTemplates && dimensions.length === 0 && (
          <div className="mb-8 p-6 rounded-xl border border-zinc-800 bg-zinc-900">
            <h2 className="text-xl font-semibold text-zinc-100 mb-4">Start from a Template</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {Object.entries(TEMPLATES).map(([key, template]) => (
                <button
                  key={key}
                  onClick={() => loadTemplate(key)}
                  className="p-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 transition text-left"
                >
                  <h3 className="font-semibold text-zinc-100 mb-1">{template.name}</h3>
                  <p className="text-sm text-zinc-400">{template.description}</p>
                  <p className="text-xs text-zinc-500 mt-2">
                    {template.dimensions.length} dimensions
                  </p>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowTemplates(false)}
              className="mt-4 text-sm text-zinc-500 hover:text-zinc-300 transition"
            >
              or start from scratch →
            </button>
          </div>
        )}

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-zinc-100 mb-2">Rubric Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 focus:outline-none transition"
              placeholder="e.g., Customer Service Excellence"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-100 mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 focus:outline-none transition min-h-[100px]"
              placeholder="Describe what this rubric evaluates..."
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <label className="text-sm font-medium text-zinc-100">
                Dimensions * (Total weight: {totalWeight.toFixed(2)}/1.00)
                {!weightsValid && (
                  <span className="ml-2 text-yellow-400 text-xs">
                    Weights must sum to 1.0
                  </span>
                )}
              </label>
              <div className="flex gap-2">
                <button
                  onClick={normalizeWeights}
                  className="px-3 py-1 text-sm bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition"
                  disabled={dimensions.length === 0}
                >
                  Normalize Weights
                </button>
                <button
                  onClick={addDimension}
                  className="px-3 py-1 text-sm bg-indigo-500/10 text-indigo-400 rounded-lg hover:bg-indigo-500/20 transition"
                >
                  + Add Dimension
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {dimensions.map((dim, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-zinc-900 border border-zinc-800"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-zinc-100">Dimension {idx + 1}</h3>
                    <button
                      onClick={() => removeDimension(idx)}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="grid md:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Name</label>
                      <input
                        type="text"
                        value={dim.name}
                        onChange={(e) =>
                          updateDimension(idx, "name", e.target.value)
                        }
                        className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 focus:outline-none text-sm"
                        placeholder="e.g., Task Completion"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">
                        Weight (0-1)
                      </label>
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        value={dim.weight}
                        onChange={(e) =>
                          updateDimension(
                            idx,
                            "weight",
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 focus:outline-none text-sm"
                      />
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="block text-xs text-zinc-500 mb-1">
                      Description
                    </label>
                    <textarea
                      value={dim.description}
                      onChange={(e) =>
                        updateDimension(idx, "description", e.target.value)
                      }
                      className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 focus:outline-none text-sm"
                      rows={2}
                      placeholder="What does this dimension evaluate?"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-500 mb-2">
                      Scoring Criteria ({dim.scoringCriteria.length} levels)
                    </label>
                    <div className="space-y-2 text-xs">
                      {dim.scoringCriteria.map((criteria, cIdx) => (
                        <div
                          key={cIdx}
                          className="flex items-center gap-2 p-2 rounded-lg bg-zinc-950"
                        >
                          <span className="text-zinc-500 whitespace-nowrap">
                            {criteria.scoreRange[0]}-{criteria.scoreRange[1]}:
                          </span>
                          <input
                            type="text"
                            value={criteria.label}
                            placeholder="Label"
                            className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none flex-shrink-0 w-24"
                            readOnly
                          />
                          <input
                            type="text"
                            value={criteria.description}
                            placeholder="Description"
                            className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none flex-1"
                            readOnly
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}

              {dimensions.length === 0 && (
                <div className="text-center py-12 text-zinc-500">
                  No dimensions yet. Click &quot;Add Dimension&quot; to start building your
                  rubric.
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isDefault"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded border-zinc-700 bg-zinc-900 text-indigo-500"
            />
            <label htmlFor="isDefault" className="text-sm text-zinc-400">
              Set as default rubric for new test suites
            </label>
          </div>

          <div className="flex items-center gap-4 pt-6">
            <button
              onClick={handleSave}
              disabled={saving || !weightsValid || dimensions.length === 0}
              className="px-8 py-3 bg-zinc-100 text-zinc-900 hover:bg-zinc-200 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Create Rubric"}
            </button>
            <Link
              href="/rubrics"
              className="px-8 py-3 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 rounded-lg font-medium transition"
            >
              Cancel
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
