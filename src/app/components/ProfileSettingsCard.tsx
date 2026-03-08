'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { USER_PROFILE_UPDATED_EVENT } from '@/lib/events';

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
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-zinc-100">Profile</h3>
        {!loading && me?.email && (
          <span className="text-xs text-zinc-400">{me.email}</span>
        )}
      </div>

      <p className="mb-6 text-sm text-zinc-400">Update your display name and change your password.</p>

      <div className="space-y-8">
        <form onSubmit={onSubmitName} className="space-y-3">
          <div>
            <label htmlFor="profile-name" className="block text-sm text-zinc-400">
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
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
              disabled={loading}
            />
          </div>
          {nameError && <p className="text-sm text-red-400">{nameError}</p>}
          {nameSuccess && <p className="text-sm text-emerald-400">{nameSuccess}</p>}
          <button
            type="submit"
            disabled={loading || nameSubmitting}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-700 disabled:opacity-60"
          >
            {nameSubmitting ? 'Saving...' : 'Save name'}
          </button>
        </form>

        <form onSubmit={onSubmitPassword} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="old-password" className="block text-sm text-zinc-400">
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
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
                autoComplete="current-password"
              />
            </div>

            <div>
              <label htmlFor="new-password" className="block text-sm text-zinc-400">
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
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-sm text-zinc-400">
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
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
                autoComplete="new-password"
              />
            </div>
          </div>

          {passwordError && <p className="text-sm text-red-400">{passwordError}</p>}
          {passwordSuccess && <p className="text-sm text-emerald-400">{passwordSuccess}</p>}

          <button
            type="submit"
            disabled={passwordSubmitting}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-700 disabled:opacity-60"
          >
            {passwordSubmitting ? 'Updating...' : 'Change password'}
          </button>
        </form>
      </div>
    </div>
  );
}
