#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const AGENT_BROWSER_BIN = process.env.AGENT_BROWSER_BIN || 'agent-browser';
const SESSION = process.env.AGENT_BROWSER_SESSION || `entity-e2e-${Date.now()}`;
const APP_URL = process.env.E2E_APP_URL || 'http://127.0.0.1:5173';
const API_HEALTH_URL = process.env.E2E_API_HEALTH_URL || 'http://127.0.0.1:3001/api/tasks';
const AUTO_START = process.env.E2E_USE_EXISTING_SERVERS !== '1';
const READINESS_TIMEOUT_MS = Number(process.env.E2E_READINESS_TIMEOUT_MS || 90000);
const CONDITION_TIMEOUT_MS = Number(process.env.E2E_CONDITION_TIMEOUT_MS || 35000);
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const managedProcesses = [];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatResult(result) {
  const stdout = (result.stdout || '').trim();
  const stderr = (result.stderr || '').trim();
  if (stdout && stderr) {
    return `${stdout}\n${stderr}`;
  }
  return stdout || stderr || '(no output)';
}

function runCommand(command, args, options = {}) {
  const {
    allowFailure = false,
    cwd = ROOT_DIR,
    env = process.env,
    timeoutMs = 60000,
  } = options;

  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error && result.error.code === 'ETIMEDOUT') {
    throw new Error(`Command timed out: ${command} ${args.join(' ')}`);
  }

  if (!allowFailure && result.status !== 0) {
    throw new Error(
      `Command failed (${result.status}): ${command} ${args.join(' ')}\n${formatResult(result)}`
    );
  }

  return result;
}

function runAgentBrowser(args, options = {}) {
  const finalArgs = options.skipSession ? args : [...args, '--session', SESSION];
  return runCommand(AGENT_BROWSER_BIN, finalArgs, options);
}

function startManagedProcess(name, args) {
  const logsDir = path.join(os.tmpdir(), 'entity-e2e-logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const logPath = path.join(logsDir, `${name}.log`);
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });

  logStream.write(`[${new Date().toISOString()}] starting ${npmBin} ${args.join(' ')}\n`);

  const child = spawn(npmBin, args, {
    cwd: ROOT_DIR,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.pipe(logStream, { end: false });
  child.stderr.pipe(logStream, { end: false });
  child.on('exit', (code, signal) => {
    logStream.write(`\n[${new Date().toISOString()}] exited code=${code} signal=${signal || 'none'}\n`);
  });

  const managed = { name, child, logPath, logStream };
  managedProcesses.push(managed);
  return managed;
}

function checkManagedProcessHealth() {
  for (const managed of managedProcesses) {
    if (managed.child.exitCode !== null) {
      throw new Error(
        `${managed.name} exited early with code ${managed.child.exitCode}. Check log: ${managed.logPath}`
      );
    }
  }
}

async function stopManagedProcesses() {
  for (const managed of managedProcesses.reverse()) {
    try {
      if (managed.child.exitCode === null) {
        managed.child.kill('SIGTERM');
        const stopDeadline = Date.now() + 8000;
        while (managed.child.exitCode === null && Date.now() < stopDeadline) {
          await delay(100);
        }
        if (managed.child.exitCode === null) {
          managed.child.kill('SIGKILL');
        }
      }
    } catch {
      // Best-effort teardown.
    } finally {
      managed.logStream.end();
    }
  }
}

async function isUrlReachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

async function waitForUrl(url, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    checkManagedProcessHealth();
    if (await isUrlReachable(url)) {
      return;
    }
    await delay(500);
  }
  throw new Error(`${label} did not become reachable at ${url} within ${timeoutMs}ms`);
}

function jsStringLiteral(value) {
  return JSON.stringify(value);
}

async function waitForBrowserCondition(description, expression, timeoutMs = CONDITION_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastError = '(no error output)';

  while (Date.now() < deadline) {
    checkManagedProcessHealth();
    const result = runAgentBrowser(['eval', expression], { allowFailure: true, timeoutMs: 20000 });
    if (result.status === 0) {
      return;
    }
    lastError = formatResult(result);
    await delay(1000);
  }

  throw new Error(`Timed out waiting for ${description}. Last error:\n${lastError}`);
}

function ensureAgentBrowser() {
  runCommand(AGENT_BROWSER_BIN, ['--version']);

  const probe = runAgentBrowser(['open', 'about:blank'], { allowFailure: true });
  if (probe.status === 0) {
    runAgentBrowser(['close'], { allowFailure: true });
    return;
  }

  const output = formatResult(probe).toLowerCase();
  if (output.includes('install') || output.includes('executable')) {
    console.log('Installing browser binaries for agent-browser...');
    runAgentBrowser(['install'], { skipSession: true, timeoutMs: 180000 });
    runAgentBrowser(['open', 'about:blank']);
    runAgentBrowser(['close'], { allowFailure: true });
    return;
  }

  throw new Error(`agent-browser is available but could not launch a browser.\n${formatResult(probe)}`);
}

