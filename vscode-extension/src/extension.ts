import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { DebugPanel, HostMessage } from './debugPanel';
import {
  healthCheck,
  startDebug,
  subscribeToEvents,
  AgentEvent,
  DebugResult,
} from './backendClient';

// ── Token storage key ──────────────────────────────────────────────────────
const TOKEN_KEY = 'debugAgent.apiToken';

// ── Helper: get backend URL from settings ─────────────────────────────────
function getBackendUrl(): string {
  const cfg = vscode.workspace.getConfiguration('debugAgent');
  return (cfg.get<string>('backendUrl') || 'http://localhost:8000').replace(/\/$/, '');
}

// ── Extension activation ──────────────────────────────────────────────────
export function activate(context: vscode.ExtensionContext): void {
  console.log('[DebuggerAgent] Extension activated');

  // ── Command: 🐛 Debug with Agent ───────────────────────────────────────
  const debugCmd = vscode.commands.registerCommand('debugAgent.debug', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('Debugger Agent: No active editor found.');
      return;
    }

    const selection = editor.selection;
    const selectedText = editor.document.getText(
      selection.isEmpty ? undefined : selection
    );

    if (!selectedText.trim()) {
      vscode.window.showWarningMessage(
        'Debugger Agent: Please select some code to debug.'
      );
      return;
    }

    const language = editor.document.languageId;
    const sessionId = uuidv4();
    const baseUrl = getBackendUrl();

    // ── Check backend reachability ─────────────────────────────────────
    const healthy = await healthCheck(baseUrl);
    if (!healthy) {
      const action = await vscode.window.showErrorMessage(
        `Debugger Agent: Cannot reach backend at ${baseUrl}. Is the FastAPI server running?`,
        'Open Settings',
        'Dismiss'
      );
      if (action === 'Open Settings') {
        vscode.commands.executeCommand(
          'workbench.action.openSettings',
          'debugAgent.backendUrl'
        );
      }
      return;
    }

    // ── Open / reveal the side panel ──────────────────────────────────
    const panel = DebugPanel.createOrShow(context.extensionUri);
    const token = await context.secrets.get(TOKEN_KEY);

    // ── Handle messages from the webview (e.g. Apply Patch) ───────────
    panel.onMessage(async (msg: HostMessage) => {
      if (msg.type === 'applyPatch') {
        const patchedCode = applyPatchToCode(msg.originalCode || selectedText, msg.patch || '');
        await applyPatchToEditor(editor, patchedCode, selection);
      } else if (msg.type === 'copyToClipboard' && msg.text) {
        await vscode.env.clipboard.writeText(msg.text);
        vscode.window.showInformationMessage('Copied to clipboard!');
      }
    });

    // ── Tell the webview to start ──────────────────────────────────────
    panel.postMessage({
      type: 'start',
      sessionId,
      language,
      codeSnippet: selectedText,
    });

    // ── Subscribe to WebSocket events first (avoid race condition) ─────
    let disposeWs: (() => void) | undefined;
    let wsReady = false;

    const wsReadyPromise = new Promise<void>((resolve) => {
      // Give WS 500ms to connect before calling /debug
      setTimeout(resolve, 500);
    });

    disposeWs = subscribeToEvents(
      baseUrl,
      sessionId,
      (event: AgentEvent) => {
        panel.postMessage({ type: 'agentEvent', data: event });
      },
      () => {
        // 'done' event received from WebSocket
        console.log('[DebuggerAgent] WS signalled done');
      },
      (err: Error) => {
        console.error('[DebuggerAgent] WS error:', err.message);
      }
    );

    await wsReadyPromise;

    // ── Call the debug API ─────────────────────────────────────────────
    panel.postMessage({ type: 'status', text: 'Sending code to agent pipeline…' });

    try {
      const result: DebugResult = await startDebug(baseUrl, {
        userMessage: `Debug this ${language} code`,
        code: selectedText,
        language,
        images: [],
        sessionId,
        token,
      });

      panel.postMessage({ type: 'result', data: result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      panel.postMessage({ type: 'error', message });
      vscode.window.showErrorMessage(`Debugger Agent error: ${message}`);
    } finally {
      disposeWs?.();
    }
  });

  // ── Command: Set API Token ─────────────────────────────────────────────
  const setTokenCmd = vscode.commands.registerCommand('debugAgent.setToken', async () => {
    const token = await vscode.window.showInputBox({
      prompt: 'Enter your Debugger Agent JWT token',
      password: true,
      placeHolder: 'eyJhbGciOiJIUzI1NiIsIn...',
    });
    if (token !== undefined) {
      await context.secrets.store(TOKEN_KEY, token);
      vscode.window.showInformationMessage(
        token
          ? 'Debugger Agent: API token saved securely.'
          : 'Debugger Agent: Token cleared.'
      );
    }
  });

  // ── Command: Clear API Token ───────────────────────────────────────────
  const clearTokenCmd = vscode.commands.registerCommand('debugAgent.clearToken', async () => {
    await context.secrets.delete(TOKEN_KEY);
    vscode.window.showInformationMessage('Debugger Agent: API token cleared.');
  });

  context.subscriptions.push(debugCmd, setTokenCmd, clearTokenCmd);
}

