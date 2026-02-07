import { RefObject, useEffect } from 'react';
import { mcRuntimeScript, mcScopedStyles } from '../components/mission-control/mcSourcePort';

const MC_STYLE_ID = 'mc-source-style-port';
const MC_SCRIPT_ID = 'mc-source-runtime-port';
const MC_ORIGIN = 'http://YOUR_SERVER_IP:3000';

const UNIQUE_FUNCTION_NAMES = Array.from(
  new Set(Array.from(mcRuntimeScript.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g), (match) => match[1]))
);

declare global {
  interface Window {
    __mcFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    __mcSetInterval?: typeof window.setInterval;
    __mcAddDocumentListener?: typeof document.addEventListener;
    __mcAddWindowListener?: typeof window.addEventListener;
  }
}

function transformRuntimeScript(source: string): string {
  return source
    .replace(/\bfetch\(/g, 'window.__mcFetch(')
    .replace(/\bsetInterval\(/g, 'window.__mcSetInterval(')
    .replace(/document\.addEventListener\(/g, 'window.__mcAddDocumentListener(')
    .replace(/window\.addEventListener\(/g, 'window.__mcAddWindowListener(');
}

function wrapRuntimeScript(source: string): string {
  const transformed = transformRuntimeScript(source);
  const exportedFunctions = UNIQUE_FUNCTION_NAMES.map((name) => `window.${name} = ${name};`).join('\n');

  return `
(() => {
${transformed}
${exportedFunctions}
})();
`;
}

function resolveMissionControlUrl(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof input !== 'string') {
    return input;
  }

  if (input.startsWith('/api/') || input.startsWith('/ws')) {
    return `${MC_ORIGIN}${input}`;
  }

  return input;
}

export function useMCData(rootRef: RefObject<HTMLElement>, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !rootRef.current) {
      return;
    }

    let styleTag = document.getElementById(MC_STYLE_ID) as HTMLStyleElement | null;
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = MC_STYLE_ID;
      styleTag.textContent = mcScopedStyles;
      document.head.appendChild(styleTag);
    }

    const trackedIntervals: number[] = [];
    const trackedDocumentListeners: Array<[string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions | undefined]> = [];
    const trackedWindowListeners: Array<[string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions | undefined]> = [];

    const nativeFetch = window.fetch.bind(window);
    const nativeSetInterval = window.setInterval.bind(window);

    window.__mcFetch = (input, init) => nativeFetch(resolveMissionControlUrl(input), init);
    window.__mcSetInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      const intervalId = nativeSetInterval(handler, timeout, ...args);
      trackedIntervals.push(intervalId);
      return intervalId;
    }) as typeof window.setInterval;

    window.__mcAddDocumentListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      trackedDocumentListeners.push([type, listener, options]);
      document.addEventListener(type, listener, options);
    }) as typeof document.addEventListener;

    window.__mcAddWindowListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      trackedWindowListeners.push([type, listener, options]);
      window.addEventListener(type, listener, options);
    }) as typeof window.addEventListener;

    const existingScript = document.getElementById(MC_SCRIPT_ID);
    if (existingScript) {
      existingScript.remove();
    }

    const scriptTag = document.createElement('script');
    scriptTag.id = MC_SCRIPT_ID;
    scriptTag.text = wrapRuntimeScript(mcRuntimeScript);
    document.body.appendChild(scriptTag);

    return () => {
      trackedIntervals.forEach((id) => window.clearInterval(id));

      trackedDocumentListeners.forEach(([type, listener, options]) => {
        document.removeEventListener(type, listener, options);
      });

      trackedWindowListeners.forEach(([type, listener, options]) => {
        window.removeEventListener(type, listener, options);
      });

      UNIQUE_FUNCTION_NAMES.forEach((name) => {
        delete (window as unknown as Record<string, unknown>)[name];
      });

      scriptTag.remove();
      delete window.__mcFetch;
      delete window.__mcSetInterval;
      delete window.__mcAddDocumentListener;
      delete window.__mcAddWindowListener;
    };
  }, [enabled, rootRef]);
}
