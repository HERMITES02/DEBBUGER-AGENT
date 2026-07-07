import * as http from 'http';
import * as https from 'https';
import type { RawData } from 'ws';
// Use dynamic require so VS Code does not bundle ws as a native module at compile time
// eslint-disable-next-line @typescript-eslint/no-var-requires
const WebSocket = require('ws') as typeof import('ws');

export interface DebugParams {
  userMessage: string;
  code: string;
  language: string;
  images: string[];
  sessionId: string;
  token?: string;
}

export interface DebugResult {
  root_cause?: string;
  patch?: string;
  patch_diff?: string;
  explanation?: string;
  tests?: string[];
  confidence?: number;
  session_id?: string;
  user_message?: string;
  code?: string;
  language?: string;
  images?: string[];
  request?: any;
}

export interface AgentEvent {
  agent_id: string;
  type: string;
  payload: string;
  timestamp: number;
}

/**
 * Performs a simple GET to /health and resolves true if reachable.
 */
export async function healthCheck(baseUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const url = new URL('/health', baseUrl);
    const lib = url.protocol === 'https:' ? https : http;

    const req = lib.get(url.toString(), { timeout: 3000 }, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Calls POST /debug and returns the debug result.
 */
export async function startDebug(
  baseUrl: string,
  params: DebugParams
): Promise<DebugResult> {
  return new Promise((resolve, reject) => {
    const url = new URL('/debug', baseUrl);
    const body = JSON.stringify({
      user_message: params.userMessage,
      code: params.code || null,
      language: params.language,
      images: params.images.map((img) =>
        img.includes(',') ? img.split(',')[1] : img
      ),
      session_id: params.sessionId,
    });

    const options: http.RequestOptions | https.RequestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(params.token ? { Authorization: `Bearer ${params.token}` } : {}),
      },
    };

    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url.toString(), options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Failed to parse response JSON'));
          }
        } else {
          try {
            const err = JSON.parse(data);
            reject(new Error(err.detail || `Server error ${res.statusCode}`));
          } catch {
            reject(new Error(`Server error ${res.statusCode}`));
          }
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Opens a WebSocket to /ws/events/{sessionId} and calls onEvent for each
 * agent event. Returns a dispose function to close the socket.
 */
export function subscribeToEvents(
  baseUrl: string,
  sessionId: string,
  onEvent: (event: AgentEvent) => void,
  onDone: () => void,
  onError: (err: Error) => void
): () => void {
  // Convert http(s) → ws(s)
  const wsUrl = baseUrl
    .replace(/^http:/, 'ws:')
    .replace(/^https:/, 'wss:');

  const ws = new WebSocket(`${wsUrl}/ws/events/${sessionId}`);

  ws.on('open', () => {
    console.log(`[backendClient] WebSocket connected for session ${sessionId}`);
  });

  ws.on('message', (raw: RawData) => {
    try {
      const data: AgentEvent = JSON.parse(raw.toString());
      if (data.type === 'done') {
        onDone();
        return;
      }
      onEvent(data);
    } catch (e) {
      console.error('[backendClient] parse error:', e);
    }
  });

  ws.on('error', (err) => onError(err));

  ws.on('close', () => {
    console.log('[backendClient] WebSocket closed');
  });

  return () => {
    // 0 = CONNECTING, 1 = OPEN
    if (ws.readyState === 0 || ws.readyState === 1) {
      ws.close();
    }
  };
}
