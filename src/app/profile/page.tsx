import ProfileSettingsCard from '@/app/components/ProfileSettingsCard';

export default function ProfilePage() {
  return (
    <main className="min-h-screen w-full bg-zinc-950">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
        <header>
          <h1 className="text-3xl font-bold text-white sm:text-4xl">Profile Settings</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Update your display name and change your password.
          </p>
        </header>

        <ProfileSettingsCard />
      </div>
    </main>
  );
}