async function startServersIfNeeded() {
  const appAlreadyRunning = await isUrlReachable(APP_URL);
  const apiAlreadyRunning = await isUrlReachable(API_HEALTH_URL);

  if (!AUTO_START) {
    if (!appAlreadyRunning || !apiAlreadyRunning) {
      throw new Error(
        `E2E_USE_EXISTING_SERVERS=1 is set, but app/API are not both reachable.\n` +
          `App: ${APP_URL} (${appAlreadyRunning ? 'up' : 'down'})\n` +
          `API: ${API_HEALTH_URL} (${apiAlreadyRunning ? 'up' : 'down'})`
      );
    }
    return;
  }

  if (!apiAlreadyRunning) {
    startManagedProcess('server', ['--prefix', 'packages/server', 'run', 'dev']);
  }

  if (!appAlreadyRunning) {
    startManagedProcess('app', [
      '--prefix',
      'packages/app',
      'run',
      'dev',
      '--',
      '--host',
      '127.0.0.1',
      '--port',
      '5173',
    ]);
  }

  await waitForUrl(API_HEALTH_URL, 'Task API', READINESS_TIMEOUT_MS);
  await waitForUrl(APP_URL, 'App UI', READINESS_TIMEOUT_MS);
}

async function runE2e() {
  const taskTitle = `e2e-task-${Date.now()}`;
  const taskLiteral = jsStringLiteral(taskTitle);
  const dragHandleSelector = `[aria-label="Drag task ${taskTitle}"]`;

  runAgentBrowser(['set', 'viewport', '1440', '900']);
  runAgentBrowser(['open', APP_URL], { timeoutMs: 90000 });
  runAgentBrowser(['wait', '1500']);

  runAgentBrowser([
    'eval',
    `
(() => {
  const isVisible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const buttons = Array.from(document.querySelectorAll('button'));
  const taskButton = buttons.find((button) => {
    const label = (button.textContent || '').toLowerCase();
    return label.includes('tasks') && isVisible(button);
  });
  if (!taskButton) {
    throw new Error('Unable to find visible Tasks button.');
  }
  taskButton.click();
  return true;
})()
`.trim(),
  ]);

  await waitForBrowserCondition(
    'task board to render',
    `
(() => {
  const boardHeader = Array.from(document.querySelectorAll('h1')).find((el) =>
    (el.textContent || '').includes('Mission Control Task Board')
  );
  if (!boardHeader) {
    throw new Error('Task board header not found.');
  }

  const expected = ['Backlog', 'Todo', 'Doing', 'Review', 'Done'];
  const present = new Set(
    Array.from(document.querySelectorAll('section h2')).map((el) => (el.textContent || '').trim())
  );

  for (const column of expected) {
    if (!present.has(column)) {
      throw new Error(\`Missing column: \${column}\`);
    }
  }

  return true;
})()
`.trim()
  );

  runAgentBrowser(['fill', 'input[placeholder="Create a task"]', taskTitle]);
  runAgentBrowser(['click', 'button[type="submit"]']);
  runAgentBrowser(['wait', dragHandleSelector], { timeoutMs: 20000 });

  runAgentBrowser(
    ['drag', dragHandleSelector, 'section:has(h2:has-text("Doing"))'],
    { timeoutMs: 25000 }
  );

  await waitForBrowserCondition(
    'task to move into Doing',
    `
(() => {
  const handle = document.querySelector('[aria-label="Drag task " + ${taskLiteral} + "]');
  if (!handle) {
    throw new Error('Drag handle for new task not found.');
  }

  const section = handle.closest('section');
  const heading = section ? section.querySelector('h2') : null;
  const headingLabel = heading ? (heading.textContent || '').trim() : '';

  if (headingLabel !== 'Doing') {
    throw new Error('Expected task in Doing, found ' + (headingLabel || 'unknown column'));
  }

  return true;
})()
`.trim()
  );

  await waitForBrowserCondition(
    'activity stream entry for created/moved task',
    `
(() => {
  const activityHeader = Array.from(document.querySelectorAll('div')).find(
    (el) => (el.textContent || '').trim() === 'Activity Stream'
  );
  if (!activityHeader) {
    throw new Error('Activity Stream header not found.');
  }

  const container = activityHeader.parentElement;
  const list = container ? container.parentElement?.querySelector('.overflow-y-auto') : null;
  if (!list) {
    throw new Error('Activity list is not visible yet.');
  }

  const text = list.textContent || '';
  if (!text.includes(${taskLiteral})) {
    throw new Error('Task title not present in activity stream yet.');
  }

  return true;
})()
`.trim(),
    45000
  );

  const artifactDir = path.join(ROOT_DIR, 'e2e', 'artifacts');
  fs.mkdirSync(artifactDir, { recursive: true });
  runAgentBrowser(['screenshot', path.join(artifactDir, 'test-browser.png')], { allowFailure: true });

  console.log(`E2E passed. Created, dragged, and observed activity for ${taskTitle}.`);
}

async function main() {
  try {
    ensureAgentBrowser();
    await startServersIfNeeded();
    await runE2e();
  } finally {
    runAgentBrowser(['close'], { allowFailure: true });
    await stopManagedProcesses();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
