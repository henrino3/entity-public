import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';

export const TASK_COLUMNS = ['backlog', 'todo', 'doing', 'review', 'done'] as const;

export type TaskColumn = (typeof TASK_COLUMNS)[number];

export interface TaskRecord {
  id: number;
  name: string;
  description: string | null;
  column: TaskColumn;
  assignee: string | null;
  created_at: string;
  updated_at: string;
  metadata: string | null;
}

export interface CreateTaskInput {
  name: string;
  description?: string;
  column?: string;
  assignee?: string;
  metadata?: string;
}

export interface UpdateTaskInput {
  name?: string;
  description?: string;
  column?: string;
  assignee?: string;
  metadata?: string;
}

export interface TaskRepository {
  listTasks: () => TaskRecord[];
  getTask: (id: number) => TaskRecord | undefined;
  createTask: (input: CreateTaskInput) => TaskRecord;
  updateTask: (id: number, updates: UpdateTaskInput) => TaskRecord | undefined;
  moveTask: (id: number, nextColumn: string) => TaskRecord | undefined;
  deleteTask: (id: number) => boolean;
}

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

export interface ActivityRecord {
  id: number;
  source: ActivitySource;
  type: ActivityType;
  action: string;
  description: string;
  agent_name: string | null;
  agent_emoji: string | null;
  file_path: string | null;
  task_id: number | null;
  task_column: string | null;
  metadata: string | null;
  created_at: string;
}

export interface CreateActivityInput {
  source?: ActivitySource;
  type: ActivityType;
  action: string;
  description: string;
  agent_name?: string;
  agent_emoji?: string;
  file_path?: string;
  task_id?: number;
  task_column?: string;
  metadata?: string;
}

export interface ActivityRepository {
  listActivities: (limit?: number) => ActivityRecord[];
  createActivity: (input: CreateActivityInput) => ActivityRecord;
}

interface SourceTaskRow {
  id: number;
  name: string;
  description: string | null;
  task_column: string | null;
  assignee: string | null;
  created_at: string | null;
  updated_at: string | null;
}

function isTaskColumn(value: string): value is TaskColumn {
  return (TASK_COLUMNS as readonly string[]).includes(value);
}

function normalizeTaskColumn(value: string | null | undefined): TaskColumn {
  if (!value) {
    return 'backlog';
  }

  const lowered = value.toLowerCase();
  if (isTaskColumn(lowered)) {
    return lowered;
  }

  return 'backlog';
}

