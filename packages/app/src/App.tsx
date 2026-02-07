import { useState, useEffect, useCallback, useRef } from 'react';
import MarkdownPreview from './components/MarkdownPreview';
import FileTree from './components/FileTree';
import CodeMirrorEditor from './components/CodeMirrorEditor';
import QuickSwitcher from './components/QuickSwitcher';
import ActivityStream from './components/ActivityStream';
import TaskBoard from './components/TaskBoard';
import SyncStatusBadge from './components/SyncStatusBadge';
import MobileBottomNav, { type MobileTab } from './components/MobileBottomNav';
import { useWebSocket } from './hooks/useWebSocket';
import { useActivityStream } from './hooks/useActivityStream';
import { useTaskBoard } from './hooks/useTaskBoard';
import { useIsMobile } from './hooks/useIsMobile';
import { useSyncStatus } from './hooks/useSyncStatus';

const API = '';
const MC_API_BASE = 'http://100.106.69.9:3000';
const OPENCLAW = 'http://100.106.69.9:18789';

interface Agent {
  id: string;
  name: string;
  emoji: string;
  model: string;
  gateway: string;
  status: 'online' | 'offline';
  lastActivity?: {
    action: string;
    timestamp: string;
  };
}

export default function App() {
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [sidebarTab, setSidebarTab] = useState<'files' | 'agents' | 'tasks'>('files');
  const [mobileTab, setMobileTab] = useState<MobileTab>('files');
  const [tabletSidebarOpen, setTabletSidebarOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [watchMode, setWatchMode] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [followingAgent, setFollowingAgent] = useState<string | null>(null);
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [activityPanelOpen, setActivityPanelOpen] = useState(true);
  const [mobileActivityPanelOpen, setMobileActivityPanelOpen] = useState(true);
  const [highlightTaskId, setHighlightTaskId] = useState<number | null>(null);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [reloadPrompt, setReloadPrompt] = useState<{ path: string; content: string } | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const lastContentRef = useRef('');
  const currentFileRef = useRef<string | null>(null);
  const isMobile = useIsMobile();
  const { activities } = useActivityStream({ apiBase: API, maxEntries: 200 });
  const {
    tasks,
    loading: tasksLoading,
    error: tasksError,
    columns: taskColumns,
    createTask,
    moveTask,
  } = useTaskBoard({ apiBase: MC_API_BASE });
  const { status: syncStatus, label: syncStatusLabel } = useSyncStatus({ apiBase: API });

  // Update ref
  useEffect(() => {
    currentFileRef.current = currentFile;
  }, [currentFile]);

  // WebSocket for real-time updates
  const { connected } = useWebSocket({
    onFileChange: useCallback((path: string, content: string) => {
      // If user is editing this file, show reload prompt
      if (currentFileRef.current === path && editMode) {
        setReloadPrompt({ path, content });
      } else if (currentFileRef.current === path) {
        // Live update in preview mode
        setFileContent(content);
      }
    }, [editMode]),
    onFileCreate: useCallback((path: string) => {
      // Refresh file tree if in files tab
      // This would need a refresh trigger
    }, []),
    onFileDelete: useCallback((path: string) => {
      if (currentFileRef.current === path) {
        setCurrentFile(null);
        setFileContent('');
      }
    }, []),
    onMention: useCallback((agent: string, document: string, instruction: string) => {
      console.log(`[WS] ${agent} mentioned in ${document}: ${instruction}`);
    }, []),
  });

  // Fetch agents from OpenClaw Gateway
  useEffect(() => {
    fetch(`${OPENCLAW}/api/agents`)
      .then(r => r.json())
      .then(data => {
        const agentList = data.list || data.agents || [];
        setAgents(agentList.map((a: any) => ({
          id: a.id || a.name?.toLowerCase(),
          name: a.name || a.id,
          emoji: a.emoji || '🤖',
          model: a.model || 'unknown',
          gateway: a.gateway || 'unknown',
          status: 'online'
        })));
      })
      .catch(() => {
        setAgents([
          { id: 'main', name: 'Ada', emoji: '🔮', model: 'Opus 4.6', gateway: 'ada-gateway', status: 'online' },
          { id: 'spock', name: 'Spock', emoji: '🖖', model: 'Kimi', gateway: 'ada-gateway', status: 'online' },
          { id: 'scotty', name: 'Scotty', emoji: '🔧', model: 'Sonnet', gateway: 'Pi', status: 'online' },
        ]);
      });
  }, []);

  // Keep followed agent valid as agent list changes.
  useEffect(() => {
    if (agents.length === 0) {
      setFollowingAgent(null);
      return;
    }

    setFollowingAgent((current) => {
      if (current && agents.some((agent) => agent.id === current)) {
        return current;
      }
      const onlineAgent = agents.find((agent) => agent.status === 'online');
      return (onlineAgent ?? agents[0]).id;
    });
  }, [agents]);

  useEffect(() => {
    if (isMobile) {
      setTabletSidebarOpen(false);
    }
  }, [isMobile]);

  // Fetch file content
  useEffect(() => {
    if (!currentFile) return;
    fetch(`${API}/api/file?path=${encodeURIComponent(currentFile)}`)
      .then(r => r.json())
      .then(d => {
        setFileContent(d.content || '');
        lastContentRef.current = d.content || '';
        setLastSaved(Date.now());
      })
      .catch(console.error);
  }, [currentFile]);

  // Auto-save with debounce
  const scheduleAutoSave = useCallback((content: string) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      if (content !== lastContentRef.current && currentFile) {
        await fetch(`${API}/api/file?path=${encodeURIComponent(currentFile)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        });
        lastContentRef.current = content;
        setLastSaved(Date.now());
      }
    }, 2000);
  }, [currentFile]);

  // Handle content changes
  const handleContentChange = useCallback((newContent: string) => {
    setFileContent(newContent);
    scheduleAutoSave(newContent);
  }, [scheduleAutoSave]);

  // Handle @mention - send to OpenClaw
  const handleSave = useCallback(async () => {
    if (!currentFile) return;

    // Check for @mentions
    const mentionRegex = /@(\w+)/g;
    const matches = fileContent.match(mentionRegex);
    if (matches && matches.length > 0) {
      const mentionedAgents = [...new Set(matches.map(m => m.slice(1)))];
      for (const agent of mentionedAgents) {
        try {
          await fetch(`${API}/api/mention`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agent,
              document: currentFile,
              instruction: `User mentioned you in ${currentFile.split('/').pop()}. Please help with the content.`,
              context: fileContent.slice(0, 1000),
              author: 'Henry',
            }),
          });
          console.log(`[Mention] Notified ${agent}`);
        } catch (e) {
          console.error(`[Mention] Failed to notify ${agent}:`, e);
        }
      }
    }

    // Save file
    await fetch(`${API}/api/file?path=${encodeURIComponent(currentFile)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: fileContent }),
    });
    lastContentRef.current = fileContent;
    setLastSaved(Date.now());
  }, [currentFile, fileContent]);

  const handleFileSelect = (path: string) => {
    setSidebarTab('files');
    setMobileTab('files');
    setTabletSidebarOpen(false);
    setCurrentFile(path);
    setEditMode(false);
    setReloadPrompt(null);
    setHighlightTaskId(null);
  };

  const handleTaskSelect = (taskId: number) => {
    setSidebarTab('tasks');
    setMobileTab('tasks');
    setTabletSidebarOpen(false);
    setHighlightTaskId(taskId);
  };

  const handleSidebarTabChange = (tab: 'files' | 'agents' | 'tasks') => {
    setSidebarTab(tab);
    setTabletSidebarOpen(false);
  };

  const handleReload = () => {
    if (reloadPrompt) {
      setFileContent(reloadPrompt.content);
      lastContentRef.current = reloadPrompt.content;
      setReloadPrompt(null);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        setQuickSwitcherOpen(true);
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault();
        if (currentFile) setEditMode(m => !m);
      } else if ((e.metaKey || e.ctrlKey) && e.key === 's' && editMode && !watchMode) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentFile, editMode, handleSave, watchMode]);

  const fileName = currentFile ? currentFile.split('/').pop() : '';
  const savedAgo = lastSaved ? Math.floor((Date.now() - lastSaved) / 1000) : 0;
  const selectedAgentData = selectedAgent ? agents.find((agent) => agent.id === selectedAgent) : null;
  const followingAgentData = followingAgent ? agents.find((agent) => agent.id === followingAgent) : null;
  const selectedAgentActivity = selectedAgentData
    ? activities
      .filter((entry) => entry.agentName.toLowerCase() === selectedAgentData.name.toLowerCase())
      .slice(0, 10)
    : [];
  const activeTasks = tasks.filter((task) => task.column === 'doing');

  const renderAgentsPanel = () => (
    <div className="p-2">
      {agents.map((agent) => (
        <div key={agent.id}>
          <button
            onClick={() => {
              if (watchMode) {
                setFollowingAgent(agent.id);
                setSelectedAgent(agent.id);
                return;
              }
              setSelectedAgent(selectedAgent === agent.id ? null : agent.id);
            }}
            className={`mc-shell-card mb-2 w-full border p-3 text-left transition-colors ${
              selectedAgent === agent.id
                ? 'border-[var(--border-secondary)] bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                : watchMode && followingAgent === agent.id
                  ? 'border-[var(--accent)] bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <div className="mb-1 flex items-center gap-2">
              <span className="text-lg">{agent.emoji}</span>
              <span className="font-medium">{agent.name}</span>
              <span className={`ml-auto h-2 w-2 rounded-full ${agent.status === 'online' ? 'bg-[var(--accent)]' : 'bg-[var(--text-muted)]'}`} />
            </div>
            <div className="text-xs text-[var(--text-muted)]">{agent.model} · {agent.gateway}</div>
            {watchMode && followingAgent === agent.id && (
              <div className="mt-1 text-xs text-[var(--accent)]">Following in Watch Mode</div>
            )}
          </button>
          {selectedAgent === agent.id && (
            <div className="mc-shell-card mb-4 ml-4 border p-3">
              <div className="mb-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">Recent Activity</div>
              {selectedAgentActivity.length > 0 ? (
                selectedAgentActivity.map((entry) => (
                  <div key={entry.id} className="mb-2 border-b border-[var(--border-secondary)] pb-2 text-sm last:border-0">
                    <div className="text-[var(--text-secondary)]">{entry.action || entry.description || 'Activity'}</div>
                    <div className="text-xs text-[var(--text-muted)]">{new Date(entry.timestamp).toLocaleString()}</div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-[var(--text-muted)]">No recent activity</div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const renderTaskSidebarPanel = () => (
    <div className="p-2">
      <div className="mb-2 px-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">Active Tasks</div>
      {tasksLoading && <div className="mb-2 px-2 text-xs text-[var(--text-muted)]">Loading tasks...</div>}
      {tasksError && <div className="mb-2 px-2 text-xs text-[var(--error)]">{tasksError}</div>}
      {activeTasks.map((task) => (
        <div key={task.id} className="mc-shell-card mb-1 w-full p-2 text-left text-sm">
          <div className="truncate font-medium">{task.name}</div>
          <div className="text-xs text-[var(--text-muted)]">#{task.id} · {task.assignee}</div>
        </div>
      ))}
      {activeTasks.length === 0 && (
        <div className="px-2 text-xs text-[var(--text-muted)]">No active tasks</div>
      )}
    </div>
  );

  const renderSidebarContent = () => {
    if (sidebarTab === 'files') {
      return <FileTree onSelect={handleFileSelect} selected={currentFile} />;
    }

    if (sidebarTab === 'agents') {
      return renderAgentsPanel();
    }

    return renderTaskSidebarPanel();
  };

  const renderSidebar = (showCloseButton: boolean) => (
    <>
      <div className="flex items-center gap-2 border-b border-[var(--border-primary)] p-4 text-lg font-bold text-[var(--text-primary)]">
        <span>⚡</span>
        <span className="flex-1">Entity</span>
        {showCloseButton && (
          <button
            type="button"
            onClick={() => setTabletSidebarOpen(false)}
            className="mc-shell-btn px-2 py-1 text-xs font-medium"
          >
            Close
          </button>
        )}
      </div>
      <div className="flex border-b border-[var(--border-primary)] px-2 py-2">
        {(['files', 'agents', 'tasks'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => handleSidebarTabChange(tab)}
            className={`mc-shell-btn flex-1 px-2 py-2 text-xs uppercase tracking-wider ${
              sidebarTab === tab
                ? 'mc-shell-btn-active text-[var(--text-primary)]'
                : 'text-[var(--text-muted)]'
            }`}
          >
            {tab === 'files' ? '📁' : tab === 'agents' ? '🤖' : '📋'} {tab}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto">{renderSidebarContent()}</div>
    </>
  );

  const renderDesktopWorkspace = (viewport: 'desktop' | 'tablet') => (
    <>
      {sidebarTab === 'tasks' ? (
        <div className="flex-1 min-h-0">
          <TaskBoard
            viewport={viewport}
            apiBase={MC_API_BASE}
          />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-2">
            <button
              type="button"
              onClick={() => {
                setWatchMode((prev) => {
                  const next = !prev;
                  if (next && !followingAgent && agents.length > 0) {
                    const onlineAgent = agents.find((agent) => agent.status === 'online');
                    setFollowingAgent((onlineAgent ?? agents[0]).id);
                  }
                  return next;
                });
              }}
              className={`mc-shell-btn px-3 py-1 text-xs font-medium ${
                watchMode
                  ? 'mc-shell-btn-active border-[var(--accent)] text-[var(--text-primary)]'
                  : ''
              }`}
            >
              {watchMode ? 'Switch to Interact Mode' : 'Switch to Watch Mode'}
            </button>
            {watchMode ? (
              <>
                <span className="mc-shell-pill border-[var(--accent)] px-2 py-1 text-xs font-semibold tracking-wider text-[var(--accent)]">
                  WATCHING
                </span>
                <span className="text-sm text-[var(--text-secondary)]">
                  Following:{' '}
                  {followingAgentData ? `${followingAgentData.emoji} ${followingAgentData.name}` : 'No agent selected'}
                </span>
              </>
            ) : (
              <span className="text-sm text-[var(--text-muted)]">Interact mode: editing enabled</span>
            )}
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            {currentFile ? (
              <>
                <div className="flex items-center gap-2 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-2 text-sm">
                  <span className="flex-1 truncate text-[var(--text-muted)]">{currentFile}</span>
                  <button
                    onClick={() => setEditMode(!editMode)}
                    className={`mc-shell-btn px-3 py-1 text-xs ${
                      editMode
                        ? 'mc-shell-btn-active border-[var(--accent)] text-[var(--text-primary)]'
                        : ''
                    }`}
                  >
                    {editMode ? '👁️ Preview' : '✏️ Edit'}
                  </button>
                  {watchMode && editMode && (
                    <span className="mc-shell-pill px-2 py-1 text-xs text-[var(--text-secondary)]">Read-only while watching</span>
                  )}
                  {editMode && !watchMode && (
                    <button
                      onClick={handleSave}
                      className="mc-shell-btn mc-shell-btn-active border-[var(--accent)] px-3 py-1 text-xs font-medium text-[var(--text-primary)]"
                    >
                      💾 Save
                    </button>
                  )}
                </div>
                <div className="min-h-0 flex-1 overflow-auto">
                  {editMode ? (
                    <CodeMirrorEditor
                      content={fileContent}
                      onChange={handleContentChange}
                      onSave={handleSave}
                      readOnly={watchMode}
                    />
                  ) : (
                    <div className="mx-auto max-w-4xl p-8">
                      <MarkdownPreview content={fileContent} />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4 border-t border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-1 text-xs text-[var(--text-muted)]">
                  <span>{fileName}</span>
                  <span>|</span>
                  <span>{fileContent.split(/\s+/).filter(Boolean).length} words</span>
                  <span>|</span>
                  <span>{fileContent.length} chars</span>
                  {savedAgo > 0 && (
                    <span className="ml-auto text-[var(--accent)]">✓ Saved {savedAgo}s ago</span>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 text-[var(--text-muted)]">
                <span className="text-6xl">⚡</span>
                <span className="text-xl">Select a file to preview</span>
                <div className="flex gap-4 text-sm">
                  <span className="mc-shell-card px-2 py-1">⌘P quick switch</span>
                  <span className="mc-shell-card px-2 py-1">⌘E edit/preview</span>
                </div>
              </div>
            )}
          </div>
        </>
      )}
      <ActivityStream
        activities={activities}
        isOpen={activityPanelOpen}
        onToggleOpen={() => setActivityPanelOpen((prev) => !prev)}
        onOpenFile={handleFileSelect}
        onOpenTask={handleTaskSelect}
      />
    </>
  );

  return (
    <div className="entity-shell flex h-screen overflow-hidden bg-[var(--bg-primary)] text-[var(--text-secondary)]">
      <div
        className={`mc-shell-btn fixed right-2 z-50 px-2 py-1 text-xs ${
          isMobile ? 'bottom-16' : 'bottom-2'
        } ${
          connected
            ? 'mc-shell-btn-active border-[var(--accent)] text-[var(--accent)]'
            : 'border-[var(--error)] text-[var(--error)]'
        }`}
      >
        {connected ? '● Live' : '○ Disconnected'}
      </div>

      <QuickSwitcher
        isOpen={quickSwitcherOpen}
        onClose={() => setQuickSwitcherOpen(false)}
        onSelect={handleFileSelect}
      />

      {reloadPrompt && (
        <div className="fixed left-0 right-0 top-0 z-50 flex items-center justify-between border-b border-[var(--border-secondary)] bg-[var(--bg-secondary)] px-4 py-2 text-[var(--text-primary)]">
          <span>📝 Agent updated this file. <strong>Reload to see changes?</strong></span>
          <div className="flex gap-2">
            <button
              onClick={handleReload}
              className="mc-shell-btn mc-shell-btn-active border-[var(--accent)] px-3 py-1 text-sm font-medium text-[var(--text-primary)]"
            >
              Reload
            </button>
            <button onClick={() => setReloadPrompt(null)} className="mc-shell-btn px-3 py-1 text-sm">
              Ignore
            </button>
          </div>
        </div>
      )}

      <aside className="hidden w-64 shrink-0 flex-col border-r border-[var(--border-primary)] bg-[var(--bg-primary)] lg:flex">
        {renderSidebar(false)}
      </aside>

      <div className="hidden min-w-0 flex-1 flex-col bg-[var(--bg-primary)] lg:flex">
        <div className="flex items-center justify-between border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-2">
          <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Desktop Workspace</div>
          <SyncStatusBadge status={syncStatus} label={syncStatusLabel} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{renderDesktopWorkspace('desktop')}</div>
      </div>

      <div className="hidden min-w-0 flex-1 flex-col bg-[var(--bg-primary)] md:flex lg:hidden">
        <div className="flex items-center gap-2 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-2">
          <button
            type="button"
            onClick={() => setTabletSidebarOpen(true)}
            className="mc-shell-btn px-3 py-1 text-xs font-medium"
          >
            ☰ Panels
          </button>
          <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{sidebarTab}</div>
          <div className="ml-auto">
            <SyncStatusBadge status={syncStatus} label={syncStatusLabel} compact />
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{renderDesktopWorkspace('tablet')}</div>
      </div>

      {tabletSidebarOpen && (
        <div
          className="fixed inset-0 z-40 hidden bg-[var(--overlay-strong)] md:block lg:hidden"
          onClick={() => setTabletSidebarOpen(false)}
        >
          <aside
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-[var(--border-primary)] bg-[var(--bg-primary)]"
            onClick={(event) => event.stopPropagation()}
          >
            {renderSidebar(true)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col bg-[var(--bg-primary)] pb-14 md:hidden">
        <div className="flex items-center justify-between border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3">
          <div className="text-sm font-semibold">Entity Mission Control</div>
          <div className="flex items-center gap-2">
            <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{mobileTab}</div>
            <SyncStatusBadge status={syncStatus} label={syncStatusLabel} compact />
          </div>
        </div>

        <div className="min-h-0 flex-1">
          {mobileTab === 'files' && (
            <div className="flex h-full min-h-0 flex-col">
              <div className={`${currentFile ? 'h-1/2 min-h-0 border-b border-[var(--border-primary)]' : 'flex-1 min-h-0'}`}>
                <FileTree onSelect={handleFileSelect} selected={currentFile} />
              </div>
              {currentFile && (
                <div className="flex h-1/2 min-h-0 flex-col">
                  <div className="flex items-center gap-2 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-2 text-xs">
                    <span className="flex-1 truncate text-[var(--text-muted)]">{currentFile}</span>
                    <button
                      onClick={() => setEditMode(!editMode)}
                      className={`mc-shell-btn px-2 py-1 text-[11px] ${editMode ? 'mc-shell-btn-active text-[var(--text-primary)]' : ''}`}
                    >
                      {editMode ? 'Preview' : 'Edit'}
                    </button>
                    {editMode && !watchMode && (
                      <button
                        onClick={handleSave}
                        className="mc-shell-btn mc-shell-btn-active border-[var(--accent)] px-2 py-1 text-[11px] font-medium text-[var(--text-primary)]"
                      >
                        Save
                      </button>
                    )}
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto">
                    {editMode ? (
                      <CodeMirrorEditor
                        content={fileContent}
                        onChange={handleContentChange}
                        onSave={handleSave}
                        readOnly={watchMode}
                      />
                    ) : (
                      <div className="mx-auto max-w-3xl p-4">
                        <MarkdownPreview content={fileContent} />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {mobileTab === 'agents' && (
            <div className="h-full overflow-auto">
              {renderAgentsPanel()}
            </div>
          )}

          {mobileTab === 'tasks' && (
            <TaskBoard
              viewport="mobile"
              apiBase={MC_API_BASE}
            />
          )}

          {mobileTab === 'activity' && (
            <ActivityStream
              activities={activities}
              isOpen={mobileActivityPanelOpen}
              onToggleOpen={() => setMobileActivityPanelOpen((prev) => !prev)}
              onOpenFile={handleFileSelect}
              onOpenTask={handleTaskSelect}
              fillHeight
            />
          )}
        </div>
      </div>

      <MobileBottomNav
        activeTab={mobileTab}
        onChange={(tab) => {
          setTabletSidebarOpen(false);
          setMobileTab(tab);
          if (tab === 'tasks') {
            setSidebarTab('tasks');
            return;
          }
          if (tab === 'files' || tab === 'agents') {
            setSidebarTab(tab);
          }
        }}
      />
    </div>
  );
}
