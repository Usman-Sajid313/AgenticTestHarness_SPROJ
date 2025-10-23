'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Space_Grotesk } from 'next/font/google';
import { z } from 'zod';
import {
  toolCreatePayloadSchema,
  parameterTypes,
  outputFormats,
  ToolParameter,
} from '@/lib/toolSchemas';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

type FieldErrors = Partial<Record<string, string>>;

type ParameterErrors = Partial<Record<number, FieldErrors>>;

const defaultParameter: ToolParameter = {
  name: '',
  type: 'string',
  description: '',
  required: true,
};

export default function ToolCreatePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parameters, setParameters] = useState<ToolParameter[]>([{ ...defaultParameter }]);
  const [outputFormat, setOutputFormat] = useState<typeof outputFormats[number]>('text');
  const [outputSchema, setOutputSchema] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<FieldErrors>({});
  const [paramErrors, setParamErrors] = useState<ParameterErrors>({});
  const [outputErrors, setOutputErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => {
    setGlobalError(null);
  }, [name, description, parameters, outputFormat, outputSchema]);

  const parsedOutputSchema = useMemo(() => {
    if (outputFormat !== 'json') return undefined;
    if (!outputSchema.trim()) return undefined;
    try {
      return JSON.parse(outputSchema);
    } catch {
      return 'invalid-json';
    }
  }, [outputFormat, outputSchema]);

  const handleParameterChange = (index: number, update: Partial<ToolParameter>) => {
    setParameters((prev) => {
      const cloned = [...prev];
      cloned[index] = { ...cloned[index], ...update };
      return cloned;
    });
    setParamErrors((prev) => {
      if (!prev[index]) return prev;
      const updated = { ...prev[index], ...Object.fromEntries(Object.keys(update).map((key) => [key, undefined])) } as FieldErrors;
      return { ...prev, [index]: updated };
    });
  };

  const addParameter = () => {
    setParameters((prev) => [...prev, { ...defaultParameter }]);
  };

  const removeParameter = (index: number) => {
    setParameters((prev) => prev.filter((_, idx) => idx !== index));
    setParamErrors((prev) => {
      const clone = { ...prev };
      delete clone[index];
      return clone;
    });
  };

  const resetErrors = () => {
    setFormErrors({});
    setParamErrors({});
    setOutputErrors({});
    setGlobalError(null);
  };

  const validate = () => {
    resetErrors();
    const errors: FieldErrors = {};
    const parameterErrors: ParameterErrors = {};
    const outputErrs: FieldErrors = {};

    let outputSchemaValue: unknown = undefined;

    if (outputFormat === 'json') {
      if (parsedOutputSchema === 'invalid-json') {
        outputErrs.schema = 'Provide a valid JSON schema object';
      } else if (parsedOutputSchema === undefined) {
        outputErrs.schema = 'Output schema is required for JSON format';
      } else if (typeof parsedOutputSchema !== 'object' || parsedOutputSchema === null || Array.isArray(parsedOutputSchema)) {
        outputErrs.schema = 'Output schema must be a JSON object';
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
    } catch (error) {
      if (error instanceof z.ZodError) {
        for (const issue of error.issues) {
          const [field, maybeIndex, nestedField] = issue.path;
          if (field === 'parameters' && typeof maybeIndex === 'number') {
            parameterErrors[maybeIndex] = parameterErrors[maybeIndex] ?? {};
            const key = typeof nestedField === 'string' ? nestedField : 'name';
            parameterErrors[maybeIndex]![key] = issue.message;
          } else if (field === 'output') {
            outputErrs[(nestedField as string) ?? 'format'] = issue.message;
          } else if (typeof field === 'string') {
            errors[field] = issue.message;
          }
        }
      }
    }

    setFormErrors(errors);
    setParamErrors(parameterErrors);
    setOutputErrors(outputErrs);

    return (
      Object.keys(errors).length === 0 &&
      Object.keys(parameterErrors).length === 0 &&
      Object.keys(outputErrs).length === 0
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setGlobalError(null);
    if (!validate()) return;

    const payload = {
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
      const response = await fetch('/api/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        if (data?.issues) {
          const errors: FieldErrors = {};
          const parameterErrors: ParameterErrors = {};
          const outputErrs: FieldErrors = {};
          for (const issue of data.issues) {
            const [field, maybeIndex, nestedField] = issue.path ?? [];
            if (field === 'parameters' && typeof maybeIndex === 'number') {
              parameterErrors[maybeIndex] = parameterErrors[maybeIndex] ?? {};
              const key = typeof nestedField === 'string' ? nestedField : 'name';
              parameterErrors[maybeIndex]![key] = issue.message;
            } else if (field === 'output') {
              outputErrs[(nestedField as string) ?? 'format'] = issue.message;
            } else if (typeof field === 'string') {
              errors[field] = issue.message;
            }
          }
          setFormErrors(errors);
          setParamErrors(parameterErrors);
          setOutputErrors(outputErrs);
        } else {
          setGlobalError(data?.error ?? 'Failed to create tool. Please try again.');
        }
        setSubmitting(false);
        return;
      }

      router.push('/');
    } catch (error) {
      console.error(error);
      setGlobalError('Network error. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <main className={`${spaceGrotesk.className} relative min-h-screen w-full bg-black`}> 
      <div className="absolute inset-0 bg-deep-space" />
      <div className="absolute inset-0 bg-deep-space-anim opacity-70" />
      <div className="pointer-events-none absolute -top-32 left-1/3 h-96 w-96 -translate-x-1/2 rounded-full bg-purple-500/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-7rem] right-1/4 h-[28rem] w-[28rem] translate-x-1/2 rounded-full bg-fuchsia-400/10 blur-3xl" />

      <div className="relative mx-auto max-w-5xl px-6 py-12">
        <header className="mb-10 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-white">Create a Tool</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/70">
              Define the interface your agent will leverage. Provide a clear description, list the input parameters, and specify the output format so your harness knows how to invoke it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg px-4 py-2 text-white bg-white/10 ring-1 ring-white/20 hover:bg-white/15 transition"
          >
            Back
          </button>
        </header>

        <section className="rounded-2xl bg-white/5 p-8 ring-1 ring-white/10 backdrop-blur-xl shadow-[0_40px_120px_rgba(0,0,0,0.45)]">
          <form className="space-y-8" onSubmit={handleSubmit}>
            {globalError && (
              <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {globalError}
              </div>
            )}

            <section className="grid gap-6 md:grid-cols-2">
              <Field
                label="Tool Name"
                value={name}
                onChange={setName}
                placeholder="weather-api"
                error={formErrors.name}
                required
              />

              <Field
                label="Description"
                value={description}
                onChange={setDescription}
                placeholder="Fetches weather information for a given city."
                error={formErrors.description}
                required
                multiline
              />
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-white">Input Parameters</h2>
                <button
                  type="button"
                  onClick={addParameter}
                  className="rounded-lg px-4 py-2 text-sm text-white bg-white/10 ring-1 ring-white/20 hover:bg-white/15 transition"
                >
                  Add parameter
                </button>
              </div>

              <p className="text-sm text-white/60">
                Define parameters your agent must provide. Use descriptive names and clarify whether each parameter is required.
              </p>

              <div className="space-y-4">
                {parameters.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/20 p-4 text-center text-sm text-white/50">
                    No parameters defined yet. Add one to get started.
                  </div>
                ) : (
                  parameters.map((param, index) => (
                    <div
                      key={index}
                      className="grid gap-4 rounded-xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/5 md:grid-cols-[2fr_1fr]"
                    >
                      <div className="space-y-3">
                        <Field
                          label="Name"
                          value={param.name}
                          onChange={(value) => handleParameterChange(index, { name: value })}
                          placeholder="city"
                          error={paramErrors[index]?.name}
                          required
                        />

                        <Field
                          label="Description (optional)"
                          value={param.description ?? ''}
                          onChange={(value) => handleParameterChange(index, { description: value })}
                          placeholder="Name of the city to fetch weather for"
                          error={paramErrors[index]?.description}
                          multiline
                        />
                      </div>

                      <div className="space-y-3">
                        <SelectField
                          label="Type"
                          value={param.type}
                          options={parameterTypes.map((type) => ({ value: type, label: type }))}
                          onChange={(value) => handleParameterChange(index, { type: value as ToolParameter['type'] })}
                          error={paramErrors[index]?.type}
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
                            className="mt-2 w-full rounded-lg border border-red-500/40 px-3 py-2 text-sm text-red-200 hover:bg-red-500/10"
                          >
                            Remove parameter
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="grid gap-6 md:grid-cols-2">
              <SelectField
                label="Output Format"
                value={outputFormat}
                options={outputFormats.map((format) => ({ value: format, label: format }))}
                onChange={(value) => setOutputFormat(value as typeof outputFormats[number])}
                error={outputErrors.format}
              />

              {outputFormat === 'json' ? (
                <Field
                  label="Output JSON Schema"
                  value={outputSchema}
                  onChange={setOutputSchema}
                  placeholder={'{ "type": "object", "properties": { ... } }'}
                  error={outputErrors.schema}
                  required
                  multiline
                />
              ) : (
                <div className="flex h-full items-end text-sm text-white/60">
                  Output will be free-form text returned to the agent.
                </div>
              )}
            </section>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => router.push('/')}
                className="rounded-lg px-4 py-2 text-white bg-white/5 ring-1 ring-white/10 hover:bg-white/10"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg px-5 py-2.5 text-white bg-white/10 ring-1 ring-white/20 hover:bg-white/15 transition disabled:opacity-60"
              >
                {submitting ? 'Creating...' : 'Create tool'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  required?: boolean;
  multiline?: boolean;
};

function Field({ label, value, onChange, placeholder, error, required, multiline }: FieldProps) {
  const baseClasses =
    'w-full rounded-lg border px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none transition ' +
    'bg-white/5 border-white/10 focus:border-white/60 focus:ring-4 focus:ring-white/20';
  const errorClasses =
    'w-full rounded-lg border px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none transition ' +
    'bg-white/5 border-red-500/60 focus:border-red-400 focus:ring-4 focus:ring-red-500/20';

  const props = {
    placeholder,
    value,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
    required,
    className: error ? errorClasses : baseClasses,
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-sm text-white/80">{label}</label>
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
      <label className="block text-sm text-white/80">{label}</label>
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
    <label className="flex items-center gap-2 text-sm text-white/80">
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

