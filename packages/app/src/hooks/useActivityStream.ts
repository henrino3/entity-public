import { useCallback, useEffect, useState } from 'react';
import { create } from 'zustand';

const DEFAULT_API_BASE = '';
const DEFAULT_MAX_ENTRIES = 200;
const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_MOCK_INTERVAL_RANGE: [number, number] = [2000, 5000];

export type ActivitySource = 'agent' | 'task';

export type ActivityType =
  | 'file_edit'
  | 'tool_call'
  | 'message_sent'
  | 'command_run'
  | 'research'
  | 'thinking'
  | 'task_created'
  | 'task_updated'
  | 'task_moved'
  | 'task_completed'
  | 'task_deleted';

const TYPE_VALUES: ActivityType[] = [
  'file_edit',
  'tool_call',
  'message_sent',
  'command_run',
  'research',
  'thinking',
  'task_created',
  'task_updated',
  'task_moved',
  'task_completed',
  'task_deleted',
];

export interface ActivityEntry {
  id: string;
  source: ActivitySource;
  type: ActivityType;
  agentName: string;
  agentEmoji: string;
  action: string;
  description: string;
  timestamp: string;
  filePath?: string;
  taskId?: number;
  taskColumn?: string;
  metadata?: string;
}

interface ActivityStreamState {
  activities: ActivityEntry[];
  paused: boolean;
  maxEntries: number;
  addActivity: (entry: ActivityEntry) => void;
  setActivities: (entries: ActivityEntry[]) => void;
  clearActivities: () => void;
  setPaused: (paused: boolean) => void;
  setMaxEntries: (maxEntries: number) => void;
}

interface UseActivityStreamOptions {
  apiBase?: string;
  maxEntries?: number;
  pollIntervalMs?: number;
  useMockData?: boolean;
  mockIntervalRangeMs?: [min: number, max: number];
}

export const useActivityStreamStore = create<ActivityStreamState>((set) => ({
  activities: [],
  paused: false,
  maxEntries: DEFAULT_MAX_ENTRIES,
  addActivity: (entry) =>
    set((state) => {
      if (state.paused) {
        return state;
      }
      return {
        activities: [entry, ...state.activities].slice(0, state.maxEntries),
      };
    }),
  setActivities: (entries) =>
    set((state) => ({
      activities: entries.slice(0, state.maxEntries),
    })),
  clearActivities: () => set({ activities: [] }),
  setPaused: (paused) => set({ paused }),
  setMaxEntries: (maxEntries) =>
    set((state) => ({
      maxEntries,
      activities: state.activities.slice(0, maxEntries),
    })),
}));

const AGENTS = [
  { name: 'Ada', emoji: '🔮' },
  { name: 'Spock', emoji: '🖖' },
  { name: 'Scotty', emoji: '🔧' },
] as const;

const MOCK_FILE_PATHS = [
  'docs/architecture.md',
  'README.md',
  'packages/app/src/App.tsx',
  'packages/server/src/index.ts',
  'scripts/ralph/prd.json',
];

const MOCK_TOOL_NAMES = ['ripgrep', 'npm', 'git', 'eslint', 'prettier'];

function randomFrom<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)];
}

function randomBetween(min: number, max: number): number {
  const safeMin = Math.min(min, max);
  const safeMax = Math.max(min, max);
  return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeType(value: unknown): ActivityType {
  if (typeof value !== 'string') {
    return 'message_sent';
  }

  const normalized = value.trim().toLowerCase();
  return (TYPE_VALUES as readonly string[]).includes(normalized)
    ? (normalized as ActivityType)
    : 'message_sent';
}

function normalizeSource(value: unknown): ActivitySource {
  return value === 'task' ? 'task' : 'agent';
}

function toIsoTimestamp(value: unknown): string {
  if (typeof value === 'string') {
    const fromString = new Date(value);
    if (!Number.isNaN(fromString.getTime())) {
      return fromString.toISOString();
    }
  }

  if (typeof value === 'number') {
    const fromNumber = new Date(value);
    if (!Number.isNaN(fromNumber.getTime())) {
      return fromNumber.toISOString();
    }
  }

  return new Date().toISOString();
}

function toTaskId(value: unknown): number | undefined {
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric > 0) {
    return numeric;
  }

  return undefined;
}

