import { useCallback, useEffect } from 'react';
import { create } from 'zustand';

const DEFAULT_API_BASE = '';

export const TASK_COLUMNS = ['backlog', 'todo', 'doing', 'review', 'done'] as const;

export type TaskColumn = (typeof TASK_COLUMNS)[number];
export type TaskPriority = 'P0' | 'P1' | 'P2' | 'P3';

export interface TaskBoardTask {
  id: number;
  name: string;
  description: string | null;
  column: TaskColumn;
  assignee: string;
  priority: TaskPriority;
  project: string;
  due_at: string | null;
  created_at: string;
  updated_at: string;
  metadata: string | null;
}

export interface CreateTaskPayload {
  name: string;
  description?: string;
  assignee?: string;
  column?: TaskColumn;
  priority?: TaskPriority;
  project?: string;
  due_at?: string | null;
  metadata?: string;
}

interface TaskBoardState {
  tasks: TaskBoardTask[];
  loading: boolean;
  error: string | null;
  initialized: boolean;
  setTasks: (tasks: TaskBoardTask[]) => void;
  upsertTask: (task: TaskBoardTask) => void;
  setTaskColumn: (taskId: number, column: TaskColumn) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setInitialized: (initialized: boolean) => void;
}

interface UseTaskBoardOptions {
  apiBase?: string;
  autoLoad?: boolean;
}

const useTaskBoardStore = create<TaskBoardState>((set) => ({
  tasks: [],
  loading: false,
  error: null,
  initialized: false,
  setTasks: (tasks) => set({ tasks }),
  upsertTask: (task) =>
    set((state) => {
      const existingIndex = state.tasks.findIndex((candidate) => candidate.id === task.id);
      if (existingIndex < 0) {
        return { tasks: [task, ...state.tasks] };
      }

      const nextTasks = [...state.tasks];
      nextTasks[existingIndex] = task;
      return { tasks: nextTasks };
    }),
  setTaskColumn: (taskId, column) =>
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              column,
              updated_at: new Date().toISOString(),
            }
          : task
      ),
    })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setInitialized: (initialized) => set({ initialized }),
}));

function isTaskColumn(value: string): value is TaskColumn {
  return (TASK_COLUMNS as readonly string[]).includes(value);
}

function normalizeTaskColumn(value: unknown): TaskColumn {
  if (typeof value !== 'string') {
    return 'backlog';
  }

  const lowered = value.toLowerCase();
  if (isTaskColumn(lowered)) {
    return lowered;
  }

  return 'backlog';
}

function toTimestamp(value: unknown): string {
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date().toISOString();
}

function normalizePriority(value: unknown): TaskPriority {
  if (typeof value !== 'string') {
    return 'P2';
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === 'P0' || normalized === 'P1' || normalized === 'P2' || normalized === 'P3') {
    return normalized;
  }

  return 'P2';
}

function parseMetadata(metadata: unknown): Record<string, unknown> | null {
  if (typeof metadata !== 'string' || !metadata.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(metadata) as unknown;
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeProject(value: unknown): string {
  if (typeof value !== 'string') {
    return 'General';
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : 'General';
}

function normalizeDueAt(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function normalizeTask(raw: unknown): TaskBoardTask | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const row = raw as Record<string, unknown>;
  const id = Number(row.id);
  const name = typeof row.name === 'string' ? row.name.trim() : '';

  if (!Number.isInteger(id) || id <= 0 || !name) {
    return null;
  }

  const metadata = typeof row.metadata === 'string' ? row.metadata : null;
  const metadataRecord = parseMetadata(metadata);

  const priority =
    row.priority ??
    row.task_priority ??
    metadataRecord?.priority ??
    metadataRecord?.task_priority;
  const project =
    row.project ??
    row.project_name ??
    row.team ??
    metadataRecord?.project ??
    metadataRecord?.project_name;
  const dueAt =
    row.due_at ??
    row.dueAt ??
    row.due_date ??
    row.deadline ??
    metadataRecord?.due_at ??
    metadataRecord?.due_date;

  return {
    id,
    name,
    description: typeof row.description === 'string' ? row.description : null,
    column: normalizeTaskColumn(row.column),
    assignee: typeof row.assignee === 'string' && row.assignee.trim() ? row.assignee.trim() : 'Unassigned',
    priority: normalizePriority(priority),
    project: normalizeProject(project),
    due_at: normalizeDueAt(dueAt),
    created_at: toTimestamp(row.created_at),
    updated_at: toTimestamp(row.updated_at ?? row.created_at),
    metadata,
  };
}

function extractTasks(payload: unknown): TaskBoardTask[] {
  if (Array.isArray(payload)) {
    return payload.map(normalizeTask).filter((task): task is TaskBoardTask => task !== null);
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.tasks)) {
      return record.tasks.map(normalizeTask).filter((task): task is TaskBoardTask => task !== null);
    }
  }

  return [];
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Task request failed.';
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('Invalid server response while handling tasks.');
  }
}

