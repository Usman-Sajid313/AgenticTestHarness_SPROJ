'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Space_Grotesk } from 'next/font/google';
import { USER_PROFILE_UPDATED_EVENT } from '@/lib/events';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

type MeResponse = {
  id: string;
  name?: string | null;
  email: string;
};

type ApiError = { field?: string; error?: string } | { error?: string };

export default function ProfileSettingsCard() {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState<string | null>(null);
  const [nameSubmitting, setNameSubmitting] = useState(false);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  const initialName = useMemo(() => (me?.name && me.name.trim()) || '', [me?.name]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/me', { credentials: 'include', cache: 'no-store' });
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const data = (await res.json()) as MeResponse;
        if (alive) {
          setMe(data);
          setName((data.name && data.name.trim()) || '');
        }
      } catch {
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  async function onSubmitName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (nameSubmitting) return;

    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Name must not be empty.');
      return;
    }
    if (trimmed === initialName) {
      setNameError('Update your name before saving.');
      return;
    }

    setNameSubmitting(true);
    setNameError(null);
    setNameSuccess(null);
    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as ApiError;
        setNameError((data as ApiError)?.error ?? 'Failed to update name.');
        return;
      }

      const data = await res.json();
      const updatedName = (data?.user?.name as string | undefined)?.trim() ?? trimmed;
      setMe((prev) =>
        prev
          ? {
              ...prev,
              name: updatedName,
            }
          : prev
      );
      setName(updatedName);
      setNameSuccess('Name updated successfully.');
      window.dispatchEvent(
        new CustomEvent(USER_PROFILE_UPDATED_EVENT, {
          detail: { name: updatedName },
        })
      );
    } catch {
      setNameError('Network error. Please try again.');
    } finally {
      setNameSubmitting(false);
    }
  }

  async function onSubmitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordSubmitting) return;

    if (!oldPassword.trim()) {
      setPasswordError('Enter your current password.');
      return;
    }
    if (!newPassword.trim()) {
      setPasswordError('Enter a new password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    setPasswordSubmitting(true);
    setPasswordError(null);
    setPasswordSuccess(null);
    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as ApiError;
        setPasswordError((data as ApiError)?.error ?? 'Failed to update password.');
        return;
      }

      setPasswordSuccess('Password updated successfully.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setPasswordError('Network error. Please try again.');
    } finally {
      setPasswordSubmitting(false);
    }
  }

  return (
    <div className={`${spaceGrotesk.className} rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-xl`}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Profile</h3>
        {!loading && me?.email && (
          <span className="text-xs text-white/70">{me.email}</span>
        )}
      </div>

      <p className="mb-6 text-sm text-white/70">Update your display name and change your password.</p>

      <div className="space-y-8">
        <form onSubmit={onSubmitName} className="space-y-3">
          <div>
            <label htmlFor="profile-name" className="block text-sm text-white/80">
              Display name
            </label>
            <input
              id="profile-name"
              name="name"
              type="text"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (nameError) setNameError(null);
                if (nameSuccess) setNameSuccess(null);
              }}
              placeholder="Enter your preferred name"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/40 outline-none transition focus:border-white/60 focus:ring-4 focus:ring-white/20"
              disabled={loading}
            />
          </div>
          {nameError && <p className="text-sm text-red-400">{nameError}</p>}
          {nameSuccess && <p className="text-sm text-emerald-400">{nameSuccess}</p>}
          <button
            type="submit"
            disabled={loading || nameSubmitting}
            className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/20 transition hover:bg-white/15 disabled:opacity-60"
          >
            {nameSubmitting ? 'Saving…' : 'Save name'}
          </button>
        </form>

        <form onSubmit={onSubmitPassword} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="old-password" className="block text-sm text-white/80">
                Current password
              </label>
              <input
                id="old-password"
                name="oldPassword"
                type="password"
                value={oldPassword}
                onChange={(event) => {
                  setOldPassword(event.target.value);
                  if (passwordError) setPasswordError(null);
                  if (passwordSuccess) setPasswordSuccess(null);
                }}
                placeholder="Enter current password"
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/40 outline-none transition focus:border-white/60 focus:ring-4 focus:ring-white/20"
                autoComplete="current-password"
              />
            </div>

            <div>
              <label htmlFor="new-password" className="block text-sm text-white/80">
                New password
              </label>
              <input
                id="new-password"
                name="newPassword"
                type="password"
                value={newPassword}
                onChange={(event) => {
                  setNewPassword(event.target.value);
                  if (passwordError) setPasswordError(null);
                  if (passwordSuccess) setPasswordSuccess(null);
                }}
                placeholder="Enter a strong password"
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/40 outline-none transition focus:border-white/60 focus:ring-4 focus:ring-white/20"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-sm text-white/80">
                Confirm new password
              </label>
              <input
                id="confirm-password"
                name="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  if (passwordError) setPasswordError(null);
                  if (passwordSuccess) setPasswordSuccess(null);
                }}
                placeholder="Re-enter new password"
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/40 outline-none transition focus:border-white/60 focus:ring-4 focus:ring-white/20"
                autoComplete="new-password"
              />
            </div>
          </div>

          {passwordError && <p className="text-sm text-red-400">{passwordError}</p>}
          {passwordSuccess && <p className="text-sm text-emerald-400">{passwordSuccess}</p>}

          <button
            type="submit"
            disabled={passwordSubmitting}
            className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/20 transition hover:bg-white/15 disabled:opacity-60"
          >
            {passwordSubmitting ? 'Updating…' : 'Change password'}
          </button>
        </form>
      </div>
    </div>
  );
}