function parseActivity(raw: unknown): ActivityEntry | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const source = normalizeSource(record.source);
  const type = normalizeType(record.type);
  const taskId = toTaskId(record.task_id ?? record.taskId);

  const fallbackAgentName = source === 'task' ? 'Mission Control' : 'Entity';
  const fallbackAgentEmoji = source === 'task' ? '📋' : '⚡';

  const idValue = record.id;
  const id =
    typeof idValue === 'string'
      ? idValue
      : Number.isFinite(Number(idValue))
        ? String(Number(idValue))
        : createId();

  return {
    id,
    source,
    type,
    agentName:
      typeof record.agentName === 'string'
        ? record.agentName
        : typeof record.agent_name === 'string'
          ? record.agent_name
          : fallbackAgentName,
    agentEmoji:
      typeof record.agentEmoji === 'string'
        ? record.agentEmoji
        : typeof record.agent_emoji === 'string'
          ? record.agent_emoji
          : fallbackAgentEmoji,
    action: typeof record.action === 'string' ? record.action : 'Activity',
    description: typeof record.description === 'string' ? record.description : 'No description available.',
    timestamp: toIsoTimestamp(record.timestamp ?? record.created_at),
    filePath:
      typeof record.filePath === 'string'
        ? record.filePath
        : typeof record.file_path === 'string'
          ? record.file_path
          : undefined,
    taskId,
    taskColumn:
      typeof record.taskColumn === 'string'
        ? record.taskColumn
        : typeof record.task_column === 'string'
          ? record.task_column
          : undefined,
    metadata:
      typeof record.metadata === 'string'
        ? record.metadata
        : typeof record.meta === 'string'
          ? record.meta
          : undefined,
  };
}

