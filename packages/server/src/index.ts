import express from 'express';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { createActivityRepository, TASK_COLUMNS, type ActivityType } from '../../db/src';
import { createTaskSyncLayer, normalizeDbMode } from '../../db/src/task-sync';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const WORKSPACE = process.env.WORKSPACE || '/Users/your-username/Code/entity';
const OPENCLAW = process.env.OPENCLAW || 'http://YOUR_SERVER_IP:18789';

const wsClients = new Set<WebSocket>();

const wss = new WebSocketServer({ port: PORT + 1 });
wss.on('connection', (ws) => {
  wsClients.add(ws);
  ws.on('close', () => wsClients.delete(ws));
  console.log(`[WS] Client connected (${wsClients.size} total)`);
});

function broadcast(data: unknown) {
  const msg = JSON.stringify(data);
  wsClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  });
}

const taskSyncLayer = createTaskSyncLayer();
const activityRepository = createActivityRepository();
const TASK_COLUMN_SET = new Set<string>(TASK_COLUMNS);

function parseTaskId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isValidTaskColumn(value: unknown): value is string {
  return typeof value === 'string' && TASK_COLUMN_SET.has(value.toLowerCase());
}

function toWorkspaceRelativePath(filePath: string): string {
  if (!path.isAbsolute(filePath)) {
    return filePath;
  }

  const relativePath = path.relative(WORKSPACE, filePath);
  if (relativePath.startsWith('..')) {
    return filePath;
  }

  return relativePath || path.basename(filePath);
}

function capitalizeColumn(column: string): string {
  return column.charAt(0).toUpperCase() + column.slice(1);
}

function logActivity(input: {
  source: 'agent' | 'task';
  type: ActivityType;
  action: string;
  description: string;
  agentName?: string;
  agentEmoji?: string;
  filePath?: string;
  taskId?: number;
  taskColumn?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const activity = activityRepository.createActivity({
      source: input.source,
      type: input.type,
      action: input.action,
      description: input.description,
      agent_name: input.agentName,
      agent_emoji: input.agentEmoji,
      file_path: input.filePath,
      task_id: input.taskId,
      task_column: input.taskColumn,
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
    });
    broadcast({ type: 'activity:created', activity });
    return activity;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown activity error';
    console.error('[Activity] Failed to log activity:', message);
    return null;
  }
}

