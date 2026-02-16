import * as vscode from 'vscode';
import {
  type CofinityRequestInput,
  COFINITY_REQUEST_INPUT_TOOL_NAME,
  isCofinityRequestInput
} from './cofinityToolSchema';
import {
  buildCofinityToolResult,
  type CofinityRequestInputResult
} from './cofinityToolResult';
import { SessionRegistry } from '../session-runtime/SessionRegistry';

export function createInvokeCofinityRequestInput(sessionRegistry: SessionRegistry) {
  return async function invokeCofinityRequestInput(
    options: vscode.LanguageModelToolInvocationOptions<CofinityRequestInput>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    if (!isCofinityRequestInput(options.input)) {
      throw new Error(
        `Invalid input for ${COFINITY_REQUEST_INPUT_TOOL_NAME}. Expected { question: string, sessionId?: string, requestKind?: string, options?: string[] }.`
      );
    }

    const output: CofinityRequestInputResult = await sessionRegistry.handleToolInvocation({
      sessionId: options.input.sessionId?.trim() || undefined,
      question: options.input.question,
      requestKind: options.input.requestKind ?? 'question',
      options: options.input.options,
      token,
      toolInvocationToken: options.toolInvocationToken
    });

    return buildCofinityToolResult(output);
  };
}
