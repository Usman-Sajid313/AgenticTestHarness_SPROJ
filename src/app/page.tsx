import DashboardHero from '@/app/components/DashboardHero';

export default function HomePage() {
  return (
    <main className="relative min-h-screen w-full bg-black">
      <div className="absolute inset-0 bg-deep-space" />
      <div className="absolute inset-0 bg-deep-space-anim opacity-70" />
      <div className="pointer-events-none absolute -top-32 left-1/3 h-96 w-96 -translate-x-1/2 rounded-full bg-purple-500/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-7rem] right-1/4 h-[28rem] w-[28rem] translate-x-1/2 rounded-full bg-fuchsia-400/10 blur-3xl" />
      <div className="relative mx-auto max-w-6xl px-6 py-12">
        <DashboardHero />
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-xl">
            <h3 className="mb-2 text-lg font-semibold text-white">
              Recent Runs
            </h3>
            <p className="text-sm text-white/70">
              Your latest agent test runs will appear here.
            </p>
          </div>
          <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-xl">
            <h3 className="mb-2 text-lg font-semibold text-white">
              Quick Tips
            </h3>
            <p className="text-sm text-white/70">
              Create a Tool → Add Endpoints → Run a Suite.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
