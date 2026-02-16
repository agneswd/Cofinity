import * as vscode from 'vscode';

export type CofinityResponseSource = 'user' | 'queue' | 'autopilot' | 'system';

export interface CofinityRequestInputResult {
  sessionId: string;
  response: string;
  source: CofinityResponseSource;
  queuedRemaining: number;
  waiting: boolean;
}

export function buildCofinityToolResult(output: CofinityRequestInputResult): vscode.LanguageModelToolResult {
  const structured = JSON.stringify(output);
  const summary = [
    `sessionId: ${output.sessionId}`,
    `source: ${output.source}`,
    `queuedRemaining: ${output.queuedRemaining}`,
    `waiting: ${String(output.waiting)}`,
    `response: ${output.response}`
  ].join('\n');

  return new vscode.LanguageModelToolResult([
    new vscode.LanguageModelTextPart(structured),
    new vscode.LanguageModelTextPart(`\n${summary}`)
  ]);
}
