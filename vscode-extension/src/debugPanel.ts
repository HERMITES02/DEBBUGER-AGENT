import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export type WebviewMessage =
  | { type: 'start'; sessionId: string; language: string; codeSnippet: string }
  | { type: 'agentEvent'; data: object }
  | { type: 'result'; data: object }
  | { type: 'error'; message: string }
  | { type: 'status'; text: string };

export type HostMessage =
  | { type: 'applyPatch'; patch: string; originalCode: string }
  | { type: 'copyToClipboard'; text: string }
  | { type: 'ready' };

/**
 * Manages a singleton WebviewPanel for the Debugger Agent side panel.
 */
export class DebugPanel {
  private static _instance: DebugPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _messageHandler?: (msg: HostMessage) => void;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.webview.html = this._buildHtml();

    this._panel.webview.onDidReceiveMessage(
      (msg: HostMessage) => this._messageHandler?.(msg),
      null,
      this._disposables
    );

    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
  }

  /**
   * Creates or reveals the singleton panel.
   */
  static createOrShow(extensionUri: vscode.Uri): DebugPanel {
    if (DebugPanel._instance) {
      DebugPanel._instance._panel.reveal(vscode.ViewColumn.Beside, true);
      return DebugPanel._instance;
    }

    const panel = vscode.window.createWebviewPanel(
      'debuggerAgent',
      '🐛 Debugger Agent',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'webview'),
        ],
        retainContextWhenHidden: true,
      }
    );

    DebugPanel._instance = new DebugPanel(panel, extensionUri);
    return DebugPanel._instance;
  }

  /**
   * Sends a message from the extension host → webview.
   */
  postMessage(msg: WebviewMessage): void {
    this._panel.webview.postMessage(msg);
  }

  /**
   * Registers a handler for messages sent from the webview → extension host.
   */
  onMessage(handler: (msg: HostMessage) => void): void {
    this._messageHandler = handler;
  }

  /**
   * Returns true if the panel is currently visible.
   */
  get isVisible(): boolean {
    return this._panel.visible;
  }

  private _buildHtml(): string {
  const webview = this._panel.webview;
  const webviewDir = vscode.Uri.joinPath(this._extensionUri, 'webview');

  const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewDir, 'panel.css'));
  const jsUri  = webview.asWebviewUri(vscode.Uri.joinPath(webviewDir, 'panel.js'));

  const htmlPath = path.join(this._extensionUri.fsPath, 'webview', 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');

  html = html
    .replaceAll('{{CSS_URI}}', cssUri.toString())
    .replaceAll('{{JS_URI}}', jsUri.toString())
    .replaceAll('{{CSP_SOURCE}}', webview.cspSource);

  return html;
}

  private _dispose(): void {
    DebugPanel._instance = undefined;
    this._panel.dispose();
    this._disposables.forEach((d) => d.dispose());
    this._disposables = [];
  }
}
