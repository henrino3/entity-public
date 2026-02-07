import mcSourceHtml from '../../../../../MC-SOURCE.html?raw';

function extractWithRegex(source: string, pattern: RegExp, label: string): string {
  const match = source.match(pattern);
  if (!match?.[1]) {
    throw new Error(`Mission Control source parse failed: missing ${label}`);
  }
  return match[1].trim();
}

function extractBetween(source: string, startMarker: string, endMarker: string, label: string): string {
  const start = source.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`Mission Control source parse failed: missing start marker for ${label}`);
  }

  const end = source.indexOf(endMarker, start);
  if (end === -1) {
    throw new Error(`Mission Control source parse failed: missing end marker for ${label}`);
  }

  return source.slice(start, end).trim();
}

function extractFrom(source: string, startMarker: string, label: string): string {
  const start = source.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`Mission Control source parse failed: missing start marker for ${label}`);
  }
  return source.slice(start).trim();
}

function replaceKeyframesWithTokens(sourceCss: string): { cssWithoutKeyframes: string; keyframes: string[] } {
  const keyframes: string[] = [];
  let cssWithoutKeyframes = sourceCss;
  const keyframesRegex = /@keyframes\s+[A-Za-z0-9_-]+\s*\{/g;
  let match = keyframesRegex.exec(sourceCss);

  while (match) {
    const start = match.index;
    let index = keyframesRegex.lastIndex;
    let depth = 1;

    while (index < sourceCss.length && depth > 0) {
      const char = sourceCss[index];
      if (char === '{') depth += 1;
      if (char === '}') depth -= 1;
      index += 1;
    }

    const block = sourceCss.slice(start, index);
    const token = `__MC_KEYFRAMES_${keyframes.length}__`;
    keyframes.push(block);
    cssWithoutKeyframes = cssWithoutKeyframes.replace(block, token);

    match = keyframesRegex.exec(sourceCss);
  }

  return { cssWithoutKeyframes, keyframes };
}

function scopeSelector(selector: string): string {
  const normalized = selector.trim();
  if (!normalized) {
    return normalized;
  }

  if (normalized === 'body' || normalized === 'html' || normalized === ':root') {
    return '.mc-root';
  }

  if (normalized === '*') {
    return '.mc-root, .mc-root *';
  }

  if (normalized.startsWith('.mc-root')) {
    return normalized;
  }

  return `.mc-root ${normalized}`;
}

function scopeMissionControlStyles(sourceCss: string): string {
  const cssWithoutComments = sourceCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const { cssWithoutKeyframes, keyframes } = replaceKeyframesWithTokens(cssWithoutComments);

  const scopedCss = cssWithoutKeyframes.replace(/(^|{|})(\s*[^@{}][^{}]*)\{/g, (fullMatch, prefix, selectorBlock) => {
    const scopedSelectors = String(selectorBlock)
      .split(',')
      .map((selector) => scopeSelector(selector))
      .join(', ');

    return `${prefix}\n${scopedSelectors} {`;
  });

  return keyframes.reduce(
    (css, keyframeBlock, index) => css.replace(`__MC_KEYFRAMES_${index}__`, keyframeBlock),
    scopedCss
  );
}

const missionControlCss = extractWithRegex(mcSourceHtml, /<style>([\s\S]*?)<\/style>/, 'style block');
const missionControlBody = extractWithRegex(mcSourceHtml, /<body>([\s\S]*?)<script>/, 'body markup');
const missionControlScript = extractWithRegex(mcSourceHtml, /<script>([\s\S]*?)<\/script>\s*<\/body>/, 'runtime script');

export const mcScopedStyles = scopeMissionControlStyles(missionControlCss);
export const mcRuntimeScript = missionControlScript;

export const mcFragments = {
  header: extractBetween(missionControlBody, '<div class="header">', '<div class="filters">', 'header'),
  filterBar: extractBetween(missionControlBody, '<div class="filters">', '<div style="padding: 10px 30px 0;">', 'filter bar'),
  rightSidebar: extractBetween(
    missionControlBody,
    '<div style="padding: 10px 30px 0;">',
    '<div style="padding: 0 30px; margin-bottom: 8px;">',
    'insights panels'
  ),
  opsView: extractBetween(
    missionControlBody,
    '<div style="padding: 0 30px; margin-bottom: 8px;">',
    '<div class="strategic-board" id="strategicBoard">',
    'ops board'
  ),
  strategicView: extractBetween(
    missionControlBody,
    '<div class="strategic-board" id="strategicBoard">',
    '<!-- Agents Dashboard -->',
    'strategic board'
  ),
  agentsView: extractBetween(
    missionControlBody,
    '<div class="agents-board" id="agentsBoard" style="display: none;">',
    '<!-- Add Task Modal -->',
    'agents board'
  ),
  addTaskModal: extractBetween(
    missionControlBody,
    '<!-- Add Task Modal -->',
    '<!-- Settings Modal -->',
    'add task modal'
  ),
  settingsModal: extractBetween(
    missionControlBody,
    '<!-- Settings Modal -->',
    '<!-- Task Detail Panel - Asana style -->',
    'settings modal'
  ),
  taskDetail: extractBetween(
    missionControlBody,
    '<!-- Task Detail Panel - Asana style -->',
    '<div class="login-overlay" id="loginOverlay">',
    'task detail overlay'
  ),
  loginOverlay: extractFrom(
    missionControlBody,
    '<div class="login-overlay" id="loginOverlay">',
    'login overlay'
  ),
};
