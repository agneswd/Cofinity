import * as fs from 'fs';
import * as vscode from 'vscode';
import type { AttachmentInfo } from '../session-runtime/sessionTypes';

export type CofinityResponseSource = 'user' | 'queue' | 'autopilot' | 'system';

export interface CofinityRequestInputResult {
  sessionId: string;
  response: string;
  attachments?: AttachmentInfo[];
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
    `attachments: ${String(output.attachments?.length ?? 0)}`,
    `response: ${output.response}`
  ].join('\n');

  const attachmentParts = (output.attachments ?? [])
    .filter((attachment) => attachment.mimeType.startsWith('image/'))
    .flatMap((attachment) => {
      try {
        const fileBuffer = fs.readFileSync(vscode.Uri.parse(attachment.uri).fsPath);
        return [vscode.LanguageModelDataPart.image(new Uint8Array(fileBuffer), attachment.mimeType)];
      } catch {
        return [];
      }
    });

  return new vscode.LanguageModelToolResult([
    ...attachmentParts,
    new vscode.LanguageModelTextPart(structured),
    new vscode.LanguageModelTextPart(`\n${summary}`)
  ]);
}