async function requestWithFallback(
  path: string,
  apiBase: string,
  init?: RequestInit
): Promise<unknown> {
  const candidates = [`${apiBase}/api${path}`, `${apiBase}${path}`];
  let lastError: Error | null = null;

  for (const url of candidates) {
    try {
      const response = await fetch(url, init);
      if (response.status === 404) {
        continue;
      }

      const payload = await readJson(response);
      if (!response.ok) {
        const message =
          payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).error === 'string'
            ? ((payload as Record<string, unknown>).error as string)
            : `Request failed with status ${response.status}`;
        throw new Error(message);
      }

      return payload;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown task request error.');
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error('Unable to reach task endpoints.');
}

export function useTaskBoard({ apiBase = DEFAULT_API_BASE, autoLoad = true }: UseTaskBoardOptions = {}) {
  const tasks = useTaskBoardStore((state) => state.tasks);
  const loading = useTaskBoardStore((state) => state.loading);
  const error = useTaskBoardStore((state) => state.error);
  const initialized = useTaskBoardStore((state) => state.initialized);
  const setTasks = useTaskBoardStore((state) => state.setTasks);
  const upsertTask = useTaskBoardStore((state) => state.upsertTask);
  const setTaskColumn = useTaskBoardStore((state) => state.setTaskColumn);
  const setLoading = useTaskBoardStore((state) => state.setLoading);
  const setError = useTaskBoardStore((state) => state.setError);
  const setInitialized = useTaskBoardStore((state) => state.setInitialized);

  const reloadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const payload = await requestWithFallback('/tasks', apiBase);
      const normalized = extractTasks(payload);
      setTasks(normalized);
      setInitialized(true);
      return normalized;
    } catch (loadError) {
      setError(getErrorMessage(loadError));
      return [];
    } finally {
      setLoading(false);
    }
  }, [apiBase, setError, setInitialized, setLoading, setTasks]);

  const createTask = useCallback(
    async (payload: CreateTaskPayload) => {
      const name = payload.name.trim();
      if (!name) {
        throw new Error('Task title is required.');
      }

      setError(null);

      const createdPayload = await requestWithFallback('/tasks', apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Keep top-level fields plus metadata for API compatibility across MC versions.
        body: JSON.stringify({
          name,
          description: payload.description,
          assignee: payload.assignee,
          column: payload.column,
          priority: payload.priority,
          project: payload.project,
          due_at: payload.due_at,
          metadata:
            payload.metadata ??
            JSON.stringify({
              priority: payload.priority,
              project: payload.project,
              due_at: payload.due_at,
            }),
        }),
      });

      const createdTask = normalizeTask(createdPayload);
      if (!createdTask) {
        throw new Error('Failed to create task from server response.');
      }

      upsertTask(createdTask);
      return createdTask;
    },
    [apiBase, setError, upsertTask]
  );

  const updateTask = useCallback(
    async (taskId: number, payload: Omit<CreateTaskPayload, 'name'> & { name?: string }) => {
      setError(null);

      const updatedPayload = await requestWithFallback(`/tasks/${taskId}`, apiBase, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const updatedTask = normalizeTask(updatedPayload);
      if (!updatedTask) {
        throw new Error('Failed to update task from server response.');
      }

      upsertTask(updatedTask);
      return updatedTask;
    },
    [apiBase, setError, upsertTask]
  );

  const moveTask = useCallback(
    async (taskId: number, column: TaskColumn) => {
      const snapshot = useTaskBoardStore.getState().tasks;
      setTaskColumn(taskId, column);

      try {
        const movedPayload = await requestWithFallback(`/tasks/${taskId}/move`, apiBase, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ column }),
        });

        const movedTask = normalizeTask(movedPayload);
        if (!movedTask) {
          throw new Error('Failed to move task from server response.');
        }

        upsertTask(movedTask);
        return movedTask;
      } catch (moveError) {
        setTasks(snapshot);
        setError(getErrorMessage(moveError));
        throw moveError;
      }
    },
    [apiBase, setError, setTaskColumn, setTasks, upsertTask]
  );

  useEffect(() => {
    if (!autoLoad || initialized) {
      return;
    }

    void reloadTasks();
  }, [autoLoad, initialized, reloadTasks]);

  return {
    tasks,
    loading,
    error,
    columns: TASK_COLUMNS,
    reloadTasks,
    createTask,
    updateTask,
    moveTask,
  };
}
