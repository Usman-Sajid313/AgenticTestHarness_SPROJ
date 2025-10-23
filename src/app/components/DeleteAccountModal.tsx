'use client';

import React, { useEffect, useState } from 'react';
import { Space_Grotesk } from 'next/font/google';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const REQUIRED_SENTENCE =
  'I understand this action will permanently delete my account';

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function DeleteAccountModal({ open, onClose }: Props) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setText('');
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const matched = text === REQUIRED_SENTENCE;

  async function onDelete() {
    if (!matched || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: text }),
      });

      if (res.status === 204) {
        window.location.href = '/login';
        return;
      }

      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? 'Failed to delete account.');
      setSubmitting(false);
    } catch {
      setError('Network error. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div
      className={`${spaceGrotesk.className} fixed inset-0 z-50 flex items-center justify-center`}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-xl shadow-2xl neon">
        <div className="mb-4 flex items-start justify-between">
          <h3 className="text-xl font-semibold text-white">Delete Account</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-2 py-1 text-white/70 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/30"
          >
            ✕
          </button>
        </div>

        <p className="mb-4 text-sm leading-relaxed text-white/70">
          This action will permanently delete your account and associated data. This cannot be undone.
          To confirm, please type the following sentence exactly:
        </p>

        <div className="mb-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80">
          {REQUIRED_SENTENCE}
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm text-white/80">
            Type the confirmation sentence
          </label>
          <input
            type="text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Type the sentence exactly"
            className={`
              w-full rounded-lg border px-3 py-2 text-white placeholder:text-white/40 outline-none transition
              ${text && !matched
                ? 'bg-white/5 border-red-500/60 focus:border-red-400 focus:ring-4 focus:ring-red-500/20'
                : 'bg-white/5 border-white/10 focus:border-white/60 focus:ring-4 focus:ring-white/20'
              }
            `}
            autoFocus
          />
          {!matched && text.length > 0 && (
            <p className="text-xs text-red-400">The sentence does not match.</p>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="
              rounded-lg px-4 py-2 text-white
              bg-white/10 ring-1 ring-white/20 hover:bg-white/15
              transition active:scale-[0.99]
            "
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={!matched || submitting}
            onClick={onDelete}
            className="
              rounded-lg px-4 py-2 text-white
              bg-red-500/20 ring-1 ring-red-400/40 hover:bg-red-500/25
              shadow-[0_8px_40px_rgba(244,63,94,0.20)]
              transition active:scale-[0.99] disabled:opacity-60
            "
          >
            {submitting ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </div>
    </div>
  );
}
