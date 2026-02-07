import { TASK_COLUMNS, type CreateTaskInput, type TaskColumn, type TaskRecord, type UpdateTaskInput } from './index';
import type { TaskAdapter } from './task-sync';

type FetchImplementation = (input: string, init?: RequestInit) => Promise<Response>;

interface RequestResult {
  payload: unknown;
  notFound: boolean;
}

export interface CloudTaskAdapterOptions {
  baseUrl: string;
  fetchImpl?: FetchImplementation;
  headers?: Record<string, string>;
}

function normalizeTaskColumn(value: unknown): TaskColumn {
  if (typeof value !== 'string') {
    return 'backlog';
  }

  const lowered = value.toLowerCase();
  return (TASK_COLUMNS as readonly string[]).includes(lowered) ? (lowered as TaskColumn) : 'backlog';
}

function normalizeTimestamp(value: unknown): string {
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date().toISOString();
}

function normalizeTaskRecord(raw: unknown): TaskRecord | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const row = raw as Record<string, unknown>;
  const id = Number(row.id);
  const name = typeof row.name === 'string' ? row.name.trim() : '';

  if (!Number.isInteger(id) || id <= 0 || !name) {
    return null;
  }

  return {
    id,
    name,
    description: typeof row.description === 'string' ? row.description : null,
    column: normalizeTaskColumn(row.column),
    assignee: typeof row.assignee === 'string' && row.assignee.trim() ? row.assignee : 'Unassigned',
    created_at: normalizeTimestamp(row.created_at),
    updated_at: normalizeTimestamp(row.updated_at ?? row.created_at),
    metadata: typeof row.metadata === 'string' ? row.metadata : null,
  };
}

function toTaskList(payload: unknown): TaskRecord[] {
  if (Array.isArray(payload)) {
    return payload.map(normalizeTaskRecord).filter((task): task is TaskRecord => task !== null);
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.tasks)) {
      return record.tasks.map(normalizeTaskRecord).filter((task): task is TaskRecord => task !== null);
    }
  }

  return [];
}

function toSingleTask(payload: unknown): TaskRecord | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const direct = normalizeTaskRecord(payload);
  if (direct) {
    return direct;
  }

  const record = payload as Record<string, unknown>;
  if (record.task && typeof record.task === 'object') {
    return normalizeTaskRecord(record.task);
  }

  return null;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('Cloud adapter received invalid JSON.');
  }
}

function extractErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (typeof record.error === 'string' && record.error.trim()) {
      return record.error.trim();
    }
  }

  return `Cloud request failed with status ${status}.`;
}

function sanitizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function buildTaskUrls(baseUrl: string, endpoint: string): string[] {
  return [`${baseUrl}/api${endpoint}`, `${baseUrl}${endpoint}`];
}

async function requestTaskApi(
  baseUrl: string,
  fetchImpl: FetchImplementation,
  endpoint: string,
  init: RequestInit | undefined,
  headers: Record<string, string>,
  allowNotFound = false
): Promise<RequestResult> {
  const urls = buildTaskUrls(baseUrl, endpoint);
  let lastError: Error | null = null;

  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index];

    try {
      const response = await fetchImpl(url, {
        ...init,
        headers: {
          ...headers,
          ...(init?.headers ?? {}),
        },
      });

      const payload = await readJson(response);
      if (response.status === 404 && index < urls.length - 1) {
        continue;
      }

      if (response.status === 404 && allowNotFound) {
        return { payload: null, notFound: true };
      }

      if (!response.ok) {
        throw new Error(extractErrorMessage(payload, response.status));
      }

      return { payload, notFound: false };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Cloud request failed.');
    }
  }

  if (allowNotFound) {
    return { payload: null, notFound: true };
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error('Cloud request failed.');
}

export function createCloudTaskAdapter(options: CloudTaskAdapterOptions): TaskAdapter {
  const baseUrl = sanitizeBaseUrl(options.baseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseHeaders = options.headers ?? {};

  async function listTasks(): Promise<TaskRecord[]> {
    const { payload } = await requestTaskApi(baseUrl, fetchImpl, '/tasks', undefined, baseHeaders);
    return toTaskList(payload);
  }

  async function getTask(id: number): Promise<TaskRecord | undefined> {
    const { payload, notFound } = await requestTaskApi(
      baseUrl,
      fetchImpl,
      `/tasks/${id}`,
      undefined,
      baseHeaders,
      true
    );
    if (notFound) {
      return undefined;
    }

    return toSingleTask(payload) ?? undefined;
  }

  async function createTask(input: CreateTaskInput): Promise<TaskRecord> {
    const { payload } = await requestTaskApi(
      baseUrl,
      fetchImpl,
      '/tasks',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      {
        'Content-Type': 'application/json',
        ...baseHeaders,
      }
    );

    const task = toSingleTask(payload);
    if (!task) {
      throw new Error('Cloud createTask returned an invalid task payload.');
    }

    return task;
  }

  async function updateTask(id: number, updates: UpdateTaskInput): Promise<TaskRecord | undefined> {
    const { payload, notFound } = await requestTaskApi(
      baseUrl,
      fetchImpl,
      `/tasks/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(updates),
      },
      {
        'Content-Type': 'application/json',
        ...baseHeaders,
      },
      true
    );

    if (notFound) {
      return undefined;
    }

    return toSingleTask(payload) ?? undefined;
  }

  async function moveTask(id: number, nextColumn: string): Promise<TaskRecord | undefined> {
    const { payload, notFound } = await requestTaskApi(
      baseUrl,
      fetchImpl,
      `/tasks/${id}/move`,
      {
        method: 'PUT',
        body: JSON.stringify({ column: nextColumn }),
      },
      {
        'Content-Type': 'application/json',
        ...baseHeaders,
      },
      true
    );

    if (notFound) {
      return undefined;
    }

    return toSingleTask(payload) ?? undefined;
  }

  async function deleteTask(id: number): Promise<boolean> {
    const { notFound } = await requestTaskApi(
      baseUrl,
      fetchImpl,
      `/tasks/${id}`,
      {
        method: 'DELETE',
      },
      baseHeaders,
      true
    );

    return !notFound;
  }

  return {
    mode: 'CLOUD',
    listTasks,
    getTask,
    createTask,
    updateTask,
    moveTask,
    deleteTask,
  };
}
