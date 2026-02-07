export type MobileTab = 'files' | 'agents' | 'tasks' | 'activity';

interface MobileBottomNavProps {
  activeTab: MobileTab;
  onChange: (tab: MobileTab) => void;
}

const NAV_ITEMS: Array<{ id: MobileTab; label: string; icon: string }> = [
  { id: 'files', label: 'Files', icon: '📁' },
  { id: 'agents', label: 'Agents', icon: '🤖' },
  { id: 'tasks', label: 'Tasks', icon: '📋' },
  { id: 'activity', label: 'Activity', icon: '⚡' },
];

export default function MobileBottomNav({ activeTab, onChange }: MobileBottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border-primary)] bg-[var(--bg-primary)] md:hidden">
      <ul className="grid grid-cols-4">
        {NAV_ITEMS.map((item) => {
          const active = item.id === activeTab;

          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onChange(item.id)}
                className={`mc-shell-btn flex w-full flex-col items-center gap-0.5 rounded-none border-x-0 border-b-0 border-t-0 px-2 py-2 text-[11px] ${
                  active ? 'mc-shell-btn-active text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
                }`}
              >
                <span className="text-sm leading-none">{item.icon}</span>
                <span className="uppercase tracking-wide">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