function extractActivities(payload: unknown): ActivityEntry[] {
  const rawList = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as Record<string, unknown>).activities)
      ? ((payload as Record<string, unknown>).activities as unknown[])
      : [];

  return rawList
    .map(parseActivity)
    .filter((entry): entry is ActivityEntry => entry !== null)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function createMockActivity(): ActivityEntry {
  const agent = randomFrom(AGENTS);
  const type = randomFrom(TYPE_VALUES);
  const filePath = randomFrom(MOCK_FILE_PATHS);
  const toolName = randomFrom(MOCK_TOOL_NAMES);

  if (type === 'task_created' || type === 'task_updated' || type === 'task_moved' || type === 'task_completed' || type === 'task_deleted') {
    const taskId = randomBetween(1, 30);
    return {
      id: createId(),
      source: 'task',
      type,
      agentName: 'Mission Control',
      agentEmoji: '📋',
      action: type === 'task_completed' ? 'Completed task' : 'Updated task',
      description: `Task #${taskId} changed in the board.`,
      timestamp: new Date().toISOString(),
      taskId,
    };
  }

  if (type === 'file_edit') {
    return {
      id: createId(),
      source: 'agent',
      type,
      agentName: agent.name,
      agentEmoji: agent.emoji,
      action: 'Edited file',
      description: `Updated ${filePath} to reflect latest workspace changes.`,
      timestamp: new Date().toISOString(),
      filePath,
    };
  }

  if (type === 'tool_call') {
    return {
      id: createId(),
      source: 'agent',
      type,
      agentName: agent.name,
      agentEmoji: agent.emoji,
      action: 'Called tool',
      description: `Ran ${toolName} to validate the current approach.`,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    id: createId(),
    source: 'agent',
    type,
    agentName: agent.name,
    agentEmoji: agent.emoji,
    action: 'Working',
    description: `Reported progress while working on ${filePath}.`,
    timestamp: new Date().toISOString(),
    filePath,
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('Invalid activity response payload.');
  }
}

async function requestWithFallback(apiBase: string, maxEntries: number): Promise<unknown> {
  const encodedLimit = encodeURIComponent(String(maxEntries));
  const candidates = [`${apiBase}/api/activities?limit=${encodedLimit}`, `${apiBase}/activities?limit=${encodedLimit}`];
  let lastError: Error | null = null;

  for (const url of candidates) {
    try {
      const response = await fetch(url);
      if (response.status === 404) {
        continue;
      }

      const payload = await readJson(response);
      if (!response.ok) {
        const message =
          payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).error === 'string'
            ? ((payload as Record<string, unknown>).error as string)
            : `Activity request failed with status ${response.status}`;
        throw new Error(message);
      }

      return payload;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown activity request error.');
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error('Unable to reach activities endpoint.');
}

export function useActivityStream({
  apiBase = DEFAULT_API_BASE,
  maxEntries = DEFAULT_MAX_ENTRIES,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  useMockData = false,
  mockIntervalRangeMs = DEFAULT_MOCK_INTERVAL_RANGE,
}: UseActivityStreamOptions = {}) {
  const activities = useActivityStreamStore((state) => state.activities);
  const paused = useActivityStreamStore((state) => state.paused);
  const storeMaxEntries = useActivityStreamStore((state) => state.maxEntries);
  const addActivity = useActivityStreamStore((state) => state.addActivity);
  const setActivities = useActivityStreamStore((state) => state.setActivities);
  const clearActivities = useActivityStreamStore((state) => state.clearActivities);
  const setPaused = useActivityStreamStore((state) => state.setPaused);
  const setMaxEntries = useActivityStreamStore((state) => state.setMaxEntries);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const safeMaxEntries = Math.max(1, maxEntries);
    if (safeMaxEntries !== storeMaxEntries) {
      setMaxEntries(safeMaxEntries);
    }
  }, [maxEntries, setMaxEntries, storeMaxEntries]);

  useEffect(() => {
    if (useMockData) {
      return;
    }

    let cancelled = false;
    let intervalId: number | undefined;

    const fetchActivities = async () => {
      try {
        const payload = await requestWithFallback(apiBase, Math.max(1, maxEntries));
        if (cancelled) {
          return;
        }

        setActivities(extractActivities(payload));
        setConnected(true);
      } catch {
        if (!cancelled) {
          setConnected(false);
        }
      }
    };

    void fetchActivities();

    intervalId = window.setInterval(() => {
      void fetchActivities();
    }, Math.max(1000, pollIntervalMs));

    return () => {
      cancelled = true;
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [apiBase, maxEntries, pollIntervalMs, setActivities, useMockData]);

  useEffect(() => {
    if (!useMockData) {
      return;
    }

    setConnected(true);
    const [minDelay, maxDelay] = mockIntervalRangeMs;
    let timerId: number | undefined;
    let cancelled = false;

    const enqueueMock = () => {
      if (cancelled) {
        return;
      }

      const delay = randomBetween(minDelay, maxDelay);
      timerId = window.setTimeout(() => {
        addActivity(createMockActivity());
        enqueueMock();
      }, delay);
    };

    enqueueMock();

    return () => {
      cancelled = true;
      if (timerId !== undefined) {
        window.clearTimeout(timerId);
      }
    };
  }, [addActivity, mockIntervalRangeMs, useMockData]);

  const pause = useCallback(() => setPaused(true), [setPaused]);
  const resume = useCallback(() => setPaused(false), [setPaused]);
  const togglePause = useCallback(() => setPaused(!paused), [paused, setPaused]);

  return {
    activities,
    connected,
    paused,
    maxEntries: storeMaxEntries,
    pause,
    resume,
    togglePause,
    clearActivities,
  };
}
