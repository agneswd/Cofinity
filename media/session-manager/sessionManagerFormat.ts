import type { SessionChatMessage } from './sessionManagerModels';

export function formatStatusLabel(status: string): string {
  return status
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const s = Math.round(ms / 1000);
  if (s < 60) {
    return `${s}s`;
  }

  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

export function messageStateLabel(message: SessionChatMessage): string {
  switch (message.state) {
    case 'pending':
      return 'waiting';
    case 'queued':
      return 'queued';
    case 'skipped':
      return 'cleared';
    default:
      return 'sent';
  }
}
