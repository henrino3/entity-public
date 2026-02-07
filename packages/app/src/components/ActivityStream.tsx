import { useEffect, useMemo, useRef, useState } from 'react';
import type { ActivityEntry, ActivityType } from '../hooks/useActivityStream';

interface ActivityStreamProps {
  activities: ActivityEntry[];
  isOpen: boolean;
  onToggleOpen: () => void;
  onOpenFile: (path: string) => void;
  onOpenTask: (taskId: number) => void;
  fillHeight?: boolean;
}

const TYPE_ICON: Record<ActivityType, string> = {
  file_edit: '📝',
  tool_call: '🛠️',
  message_sent: '💬',
  command_run: '⌘',
  research: '🔎',
  thinking: '🧠',
  task_created: '📥',
  task_updated: '✏️',
  task_moved: '📦',
  task_completed: '✅',
  task_deleted: '🗑️',
};

const TYPE_STYLES: Record<ActivityType, { card: string; badge: string }> = {
  file_edit: {
    card: 'border-[var(--accent)]',
    badge: 'border-[var(--accent)] text-[var(--accent)]',
  },
  tool_call: {
    card: 'border-[var(--border-secondary)]',
    badge: 'border-[var(--border-secondary)] text-[var(--text-secondary)]',
  },
  message_sent: {
    card: 'border-[var(--accent)]',
    badge: 'border-[var(--accent)] text-[var(--accent)]',
  },
  command_run: {
    card: 'border-[var(--border-secondary)]',
    badge: 'border-[var(--border-secondary)] text-[var(--text-secondary)]',
  },
  research: {
    card: 'border-[var(--border-secondary)]',
    badge: 'border-[var(--border-secondary)] text-[var(--text-secondary)]',
  },
  thinking: {
    card: 'border-[var(--border-secondary)]',
    badge: 'border-[var(--border-secondary)] text-[var(--text-secondary)]',
  },
  task_created: {
    card: 'border-[var(--accent)]',
    badge: 'border-[var(--accent)] text-[var(--accent)]',
  },
  task_updated: {
    card: 'border-[var(--accent)]',
    badge: 'border-[var(--accent)] text-[var(--accent)]',
  },
  task_moved: {
    card: 'border-[var(--border-secondary)]',
    badge: 'border-[var(--border-secondary)] text-[var(--text-secondary)]',
  },
  task_completed: {
    card: 'border-[var(--accent)]',
    badge: 'border-[var(--accent)] text-[var(--accent)]',
  },
  task_deleted: {
    card: 'border-[var(--error)]',
    badge: 'border-[var(--error)] text-[var(--error)]',
  },
};

function formatTypeLabel(type: ActivityType): string {
  return type.split('_').join(' ');
}

function formatRelativeTime(timestamp: string, nowMs: number): string {
  const ts = new Date(timestamp).getTime();
  if (Number.isNaN(ts)) {
    return 'now';
  }

  const deltaSeconds = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (deltaSeconds < 60) {
    return `${deltaSeconds}s ago`;
  }

  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }

  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }

  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays}d ago`;
}

export default function ActivityStream({
  activities,
  isOpen,
  onToggleOpen,
  onOpenFile,
  onOpenTask,
  fillHeight = false,
}: ActivityStreamProps) {
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const listRef = useRef<HTMLDivElement | null>(null);

  const sortedActivities = useMemo(() => [...activities].reverse(), [activities]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!isOpen || !autoScrollEnabled || !listRef.current) {
      return;
    }

    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [autoScrollEnabled, isOpen, sortedActivities]);

  return (
    <div
      className={`border-t border-[var(--border-primary)] bg-[var(--bg-primary)] ${
        fillHeight ? 'flex h-full min-h-0 flex-col' : ''
      }`}
    >
      <div className="flex items-center justify-between border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-2">
        <div className="text-sm font-semibold text-[var(--text-secondary)]">Activity Stream</div>
        <div className="flex items-center gap-2">
          {isOpen && (
            <button
              type="button"
              onClick={() => setAutoScrollEnabled((prev) => !prev)}
              className={`mc-shell-btn px-2 py-1 text-xs ${
                autoScrollEnabled
                  ? ''
                  : 'mc-shell-btn-active border-[var(--accent)] text-[var(--accent)]'
              }`}
            >
              {autoScrollEnabled ? 'Pause auto-scroll' : 'Resume auto-scroll'}
            </button>
          )}
          <button
            type="button"
            onClick={onToggleOpen}
            className="mc-shell-btn px-2 py-1 text-xs"
          >
            {isOpen ? 'Hide panel' : 'Show panel'}
          </button>
        </div>
      </div>

      {isOpen && (
        <div
          ref={listRef}
          className={`overflow-y-auto px-3 py-2 space-y-2 ${fillHeight ? 'flex-1 min-h-0' : 'h-64'}`}
        >
          {sortedActivities.length === 0 ? (
            <div className="text-sm text-[var(--text-muted)] px-2 py-3">Waiting for agent activity...</div>
          ) : (
            sortedActivities.map((entry) => {
              const style = TYPE_STYLES[entry.type];
              const containerClass = `mc-shell-card w-full border px-3 py-2 text-left transition-colors hover:bg-[var(--bg-tertiary)] ${style.card}`;
              const timeLabel = formatRelativeTime(entry.timestamp, nowMs);
              const content = (
                <>
                  <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                    <span>{TYPE_ICON[entry.type]}</span>
                    <span>{entry.agentEmoji}</span>
                    <span className="font-semibold text-[var(--text-primary)]">{entry.agentName}</span>
                    <span className={`mc-shell-pill rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${style.badge}`}>
                      {formatTypeLabel(entry.type)}
                    </span>
                    <span className="ml-auto text-[var(--text-muted)]">{timeLabel}</span>
                  </div>
                  <div className="mt-1 text-sm text-[var(--text-primary)]">
                    <span className="font-medium">{entry.action}</span>
                    <span className="text-[var(--text-secondary)]"> · {entry.description}</span>
                  </div>
                  {entry.taskId !== undefined ? (
                    <div className="mt-1 text-xs text-[var(--accent)] truncate">
                      Open task: #{entry.taskId}{entry.taskColumn ? ` · ${entry.taskColumn}` : ''}
                    </div>
                  ) : null}
                  {entry.filePath && (
                    <div className="mt-1 text-xs text-[var(--accent)] truncate">Open file: {entry.filePath}</div>
                  )}
                </>
              );

              if (entry.taskId !== undefined) {
                const taskId = entry.taskId;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={containerClass}
                    onClick={() => onOpenTask(taskId)}
                    title={`Open task #${taskId}`}
                  >
                    {content}
                  </button>
                );
              }

              if (entry.filePath) {
                const filePath = entry.filePath;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={containerClass}
                    onClick={() => onOpenFile(filePath)}
                    title={`Open ${filePath}`}
                  >
                    {content}
                  </button>
                );
              }

              return (
                <div key={entry.id} className={containerClass}>
                  {content}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
