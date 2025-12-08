import DashboardHero from '@/app/components/DashboardHero';
import ProjectList from '@/app/components/projects/ProjectList';
import CreateProjectButton from '@/app/components/projects/CreateProjectButton';

export default function HomePage() {
  return (
    <main className="relative min-h-screen w-full bg-black">
      <div className="absolute inset-0 bg-deep-space" />
      <div className="absolute inset-0 bg-deep-space-anim opacity-70" />
      <div className="pointer-events-none absolute -top-32 left-1/3 h-96 w-96 -translate-x-1/2 rounded-full bg-purple-500/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-7rem] right-1/4 h-[28rem] w-[28rem] translate-x-1/2 rounded-full bg-fuchsia-400/10 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-6 py-12">
        <DashboardHero />

        <div className="mt-16 flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-white">Your Projects</h2>
          <CreateProjectButton />
        </div>

        <div className="mt-8">
          <ProjectList />
        </div>
      </div>
    </main>
  );
}
