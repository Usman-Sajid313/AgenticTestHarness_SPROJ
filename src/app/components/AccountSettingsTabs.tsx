'use client';

import { useState } from 'react';
import ModelSettingsCard from '@/app/components/ModelSettingsCard';
import ProfileSettingsCard from '@/app/components/ProfileSettingsCard';
import ApiTokensCard from '@/app/components/ApiTokensCard';

type TabId = 'profile' | 'models' | 'tokens';

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'profile', label: 'Profile' },
  { id: 'models', label: 'Models' },
  { id: 'tokens', label: 'API Tokens' },
];

export default function AccountSettingsTabs() {
  const [activeTab, setActiveTab] = useState<TabId>('profile');

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-900 p-1">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? 'bg-zinc-100 text-zinc-950'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'profile' && <ProfileSettingsCard />}
      {activeTab === 'models' && <ModelSettingsCard />}
      {activeTab === 'tokens' && <ApiTokensCard />}
    </div>
  );
}
