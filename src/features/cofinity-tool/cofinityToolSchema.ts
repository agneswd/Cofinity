import type { SessionRequestKind } from '../session-runtime/sessionTypes';

export const COFINITY_REQUEST_INPUT_TOOL_NAME = 'cofinity_request_input';
export const COFINITY_REQUEST_INPUT_TOOL_DISPLAY_NAME = 'Cofinity Request Input';

export interface CofinityRequestInput {
  sessionId?: string;
  question: string;
  requestKind?: SessionRequestKind;
  options?: string[];
}

export const COFINITY_REQUEST_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    sessionId: {
      type: 'string',
      description: 'The existing Cofinity session identifier. Reuse the exact sessionId returned by the previous tool call when continuing the same workflow.'
    },
    question: {
      type: 'string',
      description: 'The question or next-step request that should be shown to the user.'
    },
    requestKind: {
      type: 'string',
      description: 'Optional hint for how the request should be presented.',
      enum: ['question', 'approval', 'pick', 'freeform']
    },
    options: {
      type: 'array',
      description: 'Optional list of choices for a pick-style request.',
      items: {
        type: 'string'
      }
    }
  },
  required: ['question']
} as const;

export function isCofinityRequestInput(value: unknown): value is CofinityRequestInput {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  if (typeof candidate.question !== 'string' || candidate.question.trim().length === 0) {
    return false;
  }

  if (candidate.sessionId !== undefined && typeof candidate.sessionId !== 'string') {
    return false;
  }

  if (candidate.requestKind !== undefined) {
    const validKinds: SessionRequestKind[] = ['question', 'approval', 'pick', 'freeform'];
    if (typeof candidate.requestKind !== 'string' || !validKinds.includes(candidate.requestKind as SessionRequestKind)) {
      return false;
    }
  }

  if (candidate.options !== undefined) {
    if (!Array.isArray(candidate.options) || candidate.options.some((item) => typeof item !== 'string')) {
      return false;
    }
  }

  return true;
}
