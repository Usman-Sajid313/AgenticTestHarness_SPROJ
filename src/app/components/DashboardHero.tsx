'use client';

import React, { useEffect, useState } from 'react';
import { Space_Grotesk } from 'next/font/google';
import DeleteAccountModal from './DeleteAccountModal';

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

  return (
    <section className={`${spaceGrotesk.className} relative w-full`}>
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <h1 className="pl-2 text-3xl font-bold text-white sm:text-4xl md:text-5xl">
          Welcome <span id="welcome-name">{displayName}</span>
        </h1>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="
              rounded-lg px-4 py-2 text-white
              bg-white/10 ring-1 ring-white/20 hover:bg-white/15
              shadow-[0_8px_40px_rgba(255,255,255,0.06)]
              transition active:scale-[0.99]
            "
          >
            Run test
          </button>

          <button
            type="button"
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