function normalizeTimestamp(value: string | null | undefined): string {
  if (!value) {
    return new Date().toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
}

function ensureDirectory(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function resolveEntityDbPath(): string {
  const custom = process.env.ENTITY_TASK_DB_PATH;
  if (custom) {
    return path.resolve(custom);
  }

  return path.resolve(__dirname, '..', 'entity-tasks.db');
}

function resolveMissionControlDbPath(): string {
  const custom = process.env.MISSION_CONTROL_DB_PATH;
  if (custom) {
    return path.resolve(custom);
  }

  return path.join(os.homedir(), 'Code', 'mission-control', 'tasks.db');
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function bootstrap(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      column TEXT NOT NULL DEFAULT 'backlog',
      assignee TEXT DEFAULT 'Unassigned',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      metadata TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_column ON tasks(column);
    CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at DESC);

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL DEFAULT 'agent',
      type TEXT NOT NULL,
      action TEXT NOT NULL,
      description TEXT NOT NULL,
      agent_name TEXT,
      agent_emoji TEXT,
      file_path TEXT,
      task_id INTEGER,
      task_column TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_activities_source ON activities(source);
    CREATE INDEX IF NOT EXISTS idx_activities_task_id ON activities(task_id);
    CREATE INDEX IF NOT EXISTS idx_activities_file_path ON activities(file_path);
  `);
}

function openEntityDatabase(): Database.Database {
  const dbPath = resolveEntityDbPath();
  ensureDirectory(dbPath);
  const db = new Database(dbPath);
  bootstrap(db);
  return db;
}

function loadSourceRows(source: Database.Database): SourceTaskRow[] {
  const supportsArchived = hasColumn(source, 'tasks', 'archived');
  const whereClause = supportsArchived ? 'WHERE archived = 0' : '';

  const query = `
    SELECT
      id,
      name,
      description,
      "column" AS task_column,
      assignee,
      created_at,
      updated_at
    FROM tasks
    ${whereClause}
    ORDER BY id ASC
  `;

  return source.prepare(query).all() as SourceTaskRow[];
}

function seedFromMissionControl(target: Database.Database): void {
  const existing = target.prepare('SELECT COUNT(*) AS count FROM tasks').get() as { count: number };
  if (existing.count > 0) {
    return;
  }

  const sourcePath = resolveMissionControlDbPath();
  if (!fs.existsSync(sourcePath)) {
    return;
  }

  const source = new Database(sourcePath, { readonly: true });

  try {
    const rows = loadSourceRows(source);
    if (rows.length === 0) {
      return;
    }

    const insert = target.prepare(`
      INSERT OR IGNORE INTO tasks (id, name, description, column, assignee, created_at, updated_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = target.transaction((sourceRows: SourceTaskRow[]) => {
      for (const row of sourceRows) {
        const createdAt = normalizeTimestamp(row.created_at);
        const updatedAt = normalizeTimestamp(row.updated_at ?? row.created_at);
        insert.run(
          row.id,
          row.name,
          row.description,
          normalizeTaskColumn(row.task_column),
          row.assignee ?? 'Unassigned',
          createdAt,
          updatedAt,
          '{}'
        );
      }
    });

    insertMany(rows);
  } finally {
    source.close();
  }
}

function mapTaskRow(row: Record<string, unknown>): TaskRecord {
  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    description: row.description === null ? null : String(row.description ?? ''),
    column: normalizeTaskColumn(String(row.column ?? 'backlog')),
    assignee: row.assignee === null ? null : String(row.assignee ?? 'Unassigned'),
    created_at: normalizeTimestamp(String(row.created_at ?? '')),
    updated_at: normalizeTimestamp(String(row.updated_at ?? row.created_at ?? '')),
    metadata: row.metadata === null ? null : String(row.metadata ?? '{}'),
  };
}

function normalizeActivitySource(value: unknown): ActivitySource {
  return value === 'task' ? 'task' : 'agent';
}

function normalizeActivityType(value: unknown): ActivityType {
  if (typeof value !== 'string') {
    return 'message_sent';
  }

  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case 'file_edit':
    case 'tool_call':
    case 'message_sent':
    case 'command_run':
    case 'research':
    case 'thinking':
    case 'task_created':
    case 'task_updated':
    case 'task_moved':
    case 'task_completed':
    case 'task_deleted':
      return normalized;
    default:
      return 'message_sent';
  }
}

function mapActivityRow(row: Record<string, unknown>): ActivityRecord {
  const rawTaskId = Number(row.task_id);
  return {
    id: Number(row.id),
    source: normalizeActivitySource(row.source),
    type: normalizeActivityType(row.type),
    action: String(row.action ?? ''),
    description: String(row.description ?? ''),
    agent_name: row.agent_name === null ? null : String(row.agent_name ?? ''),
    agent_emoji: row.agent_emoji === null ? null : String(row.agent_emoji ?? ''),
    file_path: row.file_path === null ? null : String(row.file_path ?? ''),
    task_id: Number.isInteger(rawTaskId) ? rawTaskId : null,
    task_column: row.task_column === null ? null : String(row.task_column ?? ''),
    metadata: row.metadata === null ? null : String(row.metadata ?? ''),
    created_at: normalizeTimestamp(String(row.created_at ?? '')),
  };
}

function clampActivityLimit(limit: number): number {
  if (!Number.isInteger(limit)) {
    return 100;
  }

  if (limit < 1) {
    return 1;
  }

  if (limit > 500) {
    return 500;
  }

  return limit;
}