function applyPatchToCode(originalCode: string, patchText: string): string {
  if (!originalCode) {
    return '';
  }

  const rawPatch = (patchText || '').trim();
  if (!rawPatch) {
    return originalCode;
  }

  const normalizedPatch = rawPatch
    .replace(/^```(?:diff|patch)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const looksLikeDiff = /(^|\n)(---|\+\+\+|@@|\*\*\*|diff --git)/.test(normalizedPatch);
  if (!looksLikeDiff) {
    return normalizedPatch || originalCode;
  }

  const originalLines = originalCode.split(/\r?\n/);
  const resultLines = [...originalLines];
  let currentIdx = 0;

  for (const rawLine of normalizedPatch.split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, '');

    if (!line || line.startsWith('---') || line.startsWith('+++') || line.startsWith('***')) {
      continue;
    }

    const headerMatch = line.match(/^@@\s*-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
    if (headerMatch) {
      const start = parseInt(headerMatch[1], 10) - 1;
      currentIdx = Math.max(0, start);
      continue;
    }

    if (line.startsWith('-') && !line.startsWith('--')) {
      const target = line.slice(1).trim();
      const idx = resultLines.findIndex((candidate, i) => i >= currentIdx && candidate.trim() === target);
      if (idx !== -1) {
        resultLines.splice(idx, 1);
        currentIdx = Math.min(currentIdx, resultLines.length - 1);
      }
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('++')) {
      resultLines.splice(currentIdx, 0, line.slice(1));
      currentIdx += 1;
      continue;
    }

    if (line.startsWith(' ')) {
      currentIdx += 1;
      continue;
    }

    if (line.startsWith('\\')) {
      continue;
    }

    if (currentIdx < resultLines.length) {
      currentIdx += 1;
    }
  }

  return resultLines.join('\n');
}

// ── Apply patched code to the editor ──────────────────────────────────────
async function applyPatchToEditor(
  editor: vscode.TextEditor,
  patchedCode: string,
  selection: vscode.Selection
): Promise<void> {
  const safeCode = patchedCode || '';

  await editor.edit((editBuilder) => {
    if (selection.isEmpty) {
      // Replace entire document
      const fullRange = new vscode.Range(
        editor.document.positionAt(0),
        editor.document.positionAt(editor.document.getText().length)
      );
      editBuilder.replace(fullRange, safeCode);
    } else {
      editBuilder.replace(selection, safeCode);
    }
  });

  vscode.window.showInformationMessage('✅ Debugger Agent: Patch applied to editor!');
}

export function deactivate(): void {
  console.log('[DebuggerAgent] Extension deactivated');
}
