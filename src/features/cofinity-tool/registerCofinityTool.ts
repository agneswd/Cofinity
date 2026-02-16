import * as vscode from 'vscode';
import {
  type CofinityRequestInput,
  COFINITY_REQUEST_INPUT_TOOL_DISPLAY_NAME,
  COFINITY_REQUEST_INPUT_TOOL_NAME
} from './cofinityToolSchema';
import { createInvokeCofinityRequestInput } from './invokeCofinityTool';
import { SessionRegistry } from '../session-runtime/SessionRegistry';

function createInvocationPreview(input: CofinityRequestInput): string {
  const preview = input.question.trim().replace(/\s+/g, ' ');
  const maxLength = 60;

  if (preview.length <= maxLength) {
    return preview;
  }

  return `${preview.slice(0, maxLength - 3)}...`;
}

export function registerCofinityTool(
  context: vscode.ExtensionContext,
  sessionRegistry: SessionRegistry
): void {
  const invokeCofinityRequestInput = createInvokeCofinityRequestInput(sessionRegistry);

  const disposable = vscode.lm.registerTool<CofinityRequestInput>(COFINITY_REQUEST_INPUT_TOOL_NAME, {
    prepareInvocation(options) {
      const preview = createInvocationPreview(options.input);

      return {
        invocationMessage: preview
          ? `${COFINITY_REQUEST_INPUT_TOOL_DISPLAY_NAME}: ${preview}`
          : COFINITY_REQUEST_INPUT_TOOL_DISPLAY_NAME
      };
    },
    async invoke(options, token) {
      return invokeCofinityRequestInput(options, token);
    }
  });

  context.subscriptions.push(disposable);
}
