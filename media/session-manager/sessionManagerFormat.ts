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
