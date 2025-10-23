'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Space_Grotesk } from 'next/font/google';
import {
  ToolCreatePayload,
  ToolParameter,
  outputFormats,
  parameterTypes,
  toolCreatePayloadSchema,
  createEmptyParameter,
} from '@/lib/toolSchemas';
import { z } from 'zod';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

type RemoteTool = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  versionId: string | null;
  version: string;
  parameters: ToolParameter[];
  output: ToolCreatePayload['output'];
};

type FetchState = 'idle' | 'loading' | 'error';

type ModalState =
  | { mode: 'create'; tool?: undefined }
  | { mode: 'edit'; tool: RemoteTool };

type ValidationIssue = { path: (string | number)[]; message: string };

function isValidationError(error: unknown): error is { issues: ValidationIssue[]; message?: string } {
  if (!error || typeof error !== 'object') return false;
  const maybeIssues = (error as { issues?: unknown }).issues;
  if (!Array.isArray(maybeIssues)) return false;
  return maybeIssues.every((issue) =>
    issue && typeof issue === 'object' && Array.isArray((issue as ValidationIssue).path) && typeof (issue as ValidationIssue).message === 'string'
  );
}

export default function ToolsPage() {
  const router = useRouter();
  const [tools, setTools] = useState<RemoteTool[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadTools = useCallback(async () => {
    setFetchState('loading');
    setError(null);
    try {
      const res = await fetch('/api/tools', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error('Failed to load tools');
      }
      const data = (await res.json()) as { tools: RemoteTool[] };
      setTools(data.tools ?? []);
      setFetchState('idle');
    } catch (err) {
      console.error(err);
      setFetchState('error');
      setError('Unable to fetch tools. Please try again.');
    }
  }, []);

  useEffect(() => {
    loadTools();
  }, [loadTools]);

  const openCreateModal = () => setModalState({ mode: 'create' });
  const openEditModal = (tool: RemoteTool) => setModalState({ mode: 'edit', tool });
  const closeModal = () => setModalState(null);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/tools/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('Delete failed');
      }
      setTools((prev) => prev.filter((tool) => tool.id !== id));
      setConfirmDeleteId(null);
    } catch (err) {
      console.error(err);
      setError('Failed to delete tool.');
    }
  };

  const upsertTool = async (input: ToolCreatePayload, toolId?: string) => {
    const payload = {
      ...input,
      parameters: input.parameters,
      output: input.output,
    } satisfies ToolCreatePayload;

    const targetUrl = toolId ? `/api/tools/${toolId}` : '/api/tools';
    const method = toolId ? 'PUT' : 'POST';

    const res = await fetch(targetUrl, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      if (data?.issues) {
        throw { issues: data.issues as ValidationIssue[], message: data?.error ?? 'Validation failed' };
      }
      throw new Error(data?.error ?? 'Something went wrong');
    }

    await loadTools();
  };

  const selectedTool = useMemo(() => {
    if (modalState?.mode === 'edit') return modalState.tool;
    return null;
  }, [modalState]);

  return (
    <main className={`${spaceGrotesk.className} relative min-h-screen w-full bg-black`}>
      <div className="absolute inset-0 bg-deep-space" />
      <div className="absolute inset-0 bg-deep-space-anim opacity-70" />
      <div className="pointer-events-none absolute -top-32 left-1/3 h-96 w-96 -translate-x-1/2 rounded-full bg-purple-500/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-7rem] right-1/4 h-[28rem] w-[28rem] translate-x-1/2 rounded-full bg-fuchsia-400/10 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-6 py-12">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-white">Your Tools</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/70">
              Manage the tools available to your agents. Edit parameters, update schemas, or remove tools you no longer need.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={openCreateModal}
              className="rounded-lg px-4 py-2 text-white bg-white/10 ring-1 ring-white/20 hover:bg-white/15 transition"
            >
              New Tool
            </button>
            <button
              type="button"
              onClick={() => router.push('/')}
              className="rounded-lg px-4 py-2 text-white bg-white/5 ring-1 ring-white/10 hover:bg-white/10 transition"
            >
              Back to Dashboard
            </button>
          </div>
        </header>

        {fetchState === 'error' && (
          <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error ?? 'An unexpected error occurred.'}
          </div>
        )}

        {fetchState === 'loading' ? (
          <div className="flex h-40 items-center justify-center text-white/70">Loading tools…</div>
        ) : tools.length === 0 ? (
          <EmptyState onCreate={openCreateModal} />
        ) : (
          <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {tools.map((tool) => (
              <article
                key={tool.id}
                className="flex flex-col justify-between gap-4 rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-xl"
              >
                <div className="space-y-3">
                  <header className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold text-white">{tool.name}</h2>
                      <p className="text-xs text-white/40">Version {tool.version}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(tool.id)}
                      className="rounded-md border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
                    >
                      Delete
                    </button>
                  </header>
                  <p className="text-sm text-white/70 line-clamp-3">{tool.description}</p>
                  <div className="rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
                    <p className="text-xs font-medium uppercase tracking-wide text-white/50">Inputs</p>
                    {tool.parameters.length === 0 ? (
                      <p className="mt-1 text-xs text-white/50">No parameters defined.</p>
                    ) : (
                      <ul className="mt-2 space-y-1 text-xs text-white/80">
                        {tool.parameters.map((param) => (
                          <li key={param.name} className="flex items-center justify-between gap-3">
                            <span>
                              <span className="font-semibold">{param.name}</span>
                              <span className="text-white/50"> · {param.type}</span>
                            </span>
                            {!param.required && <span className="text-white/40">optional</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
                    <p className="text-xs font-medium uppercase tracking-wide text-white/50">Output</p>
                    <p className="mt-2 text-xs text-white/80">
                      {tool.output.format === 'text'
                        ? 'Returns free-form text.'
                        : 'Returns structured JSON matching the defined schema.'}
                    </p>
                  </div>
                </div>
                <footer className="flex items-center justify-between text-xs text-white/50">
                  <button
                    type="button"
                    onClick={() => openEditModal(tool)}
                    className="rounded-lg px-3 py-1 text-sm text-white bg-white/10 ring-1 ring-white/20 hover:bg-white/15 transition"
                  >
                    Edit
                  </button>
                  <span>Updated {new Date(tool.updatedAt).toLocaleString()}</span>
                </footer>
              </article>
            ))}
          </section>
        )}
      </div>

      {modalState && (
        <ToolModal
          mode={modalState.mode}
          initialTool={selectedTool ?? undefined}
          onClose={closeModal}
          onSubmit={async (payload, toolId) => {
            await upsertTool(payload, toolId);
            closeModal();
          }}
        />
      )}

      {confirmDeleteId && (
        <DeleteDialog
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={() => handleDelete(confirmDeleteId)}
        />
      )}
    </main>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/20 bg-white/5 p-16 text-center text-white/70">
      <p className="max-w-sm text-sm">
        No tools yet. Create your first tool to define how your agents interact with external systems and mock APIs.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="rounded-lg px-4 py-2 text-white bg-white/10 ring-1 ring-white/20 hover:bg-white/15 transition"
      >
        Create a Tool
      </button>
    </div>
  );
}

type ToolModalProps = {
  mode: ModalState['mode'];
  initialTool?: RemoteTool;
  onClose: () => void;
  onSubmit: (payload: ToolCreatePayload, toolId?: string) => Promise<void>;
};

function ToolModal({ mode, initialTool, onClose, onSubmit }: ToolModalProps) {
  const [name, setName] = useState(initialTool?.name ?? '');
  const [description, setDescription] = useState(initialTool?.description ?? '');
  const initialParams = initialTool?.parameters?.length
    ? initialTool.parameters.map((param) => ({ ...param }))
    : [createEmptyParameter()];
  const [parameters, setParameters] = useState<ToolParameter[]>(initialParams);
  const [outputFormat, setOutputFormat] = useState<ToolCreatePayload['output']['format']>(initialTool?.output.format ?? 'text');
  const [outputSchema, setOutputSchema] = useState(
    initialTool?.output.format === 'json' ? JSON.stringify(initialTool.output.schema ?? {}, null, 2) : ''
  );
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [parameterErrors, setParameterErrors] = useState<Record<number, Record<string, string>>>({});
  const [outputErrors, setOutputErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'edit' && initialTool?.output.format === 'json') {
      setOutputSchema(JSON.stringify(initialTool.output.schema ?? {}, null, 2));
    }
  }, [initialTool, mode]);

  const parsedOutputSchema = useMemo(() => {
    if (outputFormat !== 'json') return undefined;
    if (!outputSchema.trim()) return undefined;
    try {
      return JSON.parse(outputSchema);
    } catch {
      return 'invalid-json';
    }
  }, [outputFormat, outputSchema]);

  const validate = () => {
    setFormErrors({});
    setParameterErrors({});
    setOutputErrors({});
    setGlobalError(null);

    let outputSchemaValue: unknown = undefined;
    if (outputFormat === 'json') {
      if (parsedOutputSchema === 'invalid-json') {
        setOutputErrors({ schema: 'Provide a valid JSON object' });
        return false;
      }
      if (parsedOutputSchema === undefined) {
        setOutputErrors({ schema: 'Output schema is required for JSON format' });
        return false;
      }
      outputSchemaValue = parsedOutputSchema;
    }

    try {
      toolCreatePayloadSchema.parse({
        name,
        description,
        parameters,
        output: { format: outputFormat, schema: outputSchemaValue },
      });
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        const paramErrs: Record<number, Record<string, string>> = {};
        const outErrs: Record<string, string> = {};

        for (const issue of error.issues) {
          const [field, maybeIndex, nestedField] = issue.path;
          if (field === 'parameters' && typeof maybeIndex === 'number') {
            paramErrs[maybeIndex] = paramErrs[maybeIndex] ?? {};
            const key = typeof nestedField === 'string' ? nestedField : 'name';
            paramErrs[maybeIndex][key] = issue.message;
          } else if (field === 'output') {
            const key = typeof maybeIndex === 'string' ? maybeIndex : 'format';
            outErrs[key] = issue.message;
          } else if (typeof field === 'string') {
            fieldErrors[field] = issue.message;
          }
        }

        setFormErrors(fieldErrors);
        setParameterErrors(paramErrs);
        setOutputErrors(outErrs);
      }
    }

    return false;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    const payload: ToolCreatePayload = {
      name,
      description,
      parameters,
      output: {
        format: outputFormat,
        schema: outputFormat === 'json' ? parsedOutputSchema : undefined,
      },
    };

    setSubmitting(true);
    try {
      await onSubmit(payload, initialTool?.id);
      setSubmitting(false);
      onClose();
    } catch (error: unknown) {
      if (isValidationError(error)) {
        const fieldErrors: Record<string, string> = {};
        const paramErrs: Record<number, Record<string, string>> = {};
        const outErrs: Record<string, string> = {};
        for (const issue of error.issues) {
          const [field, maybeIndex, nestedField] = issue.path ?? [];
          if (field === 'parameters' && typeof maybeIndex === 'number') {
            paramErrs[maybeIndex] = paramErrs[maybeIndex] ?? {};
            const key = typeof nestedField === 'string' ? nestedField : 'name';
            paramErrs[maybeIndex][key] = issue.message;
          } else if (field === 'output') {
            const key = typeof maybeIndex === 'string' ? maybeIndex : 'format';
            outErrs[key] = issue.message;
          } else if (typeof field === 'string') {
            fieldErrors[field] = issue.message;
          }
        }
        setFormErrors(fieldErrors);
        setParameterErrors(paramErrs);
        setOutputErrors(outErrs);
      } else {
        setGlobalError((error as Error)?.message ?? 'Failed to save tool.');
      }
      setSubmitting(false);
    }
  };

  const handleParameterChange = (index: number, update: Partial<ToolParameter>) => {
    setParameters((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...update };
      return next;
    });
    setParameterErrors((prev) => {
      if (!prev[index]) return prev;
      const updated = { ...prev[index], ...Object.fromEntries(Object.keys(update).map((key) => [key, undefined])) } as Record<string, string>;
      return { ...prev, [index]: updated };
    });
  };

  const addParameter = () => {
    setParameters((prev) => [...prev, createEmptyParameter()]);
  };

  const removeParameter = (index: number) => {
    setParameters((prev) => prev.filter((_, idx) => idx !== index));
    setParameterErrors((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
      <div className="relative h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-black/80 ring-1 ring-white/20">
        <div className="h-full overflow-y-auto p-8">
          <header className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-white">
                {mode === 'create' ? 'Create new tool' : `Edit ${initialTool?.name}`}
              </h2>
              <p className="mt-1 text-sm text-white/60">
                Describe inputs and outputs so agent runs can interact reliably.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1 text-sm text-white/60 hover:bg-white/5"
            >
              Close
            </button>
          </header>

          {globalError && (
            <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {globalError}
            </div>
          )}

          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Tool Name"
                value={name}
                onChange={setName}
                error={formErrors.name}
                required
              />

              <Field
                label="Description"
                value={description}
                onChange={setDescription}
                error={formErrors.description}
                required
                multiline
              />
            </div>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-white/60">Input parameters</h3>
                <button
                  type="button"
                  onClick={addParameter}
                  className="rounded-lg px-3 py-1 text-xs text-white bg-white/10 ring-1 ring-white/20 hover:bg-white/15"
                >
                  Add parameter
                </button>
              </div>

              {parameters.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/20 p-4 text-center text-sm text-white/50">
                  No parameters. Add one to begin.
                </div>
              ) : (
                <div className="space-y-4">
                  {parameters.map((param, index) => (
                    <div key={index} className="grid gap-3 rounded-lg border border-white/10 bg-white/5 p-4 md:grid-cols-[2fr_1fr]">
                      <div className="space-y-3">
                        <Field
                          label="Name"
                          value={param.name}
                          onChange={(value) => handleParameterChange(index, { name: value })}
                          error={parameterErrors[index]?.name}
                          required
                        />
                        <Field
                          label="Description"
                          value={param.description ?? ''}
                          onChange={(value) => handleParameterChange(index, { description: value })}
                          error={parameterErrors[index]?.description}
                          multiline
                        />
                      </div>
                      <div className="space-y-3">
                        <SelectField
                          label="Type"
                          value={param.type}
                          options={parameterTypes.map((type) => ({ value: type, label: type }))}
                          onChange={(value) => handleParameterChange(index, { type: value as ToolParameter['type'] })}
                          error={parameterErrors[index]?.type}
                        />
                        <CheckboxField
                          label="Required"
                          checked={param.required}
                          onChange={(value) => handleParameterChange(index, { required: value })}
                        />
                        {parameters.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeParameter(index)}
                            className="w-full rounded-md border border-red-500/40 px-3 py-1 text-xs text-red-200 hover:bg-red-500/10"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <SelectField
                label="Output format"
                value={outputFormat}
                options={outputFormats.map((format) => ({ value: format, label: format }))}
                onChange={(value) => setOutputFormat(value as typeof outputFormats[number])}
                error={outputErrors.format}
              />

              {outputFormat === 'json' ? (
                <Field
                  label="Output JSON schema"
                  value={outputSchema}
                  onChange={setOutputSchema}
                  error={outputErrors.schema}
                  required
                  multiline
                />
              ) : (
                <div className="flex h-full items-end text-xs text-white/60">
                  Returns free-form text to the agent.
                </div>
              )}
            </section>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-white bg-white/5 ring-1 ring-white/10 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="rounded-lg px-4 py-2 text-sm text-white bg-white/10 ring-1 ring-white/20 hover:bg-white/15 disabled:opacity-60"
              >
                {submitting ? 'Saving...' : mode === 'create' ? 'Create tool' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeleteDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
      <div className="w-full max-w-md rounded-2xl bg-black/80 p-6 ring-1 ring-white/10">
        <h3 className="text-lg font-semibold text-white">Delete tool</h3>
        <p className="mt-2 text-sm text-white/70">
          Are you sure you want to delete this tool? This action cannot be undone.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm text-white bg-white/5 ring-1 ring-white/10 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg px-4 py-2 text-sm text-white bg-red-500/20 ring-1 ring-red-500/40 hover:bg-red-500/30"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  multiline?: boolean;
};

function Field({ label, value, onChange, error, required, multiline }: FieldProps) {
  const baseClasses =
    'w-full rounded-lg border px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none transition ' +
    'bg-white/5 border-white/10 focus:border-white/60 focus:ring-4 focus:ring-white/20';
  const errorClasses =
    'w-full rounded-lg border px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none transition ' +
    'bg-white/5 border-red-500/60 focus:border-red-400 focus:ring-4 focus:ring-red-500/20';

  const props = {
    value,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
    required,
    className: error ? errorClasses : baseClasses,
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold uppercase tracking-wide text-white/60">{label}</label>
      {multiline ? (
        <textarea {...props} rows={4} />
      ) : (
        <input type="text" {...props} />
      )}
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}

type SelectFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  error?: string;
};

function SelectField({ label, value, onChange, options, error }: SelectFieldProps) {
  const baseClasses =
    'w-full rounded-lg border px-3 py-2 text-sm text-white outline-none transition ' +
    'bg-white/5 border-white/10 focus:border-white/60 focus:ring-4 focus:ring-white/20';
  const errorClasses =
    'w-full rounded-lg border px-3 py-2 text-sm text-white outline-none transition ' +
    'bg-white/5 border-red-500/60 focus:border-red-400 focus:ring-4 focus:ring-red-500/20';

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold uppercase tracking-wide text-white/60">{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={error ? errorClasses : baseClasses}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}

type CheckboxFieldProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

function CheckboxField({ label, checked, onChange }: CheckboxFieldProps) {
  return (
    <label className="flex items-center gap-2 text-xs text-white/70">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-white/20 bg-white/5 text-white focus:ring-white/20"
      />
      {label}
    </label>
  );
}


