'use client';

import { useState } from 'react';

type FormState = { name: string; email: string; password: string };
type FieldErrors = Partial<Record<keyof FormState, string>>;

export default function SignupPage() {
  const [form, setForm] = useState<FormState>({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  function validateLocal(data: FormState): FieldErrors {
    const e: FieldErrors = {};
    if (!data.name || data.name.trim().length < 2) e.name = 'Name must be at least 2 characters';
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim());
    if (!emailOk) e.email = 'Enter a valid email';
    const p = data.password;
    if (!p || p.length < 8) e.password = 'Use 8+ characters';
    else {
      if (!/[A-Z]/.test(p)) e.password = 'Add an uppercase letter';
      else if (!/[a-z]/.test(p)) e.password = 'Add a lowercase letter';
      else if (!/[0-9]/.test(p)) e.password = 'Add a number';
      else if (!/[^A-Za-z0-9]/.test(p)) e.password = 'Add a symbol';
    }
    return e;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const local = validateLocal(form);
    setErrors(local);
    if (Object.keys(local).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setErrors({ email: data?.error ?? 'Email already in use' });
        } else {
          setErrors({ password: data?.error ?? 'Signup failed' });
        }
        setSubmitting(false);
        return;
      }

      window.location.assign('/');
    } catch {
      setErrors({ password: 'Network error. Please try again.' });
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen w-full bg-zinc-950">
      <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6">
        <div className="grid w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 md:grid-cols-2">
          <section className="hidden md:flex flex-col items-center justify-center gap-6 border-r border-zinc-800 p-10 text-center">
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">Agentic Harness</h1>
              <p className="text-sm leading-relaxed text-zinc-400">
                Evaluate real agent runs with structured parsing, multi-model judging, and score-driven comparisons.
              </p>
              <p className="text-sm text-zinc-500">Build confidently. Measure rigorously. Iterate faster.</p>
            </div>
            <div className="h-px w-24 bg-zinc-800" />
            <p className="text-xs uppercase tracking-widest text-zinc-500">Prototype &bull; v0.1</p>
          </section>

          <section className="flex min-h-full items-center justify-center p-8 sm:p-10">
            <div className="w-full max-w-sm">
              <header className="mb-6 text-center">
                <h2 className="text-2xl font-medium text-zinc-100">Sign up</h2>
                <p className="mt-1 text-sm text-zinc-400">Create your account to start testing agents.</p>
              </header>

              <form onSubmit={onSubmit} className="space-y-5">
                <Field
                  label="Name"
                  type="text"
                  placeholder="Ada Lovelace"
                  value={form.name}
                  onChange={(v) => {
                    setForm({ ...form, name: v });
                    if (errors.name) setErrors({ ...errors, name: undefined });
                  }}
                  error={errors.name}
                  required
                  minLength={2}
                  maxLength={100}
                />

                <Field
                  label="Email"
                  type="email"
                  placeholder="ada@example.com"
                  value={form.email}
                  onChange={(v) => {
                    setForm({ ...form, email: v });
                    if (errors.email) setErrors({ ...errors, email: undefined });
                  }}
                  error={errors.email}
                  required
                />

                <PasswordField
                  label="Password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(v) => {
                    setForm({ ...form, password: v });
                    if (errors.password) setErrors({ ...errors, password: undefined });
                  }}
                  hint="8+ chars with uppercase, lowercase, number, and symbol."
                  error={errors.password}
                  required
                  minLength={8}
                />

                <button
                  type="submit"
                  disabled={submitting}
                  className="
                    group inline-flex w-full items-center justify-center gap-2 rounded-lg
                    bg-zinc-100 px-4 py-2.5 font-medium text-zinc-900 transition
                    hover:bg-zinc-200 active:scale-[0.99] disabled:opacity-60
                  "
                >
                  {submitting ? 'Creating account…' : 'Create account'}
                  <span className="transition-transform group-hover:translate-x-0.5">→</span>
                </button>

                <p className="text-center text-sm text-zinc-400">
                  Already have an account?{' '}
                  <a href="/login" className="text-zinc-400 underline underline-offset-4 hover:text-zinc-100">
                    Log in
                  </a>
                </p>
              </form>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}


type FieldBaseProps = {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
};

function Field({
  label,
  placeholder,
  value,
  onChange,
  error,
  required,
  minLength,
  maxLength,
  type = 'text',
}: FieldBaseProps & { type?: string }) {
  const base =
    'w-full rounded-lg border px-3 py-2 text-zinc-100 placeholder:text-zinc-600 outline-none transition ' +
    'bg-zinc-900 border-zinc-800 focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600';
  const err =
    'w-full rounded-lg border px-3 py-2 text-zinc-100 placeholder:text-zinc-600 outline-none transition ' +
    'bg-zinc-900 border-red-500/50 focus:border-red-500 focus:ring-1 focus:ring-red-500/20';

  return (
    <div className="space-y-1.5">
      <label className="block text-sm text-zinc-400">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        className={error ? err : base}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function PasswordField({
  label,
  placeholder,
  value,
  onChange,
  error,
  required,
  minLength,
  maxLength,
  hint,
}: FieldBaseProps & { hint?: string }) {
  const [visible, setVisible] = useState(false);

  const base =
    'w-full rounded-lg border px-3 py-2 pr-16 text-zinc-100 placeholder:text-zinc-600 outline-none transition ' +
    'bg-zinc-900 border-zinc-800 focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600';
  const err =
    'w-full rounded-lg border px-3 py-2 pr-16 text-zinc-100 placeholder:text-zinc-600 outline-none transition ' +
    'bg-zinc-900 border-red-500/50 focus:border-red-500 focus:ring-1 focus:ring-red-500/20';

  return (
    <div className="space-y-1.5">
      <label className="block text-sm text-zinc-400">{label}</label>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          minLength={minLength}
          maxLength={maxLength}
          className={error ? err : base}
        />
        <button
          type="button"
          aria-label={visible ? 'Hide password' : 'Show password'}
          onClick={() => setVisible((v) => !v)}
          className="
            absolute inset-y-0 right-2 my-auto flex h-8 items-center rounded-md px-2
            text-xs text-zinc-500 hover:text-zinc-300 focus:outline-none
            focus:ring-1 focus:ring-zinc-600
          "
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
      {hint && !error && <p className="text-xs text-zinc-500">{hint}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
