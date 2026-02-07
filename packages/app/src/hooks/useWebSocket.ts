import { useEffect, useRef, useState, useCallback } from 'react';

interface WebSocketMessage {
  type: string;
  path?: string;
  content?: string;
  agent?: string;
  document?: string;
  instruction?: string;
}

interface UseWebSocketOptions {
  onFileChange?: (path: string, content: string) => void;
  onFileCreate?: (path: string) => void;
  onFileDelete?: (path: string) => void;
  onMention?: (agent: string, document: string, instruction: string) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(`ws://${window.location.hostname}:3002`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] Connected');
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WebSocketMessage;
        setLastMessage(msg);

        switch (msg.type) {
          case 'file:changed':
            options.onFileChange?.(msg.path!, msg.content!);
            break;
          case 'file:created':
            options.onFileCreate?.(msg.path!);
            break;
          case 'file:deleted':
            options.onFileDelete?.(msg.path!);
            break;
          case 'mention:triggered':
            options.onMention?.(msg.agent!, msg.document!, msg.instruction!);
            break;
        }
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected');
      setConnected(false);
    };

    ws.onerror = (e) => {
      console.error('[WS] Error:', e);
    };

    return () => {
      ws.close();
    };
  }, []);

  const send = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { connected, lastMessage, send };
}

// Hook for agent typing indicator
export function useAgentTyping(agentId: string | null) {
  const [typing, setTyping] = useState(false);
  const [typingAgent, setTypingAgent] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId) return;

    const ws = new WebSocket(`ws://${window.location.hostname}:3002`);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'agent:typing' && msg.agent === agentId) {
          setTyping(true);
          setTypingAgent(msg.agent);
          // Auto-clear after 5 seconds
          setTimeout(() => {
            setTyping(false);
            setTypingAgent(null);
          }, 5000);
        }
      } catch (e) {}
    };

    return () => ws.close();
  }, [agentId]);

  return { typing, typingAgent };
}