app.get('/api/files', (req, res) => {
  const dirPath = (req.query.path as string) || WORKSPACE;
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = items
      .filter((i) => !i.name.startsWith('.'))
      .map((item) => ({
        name: item.name,
        isDirectory: item.isDirectory(),
        path: path.join(dirPath, item.name),
      }));
    res.json(files);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

app.get('/api/file', (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) {
    return res.status(400).json({ error: 'path required' });
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const stats = fs.statSync(filePath);
    res.json({ content, size: stats.size, mtime: stats.mtime });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

app.put('/api/file', (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) {
    return res.status(400).json({ error: 'path required' });
  }

  const { content } = req.body;
  try {
    fs.writeFileSync(filePath, content);
    const relativePath = toWorkspaceRelativePath(filePath);
    logActivity({
      source: 'agent',
      type: 'file_edit',
      action: 'Edited file',
      description: `Updated ${relativePath}.`,
      filePath,
      agentName: 'Entity',
      agentEmoji: '⚡',
    });
    broadcast({ type: 'file:changed', path: filePath, content });
    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

app.post('/api/file', (req, res) => {
  const { path: filePath, content } = req.body;
  if (!filePath) {
    return res.status(400).json({ error: 'path required' });
  }

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content || '');
    const relativePath = toWorkspaceRelativePath(filePath);
    logActivity({
      source: 'agent',
      type: 'file_edit',
      action: 'Created file',
      description: `Created ${relativePath}.`,
      filePath,
      agentName: 'Entity',
      agentEmoji: '⚡',
    });
    broadcast({ type: 'file:created', path: filePath });
    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

app.delete('/api/file', (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) {
    return res.status(400).json({ error: 'path required' });
  }

  try {
    fs.unlinkSync(filePath);
    const relativePath = toWorkspaceRelativePath(filePath);
    logActivity({
      source: 'agent',
      type: 'file_edit',
      action: 'Deleted file',
      description: `Deleted ${relativePath}.`,
      filePath,
      agentName: 'Entity',
      agentEmoji: '⚡',
    });
    broadcast({ type: 'file:deleted', path: filePath });
    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

app.post('/api/file/move', (req, res) => {
  const { from, to } = req.body;
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to required' });
  }

  try {
    fs.renameSync(from, to);
    logActivity({
      source: 'agent',
      type: 'file_edit',
      action: 'Moved file',
      description: `Moved ${toWorkspaceRelativePath(from)} to ${toWorkspaceRelativePath(to)}.`,
      filePath: to,
      agentName: 'Entity',
      agentEmoji: '⚡',
    });
    broadcast({ type: 'file:moved', from, to });
    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

app.get('/api/search', (req, res) => {
  const query = ((req.query.q as string) || '').toLowerCase();
  const searchPath = (req.query.path as string) || WORKSPACE;
  const results: Array<{ name: string; path: string }> = [];

  function walk(dir: string, depth = 0) {
    if (depth > 3 || results.length > 50) {
      return;
    }

    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        if (item.name.startsWith('.')) {
          continue;
        }

        const full = path.join(dir, item.name);
        if (item.isDirectory()) {
          walk(full, depth + 1);
        } else if (item.name.toLowerCase().includes(query)) {
          results.push({ name: item.name, path: full });
        }
      }
    } catch {
      // Ignore unreadable directories.
    }
  }

  walk(searchPath);
  res.json({ results });
});

app.post('/api/mention', async (req, res) => {
  const { document, instruction, context, author } = req.body;

  const mentionRegex = /@(\w+)/g;
  const matches = typeof instruction === 'string' ? instruction.match(mentionRegex) : null;
  const mentions = matches ? [...new Set(matches.map((m: string) => m.slice(1)))] : [];

  if (mentions.length === 0) {
    return res.json({ success: true, mentions: [] });
  }

  const results: Array<{ agent: string; success?: boolean; error?: string }> = [];

  for (const mentionedAgent of mentions) {
    try {
      const response = await fetch(`${OPENCLAW}/hooks/docs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: mentionedAgent,
          document,
          instruction,
          context,
          author: author || 'Henry',
          timestamp: new Date().toISOString(),
        }),
      });

      results.push({ agent: mentionedAgent, success: response.ok });
      logActivity({
        source: 'agent',
        type: 'tool_call',
        action: `Triggered @${mentionedAgent}`,
        description: `Sent mention workflow for ${toWorkspaceRelativePath(String(document || 'unknown document'))}.`,
        filePath: typeof document === 'string' ? document : undefined,
        agentName: mentionedAgent,
        agentEmoji: '🤖',
      });
      broadcast({
        type: 'mention:triggered',
        agent: mentionedAgent,
        document,
        instruction,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      results.push({ agent: mentionedAgent, error: message });
    }
  }

  return res.json({ success: true, mentions: results });
});

app.get('/api/agents', async (_req, res) => {
  try {
    const response = await fetch(`${OPENCLAW}/api/agents`);
    const data = await response.json();
    res.json(data);
  } catch {
    res.json({
      list: [
        { id: 'main', name: 'Ada', emoji: '🔮', model: 'anthropic/claude-opus-4-6', gateway: 'your-server' },
        { id: 'spock', name: 'Spock', emoji: '🖖', model: 'kimi-code/kimi-for-coding', gateway: 'your-server' },
        { id: 'scotty', name: 'Scotty', emoji: '🔧', model: 'anthropic/claude-sonnet-4-5', gateway: 'castlemascot-r1' },
      ],
    });
  }
});

app.get('/api/agents/:id/activity', async (req, res) => {
  const { id } = req.params;
  try {
    const response = await fetch(`${OPENCLAW}/api/sessions/${id}/activity?limit=10`);
    const data = await response.json();
    res.json(data);
  } catch {
    res.json([]);
  }
});

function registerActivityRoutes(prefix: '' | '/api') {
  const base = `${prefix}/activities`;

  app.get(base, (req, res) => {
    const limitRaw = Number(req.query.limit ?? 100);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 100;

    try {
      const activities = activityRepository.listActivities(limit);
      res.json({ activities });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });
}

function registerDbModeRoutes(prefix: '' | '/api') {
  const base = `${prefix}/db-mode`;

  app.get(base, (_req, res) => {
    res.json({
      mode: taskSyncLayer.getMode(),
      cloudConfigured: taskSyncLayer.hasCloudAdapter(),
    });
  });

  app.post(base, (req, res) => {
    const mode = normalizeDbMode(req.body?.mode ?? null);
    if (!mode && req.body?.mode !== null) {
      return res.status(400).json({ error: 'mode must be LOCAL, CLOUD, or null' });
    }

    taskSyncLayer.setMode(mode);
    return res.json({
      mode: taskSyncLayer.getMode(),
      cloudConfigured: taskSyncLayer.hasCloudAdapter(),
    });
  });
}

function registerTaskRoutes(prefix: '' | '/api') {
  const tasksBase = `${prefix}/tasks`;

  app.get(tasksBase, async (_req, res) => {
    try {
      const tasks = await taskSyncLayer.listTasks();
      res.json({ tasks });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  app.get(`${tasksBase}/:id`, async (req, res) => {
    const id = parseTaskId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'invalid task id' });
    }

    try {
      const task = await taskSyncLayer.getTask(id);
      if (!task) {
        return res.status(404).json({ error: 'task not found' });
      }

      return res.json(task);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return res.status(500).json({ error: message });
    }
  });

  app.post(tasksBase, async (req, res) => {
    const { name, description, column, assignee, metadata } = req.body as {
      name?: string;
      description?: string;
      column?: string;
      assignee?: string;
      metadata?: string;
    };

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name required' });
    }

    try {
      const task = await taskSyncLayer.createTask({
        name,
        description,
        column,
        assignee,
        metadata,
      });

      logActivity({
        source: 'task',
        type: task.column === 'done' ? 'task_completed' : 'task_created',
        action: task.column === 'done' ? 'Completed task' : 'Created task',
        description: `${task.name} in ${capitalizeColumn(task.column)}.`,
        taskId: task.id,
        taskColumn: task.column,
        metadata: { taskName: task.name, assignee: task.assignee },
      });
      broadcast({ type: 'task:created', task });
      return res.status(201).json(task);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return res.status(500).json({ error: message });
    }
  });

  app.put(`${tasksBase}/:id`, async (req, res) => {
    const id = parseTaskId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'invalid task id' });
    }

    const { name, description, column, assignee, metadata } = req.body as {
      name?: string;
      description?: string;
      column?: string;
      assignee?: string;
      metadata?: string;
    };
    try {
      const existingTask = await taskSyncLayer.getTask(id);
      if (!existingTask) {
        return res.status(404).json({ error: 'task not found' });
      }

      if (column !== undefined && !isValidTaskColumn(column)) {
        return res.status(400).json({ error: 'invalid column' });
      }
      if (typeof name === 'string' && !name.trim()) {
        return res.status(400).json({ error: 'name cannot be empty' });
      }

      const task = await taskSyncLayer.updateTask(id, {
        name,
        description,
        column,
        assignee,
        metadata,
      });

      if (!task) {
        return res.status(404).json({ error: 'task not found' });
      }

      const becameDone = existingTask.column !== 'done' && task.column === 'done';
      logActivity({
        source: 'task',
        type: becameDone ? 'task_completed' : 'task_updated',
        action: becameDone ? 'Completed task' : 'Updated task',
        description: `${task.name} in ${capitalizeColumn(task.column)}.`,
        taskId: task.id,
        taskColumn: task.column,
        metadata: { taskName: task.name, assignee: task.assignee },
      });
      broadcast({ type: 'task:updated', task });
      return res.json(task);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return res.status(500).json({ error: message });
    }
  });

  app.put(`${tasksBase}/:id/move`, async (req, res) => {
    const id = parseTaskId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'invalid task id' });
    }

    const column = req.body?.column;
    if (!isValidTaskColumn(column)) {
      return res.status(400).json({ error: 'valid column required' });
    }

    try {
      const task = await taskSyncLayer.moveTask(id, column);
      if (!task) {
        return res.status(404).json({ error: 'task not found' });
      }

      logActivity({
        source: 'task',
        type: task.column === 'done' ? 'task_completed' : 'task_moved',
        action: task.column === 'done' ? 'Completed task' : 'Moved task',
        description: `${task.name} moved to ${capitalizeColumn(task.column)}.`,
        taskId: task.id,
        taskColumn: task.column,
        metadata: { taskName: task.name, assignee: task.assignee },
      });
      broadcast({ type: 'task:moved', taskId: id, column: task.column });
      return res.json(task);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return res.status(500).json({ error: message });
    }
  });

  app.delete(`${tasksBase}/:id`, async (req, res) => {
    const id = parseTaskId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'invalid task id' });
    }

    try {
      const task = await taskSyncLayer.getTask(id);
      const deleted = await taskSyncLayer.deleteTask(id);
      if (!deleted) {
        return res.status(404).json({ error: 'task not found' });
      }

      if (task) {
        logActivity({
          source: 'task',
          type: 'task_deleted',
          action: 'Deleted task',
          description: `${task.name} removed from ${capitalizeColumn(task.column)}.`,
          taskId: task.id,
          taskColumn: task.column,
          metadata: { taskName: task.name, assignee: task.assignee },
        });
      }
      broadcast({ type: 'task:deleted', taskId: id });
      return res.status(204).send();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return res.status(500).json({ error: message });
    }
  });
}

registerDbModeRoutes('');
registerDbModeRoutes('/api');
registerActivityRoutes('');
registerActivityRoutes('/api');
registerTaskRoutes('');
registerTaskRoutes('/api');

app.listen(PORT, () => {
  console.log(`Entity server on port ${PORT}`);
  console.log(`WebSocket server on port ${PORT + 1}`);
  console.log(`Workspace: ${WORKSPACE}`);
});
