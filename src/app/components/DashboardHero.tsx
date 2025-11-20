'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Space_Grotesk } from 'next/font/google';
import DeleteAccountModal from './DeleteAccountModal';
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

export default function DashboardHero() {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string>('…');
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/me', { credentials: 'include', cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as MeResponse;
        if (alive) {
          const name = (data.name && data.name.trim()) || data.email;
          setDisplayName(name);
        }
      } catch {
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    function onProfileUpdated(event: Event) {
      const detail = (event as CustomEvent<{ name?: string }>).detail;
      const nextName = (detail?.name && detail.name.trim()) || null;
      if (nextName) setDisplayName(nextName);
    }

    window.addEventListener(USER_PROFILE_UPDATED_EVENT, onProfileUpdated as EventListener);
    return () => {
      window.removeEventListener(USER_PROFILE_UPDATED_EVENT, onProfileUpdated as EventListener);
    };
  }, []);

  return (
    <section className={`${spaceGrotesk.className} relative w-full`}>
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <h1 className="pl-2 text-3xl font-bold text-white sm:text-4xl md:text-5xl">
          Welcome <span id="welcome-name">{displayName}</span>
        </h1>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/test-harness')}
            className="
              rounded-lg px-4 py-2 text-white
              bg-white/10 ring-1 ring-white/20 hover:bg-white/15
              shadow-[0_8px_40px_rgba(255,255,255,0.06)]
              transition active:scale-[0.99]
            "
          >
            Test Harness
          </button>

          {/* --- UPDATED BUTTONS FOR SUITES --- */}
          <button
            type="button"
            onClick={() => router.push('/suites/new')}
            className="
              rounded-lg px-4 py-2 text-white
              bg-white/10 ring-1 ring-white/20 hover:bg-white/15
              shadow-[0_8px_40px_rgba(255,255,255,0.06)]
              transition active:scale-[0.99]
            "
          >
            Create Suite
          </button>

          <button
            type="button"
            onClick={() => router.push('/suites')}
            className="
              rounded-lg px-4 py-2 text-white
              bg-white/10 ring-1 ring-white/20 hover:bg-white/15
              shadow-[0_8px_40px_rgba(255,255,255,0.06)]
              transition active:scale-[0.99]
            "
          >
            View Suites
          </button>
          {/* ---------------------------------- */}

          <button
            type="button"
            onClick={() => router.push('/tools/new')}
            className="
              rounded-lg px-4 py-2 text-white
              bg-white/10 ring-1 ring-white/20 hover:bg-white/15
              shadow-[0_8px_40px_rgba(255,255,255,0.06)]
              transition active:scale-[0.99]
            "
          >
            Create Tool
          </button>

          <button
            type="button"
            onClick={() => router.push('/tools')}
            className="
              rounded-lg px-4 py-2 text-white
              bg-white/10 ring-1 ring-white/20 hover:bg-white/15
              shadow-[0_8px_40px_rgba(255,255,255,0.06)]
              transition active:scale-[0.99]
            "
          >
            View Tools
          </button>

          <button
            type="button"
            onClick={() => router.push('/profile')}
            className="
              rounded-lg px-4 py-2 text-white
              bg-white/10 ring-1 ring-white/20 hover:bg-white/15
              shadow-[0_8px_40px_rgba(255,255,255,0.06)]
              transition active:scale-[0.99]
            "
          >
            Profile
          </button>

          <button
            type="button"
            disabled={loggingOut}
            onClick={async () => {
              if (loggingOut) return;
              setLoggingOut(true);
              try {
                const res = await fetch('/api/auth/logout', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                });
                if (!res.ok) {
                  setLoggingOut(false);
                  return;
                }
                router.push('/login');
              } catch {
                setLoggingOut(false);
              }
            }}
            className="
              rounded-lg px-4 py-2 text-white
              bg-white/10 ring-1 ring-white/20 hover:bg-white/15
              shadow-[0_8px_40px_rgba(255,255,255,0.06)]
              transition active:scale-[0.99]
              disabled:opacity-60
            "
          >
            {loggingOut ? 'Signing out…' : 'Logout'}
          </button>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="
              rounded-lg px-4 py-2 text-white
              bg-red-500/20 hover:bg-red-500/25 ring-1 ring-red-400/40
              shadow-[0_8px_40px_rgba(244,63,94,0.20)]
              transition active:scale-[0.99]
            "
          >
            Delete Account
          </button>
        </div>
      </div>

      <DeleteAccountModal open={open} onClose={() => setOpen(false)} />
    </section>
  );
}