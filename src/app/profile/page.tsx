import ProfileSettingsCard from '@/app/components/ProfileSettingsCard';

export default function ProfilePage() {
  return (
    <main className="relative min-h-screen w-full bg-black">
      <div className="absolute inset-0 bg-deep-space" />
      <div className="absolute inset-0 bg-deep-space-anim opacity-70" />
      <div className="pointer-events-none absolute -top-32 left-1/3 h-96 w-96 -translate-x-1/2 rounded-full bg-purple-500/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-7rem] right-1/4 h-[28rem] w-[28rem] translate-x-1/2 rounded-full bg-fuchsia-400/10 blur-3xl" />
      <div className="relative mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
        <header>
          <h1 className="text-3xl font-bold text-white sm:text-4xl">Profile Settings</h1>
          <p className="mt-2 text-sm text-white/70">
            Update your display name and change your password.
          </p>
        </header>

        <ProfileSettingsCard />
      </div>
    </main>
  );
}

