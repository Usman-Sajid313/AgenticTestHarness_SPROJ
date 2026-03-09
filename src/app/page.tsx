import DashboardHero from '@/app/components/DashboardHero';
import AnalyticsDashboard from '@/app/components/AnalyticsDashboard';
import ProjectList from '@/app/components/projects/ProjectList';
import CreateProjectButton from '@/app/components/projects/CreateProjectButton';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <main className="min-h-full w-full bg-zinc-950">
      <DashboardHero />

      <AnalyticsDashboard />

      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-zinc-100">Projects</h2>
            <p className="mt-1 text-sm text-zinc-500">Manage your agent evaluation projects</p>
          </div>
          <CreateProjectButton />
        </div>

        <div className="mt-6">
          <ProjectList />
        </div>
      </div>
    </main>
  );
}
