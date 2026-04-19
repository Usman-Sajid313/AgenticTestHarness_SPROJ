import Link from 'next/link';
import AccountSettingsTabs from '@/app/components/AccountSettingsTabs';

export default function ProfilePage() {
  return (
    <main className="min-h-screen w-full bg-zinc-950">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
        <Link href="/" className="inline-flex text-sm text-zinc-400 transition hover:text-zinc-200">
          ← Back to Dashboard
        </Link>

        <header>
          <h1 className="text-3xl font-bold text-white sm:text-4xl">Settings</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Manage your account details and the evaluator and judge models used by this workspace.
          </p>
        </header>

        <AccountSettingsTabs />
      </div>
    </main>
  );
}
