import * as vscode from 'vscode';

function getNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  for (let index = 0; index < 32; index += 1) {
    result += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }

  return result;
}

export function buildSessionManagerHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {
  const nonce = getNonce();
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'sessionManager.js')
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'session-manager', 'sessionManager.css')
  );
  const logoUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'cofinity.svg')
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Cofinity Session Manager</title>
</head>
<body>
  <div class="app-shell">
    <main class="session-detail-panel">
      <div id="session-detail" class="session-detail empty-state">
        <div class="empty-state-brand">
          <img class="empty-state-logo" src="${logoUri}" alt="Cofinity logo" />
          <span>Select a session to open its chat view.</span>
        </div>
      </div>
    </main>
    <aside class="session-list-panel">
      <button id="sidebar-toggle" class="sidebar-toggle" aria-label="Toggle sidebar">
        <span class="sidebar-toggle-icon" aria-hidden="true"><i data-lucide="chevron-left"></i></span>
      </button>
      <div class="panel-heading">
        <div class="panel-heading-brand">
          <img class="panel-heading-logo" src="${logoUri}" alt="Cofinity logo" />
          <span>Sessions</span>
        </div>
        <button id="new-session-button" class="panel-heading-action" aria-label="Start a new Copilot session"><i data-lucide="plus"></i><span>New session</span></button>
      </div>
      <div id="sessions-list" class="session-list empty-state">No active sessions yet.</div>
    </aside>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
