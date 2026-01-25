'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Space_Grotesk } from 'next/font/google';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

type FormState = { name: string; email: string; password: string };
type FieldErrors = Partial<Record<keyof FormState, string>>;

export default function SignupPage() {
  const router = useRouter();
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

      router.replace('/');
    } catch {
      setErrors({ password: 'Network error. Please try again.' });
      setSubmitting(false);
    }
  }

  return (
    <main className={`${spaceGrotesk.className} relative min-h-screen w-full bg-black`}>
      <div className="absolute inset-0 bg-deep-space" />
      <div className="absolute inset-0 bg-deep-space-anim opacity-70" />
      <div className="pointer-events-none absolute -top-32 left-1/3 h-96 w-96 -translate-x-1/2 rounded-full bg-purple-500/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-7rem] right-1/4 h-[28rem] w-[28rem] translate-x-1/2 rounded-full bg-fuchsia-400/10 blur-3xl" />
      <div className="relative mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6">
        <div className="grid w-full overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10 backdrop-blur-xl neon md:grid-cols-2">
          <section className="hidden md:flex flex-col items-center justify-center gap-6 p-10 text-center">
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight text-white">Agentic Harness</h1>
              <p className="text-sm leading-relaxed text-white/70">
                A futuristic testbed where AI agents prove their tool-use.
                Spin up mock APIs, run scenario suites, and get judge-grade reports with full traces.
              </p>
              <p className="text-sm text-white/60">Build confidently. Measure rigorously. Iterate faster.</p>
            </div>
            <div className="h-px w-24 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
            <p className="text-xs uppercase tracking-widest text-white/40">Prototype • v0.1</p>
          </section>

          <section className="flex min-h-full items-center justify-center p-8 sm:p-10">
            <div className="w-full max-w-sm">
              <header className="mb-6 text-center">
                <h2 className="text-2xl font-medium text-white">Sign up</h2>
                <p className="mt-1 text-sm text-white/60">Create your account to start testing agents.</p>
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
                    bg-white/10 px-4 py-2.5 text-white transition
                    hover:bg-white/15 active:scale-[0.99] disabled:opacity-60
                    ring-1 ring-white/20
                    shadow-[0_8px_40px_rgba(255,255,255,0.06)]
                  "
                >
                  {submitting ? 'Creating account…' : 'Create account'}
                  <span className="transition-transform group-hover:translate-x-0.5">→</span>
                </button>

                <p className="text-center text-sm text-white/70">
                  Already have an account?{' '}
                  <a href="/login" className="underline decoration-white/40 underline-offset-4 hover:decoration-white">
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
    'w-full rounded-lg border px-3 py-2 text-white placeholder:text-white/40 outline-none transition ' +
    'bg-white/5 border-white/10 focus:border-white/60 focus:ring-4 focus:ring-white/20';
  const err =
    'w-full rounded-lg border px-3 py-2 text-white placeholder:text-white/40 outline-none transition ' +
    'bg-white/5 border-red-500/60 focus:border-red-400 focus:ring-4 focus:ring-red-500/20';

  return (
    <div className="space-y-1.5">
      <label className="block text-sm text-white/80">{label}</label>
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
    'w-full rounded-lg border px-3 py-2 pr-10 text-white placeholder:text-white/40 outline-none transition ' +
    'bg-white/5 border-white/10 focus:border-white/60 focus:ring-4 focus:ring-white/20';
  const err =
    'w-full rounded-lg border px-3 py-2 pr-10 text-white placeholder:text-white/40 outline-none transition ' +
    'bg-white/5 border-red-500/60 focus:border-red-400 focus:ring-4 focus:ring-red-500/20';

  return (
    <div className="space-y-1.5">
      <label className="block text-sm text-white/80">{label}</label>
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
            absolute inset-y-0 right-2 my-auto h-8 w-8 rounded-md
            text-white/70 hover:text-white focus:outline-none
            focus:ring-2 focus:ring-white/40
          "
        >
          {visible ? '🙈' : '👁️'}
        </button>
      </div>
      {hint && !error && <p className="text-xs text-white/60">{hint}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