export function createTaskRepository(): TaskRepository {
  const db = openEntityDatabase();
  seedFromMissionControl(db);

  const listStmt = db.prepare('SELECT * FROM tasks ORDER BY updated_at DESC, id DESC');
  const getStmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
  const createStmt = db.prepare(`
    INSERT INTO tasks (name, description, column, assignee, metadata, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  const deleteStmt = db.prepare('DELETE FROM tasks WHERE id = ?');

  return {
    listTasks: () => {
      const rows = listStmt.all() as Array<Record<string, unknown>>;
      return rows.map(mapTaskRow);
    },

    getTask: (id: number) => {
      const row = getStmt.get(id) as Record<string, unknown> | undefined;
      return row ? mapTaskRow(row) : undefined;
    },

    createTask: (input: CreateTaskInput) => {
      const taskName = input.name.trim();
      const result = createStmt.run(
        taskName,
        input.description?.trim() || null,
        normalizeTaskColumn(input.column),
        input.assignee?.trim() || 'Unassigned',
        input.metadata?.trim() || '{}'
      );

      const task = getStmt.get(result.lastInsertRowid as number) as Record<string, unknown> | undefined;
      if (!task) {
        throw new Error('Failed to create task');
      }

      return mapTaskRow(task);
    },

    updateTask: (id: number, updates: UpdateTaskInput) => {
      const existingTask = getStmt.get(id) as Record<string, unknown> | undefined;
      if (!existingTask) {
        return undefined;
      }

      const fields: string[] = [];
      const values: unknown[] = [];

      if (typeof updates.name === 'string') {
        fields.push('name = ?');
        values.push(updates.name.trim());
      }

      if (typeof updates.description === 'string') {
        fields.push('description = ?');
        values.push(updates.description.trim() || null);
      }

      if (typeof updates.column === 'string') {
        fields.push('column = ?');
        values.push(normalizeTaskColumn(updates.column));
      }

      if (typeof updates.assignee === 'string') {
        fields.push('assignee = ?');
        values.push(updates.assignee.trim() || 'Unassigned');
      }

      if (typeof updates.metadata === 'string') {
        fields.push('metadata = ?');
        values.push(updates.metadata.trim() || '{}');
      }

      if (fields.length === 0) {
        return mapTaskRow(existingTask);
      }

      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);
      db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);

      const refreshed = getStmt.get(id) as Record<string, unknown> | undefined;
      return refreshed ? mapTaskRow(refreshed) : undefined;
    },

    moveTask: (id: number, nextColumn: string) => {
      const normalizedColumn = normalizeTaskColumn(nextColumn);
      db.prepare('UPDATE tasks SET column = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(normalizedColumn, id);
      const refreshed = getStmt.get(id) as Record<string, unknown> | undefined;
      return refreshed ? mapTaskRow(refreshed) : undefined;
    },

    deleteTask: (id: number) => {
      const result = deleteStmt.run(id);
      return result.changes > 0;
    },
  };
}

export function createActivityRepository(): ActivityRepository {
  const db = openEntityDatabase();

  const listStmt = db.prepare(`
    SELECT
      id,
      source,
      type,
      action,
      description,
      agent_name,
      agent_emoji,
      file_path,
      task_id,
      task_column,
      metadata,
      created_at
    FROM activities
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ?
  `);

  const createStmt = db.prepare(`
    INSERT INTO activities (
      source,
      type,
      action,
      description,
      agent_name,
      agent_emoji,
      file_path,
      task_id,
      task_column,
      metadata,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  const getStmt = db.prepare('SELECT * FROM activities WHERE id = ?');

  return {
    listActivities: (limit = 100) => {
      const safeLimit = clampActivityLimit(limit);
      const rows = listStmt.all(safeLimit) as Array<Record<string, unknown>>;
      return rows.map(mapActivityRow);
    },

    createActivity: (input: CreateActivityInput) => {
      const action = input.action.trim();
      const description = input.description.trim();
      if (!action || !description) {
        throw new Error('activity action and description are required');
      }

      const result = createStmt.run(
        input.source ?? 'agent',
        input.type,
        action,
        description,
        input.agent_name?.trim() || null,
        input.agent_emoji?.trim() || null,
        input.file_path?.trim() || null,
        typeof input.task_id === 'number' && Number.isInteger(input.task_id) ? input.task_id : null,
        input.task_column?.trim() || null,
        input.metadata?.trim() || null
      );

      const row = getStmt.get(result.lastInsertRowid as number) as Record<string, unknown> | undefined;
      if (!row) {
        throw new Error('Failed to create activity');
      }

      return mapActivityRow(row);
    },
  };
}
