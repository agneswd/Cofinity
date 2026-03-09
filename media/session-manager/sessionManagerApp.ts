import {
  ChevronLeft,
  createElement,
  FileText,
  Image,
  ImagePlus,
  Inbox,
  Pencil,
  Plus,
  Send,
  Trash2
} from 'lucide';
import type {
  AttachmentInfo,
  ExtensionMessage,
  GlobalSettings,
  SessionListItem,
  SessionSnapshot
} from './sessionManagerModels';
import { renderGlobalPendingView } from './sessionManagerGlobalView';
import { playRequestSound, primeRequestSound } from './sessionManagerSound';
import { renderSessionDetail, renderSessionsList } from './sessionManagerTemplate';

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

type WebviewApi = ReturnType<typeof acquireVsCodeApi>;

interface ProcessingIndicatorState {
  baselineMessageCount: number;
  startedAtMs: number;
}

const LUCIDE_ICONS = {
  'chevron-left': ChevronLeft,
  inbox: Inbox,
  plus: Plus,
  pencil: Pencil,
  'trash-2': Trash2,
  file: FileText,
  image: Image,
  'image-plus': ImagePlus,
  send: Send
} as const;

export class SessionManagerApp {
  private readonly vscode: WebviewApi;
  private readonly sessionsListElement = document.getElementById('sessions-list');
  private readonly sessionDetailElement = document.getElementById('session-detail');
  private readonly globalViewToggleButton = document.getElementById('global-view-toggle') as HTMLButtonElement | null;
  private readonly globalViewCountElement = document.getElementById('global-view-count') as HTMLSpanElement | null;
  private readonly sidebarResizer = document.getElementById('sidebar-resizer') as HTMLDivElement | null;
  private readonly sidebarToggleButton = document.getElementById('sidebar-toggle') as HTMLButtonElement | null;
  private readonly newSessionButton = document.getElementById('new-session-button') as HTMLButtonElement | null;
  private readonly appShell = document.querySelector('.app-shell') as HTMLElement | null;

  private selectedSessionId: string | null = null;
  private sessions: SessionListItem[] = [];
  private session: SessionSnapshot | null = null;
  private globalSettings: GlobalSettings = {
    notificationSoundEnabled: true,
    autoRevealEnabled: true,
    autoQueuePrompts: true,
    enterSends: false,
    autopilotPrompts: [
      'Continue with your best judgment. You are in autopilot mode.',
      'Proceed as you see fit. Make any decisions you need to.',
      'You have my approval. Continue with the task.'
    ],
    autopilotDelayMinMs: 2000,
    autopilotDelayMaxMs: 5000
  };
  private settingsOpen = false;
  private sidebarCollapsed = false;
  private sidebarWidth = 240;
  private viewMode: 'session' | 'global' = 'session';
  private inlineErrorMessage: string | null = null;
  private draggedQueuedPromptId: string | null = null;
  private draggedAutopilotPromptIndex: number | null = null;
  private composerRefocusAttemptsRemaining = 0;
  private readonly draftComposerBySession = new Map<string, string>();
  private readonly draftAttachmentsBySession = new Map<string, AttachmentInfo[]>();
  private readonly toolCallsBySession = new Map<string, number>();
  private readonly processingResponseBySession = new Map<string, ProcessingIndicatorState>();
  private readonly processingResponseTimeouts = new Map<string, number>();

  constructor() {
    this.vscode = acquireVsCodeApi();
  }

  public start(): void {
    const unlockAudio = () => {
      primeRequestSound();
    };

    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });

    window.addEventListener('message', (event: MessageEvent<ExtensionMessage>) => {
      this.handleMessage(event.data);
    });

    this.sidebarToggleButton?.addEventListener('click', () => {
      this.sidebarCollapsed = !this.sidebarCollapsed;
      this.appShell?.classList.toggle('sidebar-collapsed', this.sidebarCollapsed);
      if (!this.sidebarCollapsed) {
        this.applySidebarWidth();
      }
    });

    this.globalViewToggleButton?.addEventListener('click', () => {
      this.viewMode = this.viewMode === 'global' ? 'session' : 'global';
      this.renderGlobalViewToggle();
      this.renderSession();
    });

    this.newSessionButton?.addEventListener('click', () => {
      this.openNewSession();
    });

    this.sidebarResizer?.addEventListener('pointerdown', (event) => {
      if (this.sidebarCollapsed || !this.appShell) {
        return;
      }

      event.preventDefault();
      document.body.classList.add('is-sidebar-resizing');

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const rect = this.appShell?.getBoundingClientRect();
        if (!rect) {
          return;
        }

        this.sidebarWidth = this.clampSidebarWidth(rect.right - moveEvent.clientX);
        this.applySidebarWidth();
      };

      const handlePointerUp = () => {
        document.body.classList.remove('is-sidebar-resizing');
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    });

    window.addEventListener('resize', () => {
      if (!this.sidebarCollapsed) {
        this.applySidebarWidth();
      }
    });

    this.vscode.postMessage({
      protocolVersion: 1,
      type: 'uiReady',
      payload: {}
    });

    this.applySidebarWidth();
    this.renderGlobalViewToggle();
    this.refreshIcons();
  }

  private handleMessage(message: ExtensionMessage): void {
    switch (message.type) {
      case 'sessionsSnapshot':
        this.handleSessionsSnapshot(message.payload.selectedSessionId, message.payload.sessions);
        return;
      case 'sessionSnapshot':
        this.reconcileComposerFocus(message.payload.session);
        this.syncProcessingIndicator(message.payload.session);
        this.session = message.payload.session;
        this.renderSession();
        this.scrollTranscriptToBottom();
        return;
      case 'globalSettings':
        this.globalSettings = message.payload;
        this.renderSession();
        return;
      case 'attachmentsAdded': {
        if (!this.session) {
          return;
        }

        const existing = this.draftAttachmentsBySession.get(this.session.sessionId) ?? [];
        this.draftAttachmentsBySession.set(this.session.sessionId, [...existing, ...message.payload.attachments]);
        this.requestComposerRefocus();
        this.renderSession();
        return;
      }
      case 'imageSaved': {
        if (!this.session) {
          return;
        }

        const existing = this.draftAttachmentsBySession.get(this.session.sessionId) ?? [];
        this.draftAttachmentsBySession.set(this.session.sessionId, [...existing, message.payload.attachment]);
        this.requestComposerRefocus();
        this.renderSession();
        return;
      }
      case 'error':
        this.inlineErrorMessage = message.payload.message;
        this.renderSession();
        return;
      case 'openSettings':
        this.openSettingsModal();
        return;
      default:
        return;
    }
  }

  private handleSessionsSnapshot(selectedSessionId: string | null, sessions: SessionListItem[]): void {
    sessions.forEach((session) => {
      const isKnown = this.toolCallsBySession.has(session.sessionId);
      const previousToolCalls = this.toolCallsBySession.get(session.sessionId) ?? 0;

      // Only play sound when we've already seen this session (not on first open)
      // and the agent has made a new tool call and is now waiting for user input
      if (
        isKnown &&
        session.toolCalls > previousToolCalls &&
        session.hasPendingRequest &&
        this.globalSettings.notificationSoundEnabled
      ) {
        playRequestSound();
      }

      this.toolCallsBySession.set(session.sessionId, session.toolCalls);
    });

    this.selectedSessionId = selectedSessionId;
    this.sessions = sessions;
    this.renderSessions();
    this.renderGlobalViewToggle();

    if (this.viewMode === 'global') {
      this.renderSession();
    }
  }

  private renderSessions(): void {
    if (!this.sessionsListElement) {
      return;
    }

    if (this.sessions.length === 0) {
      this.sessionsListElement.className = 'session-list empty-state';
      this.sessionsListElement.textContent = 'No active sessions yet.';
      return;
    }

    this.sessionsListElement.className = 'session-list';
    this.sessionsListElement.innerHTML = renderSessionsList(this.sessions, this.selectedSessionId);
    this.refreshIcons();

    // Select on clicking the main card area
    this.sessionsListElement.querySelectorAll<HTMLButtonElement>('.session-card-select').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sessionId = btn.dataset.sessionId ?? null;
        this.vscode.postMessage({ protocolVersion: 1, type: 'selectSession', payload: { sessionId } });
      });
    });

    // Action buttons: rename / dispose
    this.sessionsListElement.querySelectorAll<HTMLButtonElement>('.session-action-btn').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const sessionId = btn.dataset.sessionId ?? null;
        if (!sessionId) {
          return;
        }

        if (btn.dataset.action === 'dispose') {
          this.vscode.postMessage({ protocolVersion: 1, type: 'disposeSession', sessionId, payload: {} });
          return;
        }

        if (btn.dataset.action === 'rename') {
          // Find the title element inside this card and replace with an inline input
          const card = btn.closest('.session-card');
          const titleEl = card?.querySelector('.session-card-title') as HTMLElement | null;
          if (!titleEl) {
            return;
          }

          const currentTitle = titleEl.textContent ?? '';
          const input = document.createElement('input');
          input.type = 'text';
          input.value = currentTitle;
          input.className = 'session-rename-input';
          titleEl.replaceWith(input);
          input.focus();
          input.select();

          const commit = () => {
            const newTitle = input.value.trim();
            // Restore title element
            const restored = document.createElement('div');
            restored.className = 'session-card-title';
            restored.textContent = newTitle || currentTitle;
            input.replaceWith(restored);
            if (newTitle && newTitle !== currentTitle) {
              this.vscode.postMessage({ protocolVersion: 1, type: 'renameSession', sessionId, payload: { newTitle } });
            }
          };

          input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              commit();
            } else if (e.key === 'Escape') {
              const restored = document.createElement('div');
              restored.className = 'session-card-title';
              restored.textContent = currentTitle;
              input.replaceWith(restored);
            }
          });
          input.addEventListener('keyup', (e) => {
            e.stopPropagation();
          });
          input.addEventListener('blur', commit);
        }
      });
    });
  }

  private renderSession(): void {
    if (!this.sessionDetailElement) {
      return;
    }

    if (this.viewMode === 'global') {
      this.sessionDetailElement.className = 'session-detail global-view-detail';
      this.sessionDetailElement.innerHTML = renderGlobalPendingView(this.sessions, this.draftComposerBySession, this.inlineErrorMessage);
      this.bindGlobalViewEvents();
      this.bindInlineErrorEvents();
      this.refreshIcons();
      return;
    }

    if (!this.session) {
      this.sessionDetailElement.className = 'session-detail empty-state';
      this.sessionDetailElement.innerHTML = this.sessions.length === 0
        ? `
          <div class="empty-state-brand">
            <span>Start a new session to get started.</span>
            <button id="empty-new-session-button" class="empty-state-action" aria-label="Start a new Copilot session">
              <i data-lucide="plus" aria-hidden="true"></i>
              <span>New session</span>
            </button>
          </div>
        `
        : '<div class="empty-state-brand"><span>Select a session to open its chat view.</span></div>';
      this.bindEmptyStateEvents();
      this.refreshIcons();
      return;
    }

    this.sessionDetailElement.className = 'session-detail chat-detail';
    this.sessionDetailElement.innerHTML = renderSessionDetail(
      this.session,
      this.settingsOpen,
      this.globalSettings,
      this.draftAttachmentsBySession.get(this.session.sessionId) ?? [],
      this.shouldShowProcessingIndicator(this.session),
      this.inlineErrorMessage
    );

    this.bindSessionEvents();
    this.bindInlineErrorEvents();
    this.refreshIcons();

    if (this.composerRefocusAttemptsRemaining > 0) {
      const composerTextarea = document.getElementById('composer-textarea') as HTMLTextAreaElement | null;
      composerTextarea?.focus();
      this.composerRefocusAttemptsRemaining -= 1;
    }
  }

  private bindGlobalViewEvents(): void {
    this.sessionDetailElement?.querySelectorAll<HTMLButtonElement>('[data-global-open-session-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const sessionId = button.dataset.globalOpenSessionId;
        if (!sessionId) {
          return;
        }

        this.viewMode = 'session';
        this.renderGlobalViewToggle();
        this.vscode.postMessage({
          protocolVersion: 1,
          type: 'selectSession',
          payload: { sessionId }
        });
      });
    });

    this.sessionDetailElement?.querySelectorAll<HTMLTextAreaElement>('.global-view-response-input').forEach((textarea) => {
      const sessionId = textarea.dataset.globalSessionId;
      if (!sessionId) {
        return;
      }

      textarea.value = this.draftComposerBySession.get(sessionId) ?? '';
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.max(textarea.scrollHeight, 36)}px`;

      const sendButton = this.sessionDetailElement?.querySelector<HTMLButtonElement>(`[data-global-send-session-id="${sessionId}"]`) ?? null;
      const updateSendButtonState = () => {
        if (!sendButton) {
          return;
        }

        sendButton.disabled = textarea.value.trim().length === 0;
      };

      updateSendButtonState();

      textarea.addEventListener('input', () => {
        this.draftComposerBySession.set(sessionId, textarea.value);
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.max(textarea.scrollHeight, 36)}px`;
        updateSendButtonState();
      });

      textarea.addEventListener('keydown', (event) => {
        const enterSends = this.globalSettings.enterSends;
        if (enterSends) {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendButton?.click();
          }
          return;
        }

        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          sendButton?.click();
        }
      });
    });

    this.sessionDetailElement?.querySelectorAll<HTMLButtonElement>('[data-global-send-session-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const sessionId = button.dataset.globalSendSessionId;
        if (!sessionId) {
          return;
        }

        const textarea = this.sessionDetailElement?.querySelector<HTMLTextAreaElement>(`.global-view-response-input[data-global-session-id="${sessionId}"]`) ?? null;
        const content = textarea?.value.trim() ?? '';
        if (!content) {
          return;
        }

        this.vscode.postMessage({
          protocolVersion: 1,
          type: 'submitComposerInput',
          sessionId,
          payload: {
            content,
            attachments: []
          }
        });

        this.beginProcessingIndicator(sessionId);
        this.draftComposerBySession.set(sessionId, '');
        this.renderSession();
      });
    });
  }

  private bindEmptyStateEvents(): void {
    const emptyStateButton = document.getElementById('empty-new-session-button') as HTMLButtonElement | null;
    emptyStateButton?.addEventListener('click', () => {
      this.openNewSession();
    });
  }

  private bindSessionEvents(): void {
    if (!this.session) {
      return;
    }

    const modalBackdrop = document.getElementById('settings-modal-backdrop') as HTMLDivElement | null;
    const modalClose = document.getElementById('settings-modal-close') as HTMLButtonElement | null;
    const composerTextarea = document.getElementById('composer-textarea') as HTMLTextAreaElement | null;
    const composerImageInput = document.getElementById('composer-image-input') as HTMLInputElement | null;
    const attachFileButton = document.getElementById('attach-file-button') as HTMLButtonElement | null;
    const attachImageButton = document.getElementById('attach-image-button') as HTMLButtonElement | null;
    const sendButton = document.getElementById('send-button') as HTMLButtonElement | null;
    const autopilotCheckbox = document.getElementById('autopilot-checkbox') as HTMLInputElement | null;
    const autopilotBarCheckbox = document.getElementById('autopilot-bar-checkbox') as HTMLInputElement | null;
    const autopilotMaxTurns = document.getElementById('autopilot-max-turns') as HTMLInputElement | null;
    const soundCheckbox = document.getElementById('sound-checkbox') as HTMLInputElement | null;
    const autoRevealCheckbox = document.getElementById('auto-reveal-checkbox') as HTMLInputElement | null;
    const autoQueueCheckbox = document.getElementById('auto-queue-checkbox') as HTMLInputElement | null;
    const enterSendsCheckbox = document.getElementById('enter-sends-checkbox') as HTMLInputElement | null;
    const clearQueueButton = document.getElementById('clear-queue-button') as HTMLButtonElement | null;
    const queueCollapseToggle = document.getElementById('queue-collapse-toggle') as HTMLButtonElement | null;
    const autopilotPromptModalBackdrop = document.getElementById('autopilot-prompt-modal-backdrop') as HTMLDivElement | null;
    const autopilotPromptModalClose = document.getElementById('autopilot-prompt-modal-close') as HTMLButtonElement | null;
    const autopilotPromptModalCancel = document.getElementById('autopilot-prompt-cancel') as HTMLButtonElement | null;
    const autopilotPromptModalSave = document.getElementById('autopilot-prompt-save') as HTMLButtonElement | null;
    const newPromptTextarea = document.getElementById('autopilot-prompt-new') as HTMLTextAreaElement | null;
    const addPromptButton = document.getElementById('autopilot-prompt-add') as HTMLButtonElement | null;
    const queueItems = Array.from(document.querySelectorAll<HTMLElement>('.queue-stack-item'));
    const autopilotPromptItems = Array.from(document.querySelectorAll<HTMLElement>('.autopilot-prompt-item'));
    const attachmentRemoveButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.attachment-chip-remove'));
    const queueEditButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.queue-edit-button'));
    const queueDeleteButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.queue-delete-button'));
    const queueSaveButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.queue-save-button'));
    const queueCancelButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.queue-cancel-button'));

    const currentDraftAttachments = this.draftAttachmentsBySession.get(this.session.sessionId) ?? [];
    const draftComposerValue = this.draftComposerBySession.get(this.session.sessionId) ?? '';
    const updateSendButtonState = () => {
      if (!composerTextarea || !sendButton) {
        return;
      }

      sendButton.disabled = composerTextarea.value.trim().length === 0;
    };

    if (composerTextarea) {
      composerTextarea.value = draftComposerValue;
      composerTextarea.style.height = 'auto';
      if (draftComposerValue) {
        composerTextarea.style.height = `${composerTextarea.scrollHeight}px`;
      }
    }
    updateSendButtonState();

    // Modal: close button
    modalClose?.addEventListener('click', () => {
      this.settingsOpen = false;
      modalBackdrop?.classList.add('is-hidden');
    });

    // Queue collapse toggle
    queueCollapseToggle?.addEventListener('click', () => {
      queueCollapseToggle.closest('.queue-stack')?.classList.toggle('is-collapsed');
    });

    // Modal: close on backdrop click
    modalBackdrop?.addEventListener('click', (event) => {
      if (event.target === modalBackdrop) {
        this.settingsOpen = false;
        modalBackdrop.classList.add('is-hidden');
      }
    });

    this.sessionDetailElement?.querySelectorAll<HTMLAnchorElement>('.markdown-link').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const url = link.getAttribute('href');
        if (!url) {
          return;
        }

        this.vscode.postMessage({
          protocolVersion: 1,
          type: 'openExternal',
          payload: { url }
        });
      });
    });

    const closeAutopilotPromptModal = () => {
      autopilotPromptModalBackdrop?.classList.add('is-hidden');
      if (newPromptTextarea) {
        newPromptTextarea.value = '';
      }
    };

    addPromptButton?.addEventListener('click', () => {
      autopilotPromptModalBackdrop?.classList.remove('is-hidden');
      newPromptTextarea?.focus();
    });

    autopilotPromptModalClose?.addEventListener('click', closeAutopilotPromptModal);
    autopilotPromptModalCancel?.addEventListener('click', closeAutopilotPromptModal);
    autopilotPromptModalBackdrop?.addEventListener('click', (event) => {
      if (event.target === autopilotPromptModalBackdrop) {
        closeAutopilotPromptModal();
      }
    });

    sendButton?.addEventListener('click', () => {
      if (!composerTextarea) {
        return;
      }

      const content = composerTextarea.value.trim();
      if (!content) {
        return;
      }

      this.vscode.postMessage({
        protocolVersion: 1,
        type: 'submitComposerInput',
        sessionId: this.session?.sessionId,
        payload: {
          content,
          attachments: currentDraftAttachments
        }
      });

      if (this.session?.pendingRequest) {
        this.beginProcessingIndicator(this.session.sessionId);
      }

      this.requestComposerRefocus();
      if (this.session) {
        this.draftComposerBySession.set(this.session.sessionId, '');
        this.draftAttachmentsBySession.set(this.session.sessionId, []);
      }
      composerTextarea.value = '';
      updateSendButtonState();
      // Collapse back to min-height after send and keep focus
      composerTextarea.style.height = 'auto';
      this.renderSession();
      composerTextarea.focus();
    });

    const handleImageFiles = (files: File[]) => {
      files
        .filter((file) => file.type.startsWith('image/'))
        .forEach((file) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result !== 'string') {
              return;
            }

            this.vscode.postMessage({
              protocolVersion: 1,
              type: 'saveImage',
              payload: {
                data: reader.result,
                mimeType: file.type || 'image/png'
              }
            });
          };
          reader.readAsDataURL(file);
        });
    };

    // Auto-expand textarea as text grows
    if (composerTextarea) {
      composerTextarea.addEventListener('input', () => {
        this.draftComposerBySession.set(this.session!.sessionId, composerTextarea.value);
        updateSendButtonState();
        composerTextarea.style.height = 'auto';
        composerTextarea.style.height = `${composerTextarea.scrollHeight}px`;
      });

      composerTextarea.addEventListener('paste', (event) => {
        const clipboardItems = Array.from(event.clipboardData?.items ?? []);
        const imageItems = clipboardItems.filter((item) => item.type.startsWith('image/'));
        if (imageItems.length === 0) {
          return;
        }

        event.preventDefault();
        handleImageFiles(
          imageItems
            .map((item) => item.getAsFile())
            .filter((file): file is File => file !== null)
        );
      });

      composerTextarea.addEventListener('dragover', (event) => {
        if (Array.from(event.dataTransfer?.items ?? []).some((item) => item.type.startsWith('image/'))) {
          event.preventDefault();
        }
      });

      composerTextarea.addEventListener('drop', (event) => {
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (!files.some((file) => file.type.startsWith('image/'))) {
          return;
        }

        event.preventDefault();
        handleImageFiles(files);
      });
    }

    attachImageButton?.addEventListener('click', () => {
      composerImageInput?.click();
    });

    attachFileButton?.addEventListener('click', () => {
      this.vscode.postMessage({
        protocolVersion: 1,
        type: 'addAttachment',
        payload: {}
      });
    });

    composerImageInput?.addEventListener('change', () => {
      handleImageFiles(Array.from(composerImageInput.files ?? []));

      composerImageInput.value = '';
    });

    attachmentRemoveButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (!this.session) {
          return;
        }

        const attachmentId = button.dataset.attachmentId;
        if (!attachmentId) {
          return;
        }

        const currentAttachments = this.draftAttachmentsBySession.get(this.session.sessionId) ?? [];
        const nextAttachments = currentAttachments.filter((attachment) => attachment.id !== attachmentId);
        this.draftAttachmentsBySession.set(this.session.sessionId, nextAttachments);
        this.vscode.postMessage({
          protocolVersion: 1,
          type: 'removeDraftAttachment',
          payload: {
            attachmentId,
            uri: button.dataset.attachmentUri,
            isTemporary: button.dataset.attachmentTemporary === 'true'
          }
        });
        this.requestComposerRefocus();
        this.renderSession();
      });
    });

    composerTextarea?.addEventListener('keydown', (event) => {
      const enterSends = this.globalSettings.enterSends;
      if (enterSends) {
        // Enter sends; Shift+Enter adds newline
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          sendButton?.click();
        }
      } else {
        // Ctrl/Cmd+Enter sends; plain Enter adds newline
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          sendButton?.click();
        }
      }
    });

    const postAutopilotToggle = (enabled: boolean) => {
      this.vscode.postMessage({
        protocolVersion: 1,
        type: 'toggleAutopilot',
        sessionId: this.session?.sessionId,
        payload: { enabled }
      });
    };

    autopilotCheckbox?.addEventListener('change', () => {
      postAutopilotToggle(autopilotCheckbox.checked);
    });

    // Keep autopilot-bar and modal checkboxes in sync
    autopilotBarCheckbox?.addEventListener('change', () => {
      if (autopilotCheckbox) {
        autopilotCheckbox.checked = autopilotBarCheckbox.checked;
      }
      postAutopilotToggle(autopilotBarCheckbox.checked);
    });

    autopilotMaxTurns?.addEventListener('change', () => {
      const maxTurns = Number.parseInt(autopilotMaxTurns.value, 10);
      if (Number.isNaN(maxTurns)) {
        return;
      }

      this.vscode.postMessage({
        protocolVersion: 1,
        type: 'setAutopilotMaxTurns',
        sessionId: this.session?.sessionId,
        payload: { maxTurns }
      });
    });

    const postSettingsUpdate = () => {
      const autopilotDelayMin = document.getElementById('autopilot-delay-min') as HTMLInputElement | null;
      const autopilotDelayMax = document.getElementById('autopilot-delay-max') as HTMLInputElement | null;
      this.vscode.postMessage({
        protocolVersion: 1,
        type: 'updateGlobalSettings',
        payload: {
          notificationSoundEnabled: !!soundCheckbox?.checked,
          autoRevealEnabled: !!autoRevealCheckbox?.checked,
          autoQueuePrompts: !!autoQueueCheckbox?.checked,
          enterSends: !!enterSendsCheckbox?.checked,
          autopilotPrompts: this.globalSettings.autopilotPrompts,
          autopilotDelayMinMs: Number(autopilotDelayMin?.value ?? this.globalSettings.autopilotDelayMinMs),
          autopilotDelayMaxMs: Number(autopilotDelayMax?.value ?? this.globalSettings.autopilotDelayMaxMs)
        }
      });
    };

    soundCheckbox?.addEventListener('change', postSettingsUpdate);
    autoRevealCheckbox?.addEventListener('change', postSettingsUpdate);
    autoQueueCheckbox?.addEventListener('change', postSettingsUpdate);
    enterSendsCheckbox?.addEventListener('change', postSettingsUpdate);

    const autopilotDelayMinEl = document.getElementById('autopilot-delay-min') as HTMLInputElement | null;
    const autopilotDelayMaxEl = document.getElementById('autopilot-delay-max') as HTMLInputElement | null;
    autopilotDelayMinEl?.addEventListener('change', postSettingsUpdate);
    autopilotDelayMaxEl?.addEventListener('change', postSettingsUpdate);

    // Autopilot prompt delete
    document.querySelectorAll<HTMLButtonElement>('.autopilot-prompt-delete').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.promptIndex);
        const newPrompts = [...this.globalSettings.autopilotPrompts];
        newPrompts.splice(idx, 1);
        this.vscode.postMessage({
          protocolVersion: 1,
          type: 'updateGlobalSettings',
          payload: { ...this.globalSettings, autopilotPrompts: newPrompts }
        });
      });
    });

    autopilotPromptModalSave?.addEventListener('click', () => {
      const text = newPromptTextarea?.value.trim();
      if (!text) {
        return;
      }
      const newPrompts = [...this.globalSettings.autopilotPrompts, text];
      this.vscode.postMessage({
        protocolVersion: 1,
        type: 'updateGlobalSettings',
        payload: { ...this.globalSettings, autopilotPrompts: newPrompts }
      });
      closeAutopilotPromptModal();
    });

    clearQueueButton?.addEventListener('click', () => {
      this.vscode.postMessage({
        protocolVersion: 1,
        type: 'clearQueue',
        sessionId: this.session?.sessionId,
        payload: {}
      });
    });

    queueItems.forEach((item) => {
      item.addEventListener('dragstart', () => {
        this.draggedQueuedPromptId = item.dataset.itemId ?? null;
      });

      item.addEventListener('dragend', () => {
        this.draggedQueuedPromptId = null;
        queueItems.forEach((item) => item.classList.remove('is-drag-target'));
      });

      item.addEventListener('dragover', (event) => {
        event.preventDefault();
        item.classList.add('is-drag-target');
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('is-drag-target');
      });

      item.addEventListener('drop', (event) => {
        event.preventDefault();
        item.classList.remove('is-drag-target');

        const targetItemId = item.dataset.itemId;
        if (!this.draggedQueuedPromptId || !targetItemId || this.draggedQueuedPromptId === targetItemId) {
          return;
        }

        this.vscode.postMessage({
          protocolVersion: 1,
          type: 'reorderQueuedPrompt',
          sessionId: this.session?.sessionId,
          payload: {
            itemId: this.draggedQueuedPromptId,
            targetItemId
          }
        });
      });
    });

    autopilotPromptItems.forEach((item) => {
      item.addEventListener('dragstart', () => {
        this.draggedAutopilotPromptIndex = Number(item.dataset.promptIndex);
      });

      item.addEventListener('dragend', () => {
        this.draggedAutopilotPromptIndex = null;
        autopilotPromptItems.forEach((promptItem) => promptItem.classList.remove('is-drag-target'));
      });

      item.addEventListener('dragover', (event) => {
        event.preventDefault();
        item.classList.add('is-drag-target');
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('is-drag-target');
      });

      item.addEventListener('drop', (event) => {
        event.preventDefault();
        item.classList.remove('is-drag-target');

        const targetIndex = Number(item.dataset.promptIndex);
        if (
          this.draggedAutopilotPromptIndex === null ||
          Number.isNaN(targetIndex) ||
          this.draggedAutopilotPromptIndex === targetIndex
        ) {
          return;
        }

        const nextPrompts = [...this.globalSettings.autopilotPrompts];
        const [movedPrompt] = nextPrompts.splice(this.draggedAutopilotPromptIndex, 1);
        nextPrompts.splice(targetIndex, 0, movedPrompt);

        this.vscode.postMessage({
          protocolVersion: 1,
          type: 'updateGlobalSettings',
          payload: { ...this.globalSettings, autopilotPrompts: nextPrompts }
        });
      });
    });

    queueEditButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const itemId = button.dataset.itemId;
        if (!itemId) {
          return;
        }

        const queueItem = document.querySelector<HTMLElement>(`.queue-stack-item[data-item-id="${itemId}"]`);
        const textElement = queueItem?.querySelector<HTMLElement>('.queue-stack-item-text');
        const editor = queueItem?.querySelector<HTMLTextAreaElement>('.queue-inline-editor');
        const saveButton = queueItem?.querySelector<HTMLButtonElement>('.queue-save-button');
        const cancelButton = queueItem?.querySelector<HTMLButtonElement>('.queue-cancel-button');
        if (!queueItem || !textElement || !editor || !saveButton || !cancelButton) {
          return;
        }

        textElement.classList.add('is-hidden');
        editor.classList.remove('is-hidden');
        button.classList.add('is-hidden');
        saveButton.classList.remove('is-hidden');
        cancelButton.classList.remove('is-hidden');
        editor.focus();
        editor.setSelectionRange(editor.value.length, editor.value.length);
      });
    });

    queueDeleteButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const itemId = button.dataset.itemId;
        if (!itemId) {
          return;
        }

        this.vscode.postMessage({
          protocolVersion: 1,
          type: 'removeQueuedPrompt',
          sessionId: this.session?.sessionId,
          payload: {
            itemId
          }
        });
      });
    });

    queueSaveButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const itemId = button.dataset.itemId;
        if (!itemId) {
          return;
        }

        const queueItem = document.querySelector<HTMLElement>(`.queue-stack-item[data-item-id="${itemId}"]`);
        const textElement = queueItem?.querySelector<HTMLElement>('.queue-stack-item-text');
        const editor = queueItem?.querySelector<HTMLTextAreaElement>('.queue-inline-editor');
        const editButton = queueItem?.querySelector<HTMLButtonElement>('.queue-edit-button');
        const cancelButton = queueItem?.querySelector<HTMLButtonElement>('.queue-cancel-button');
        if (!queueItem || !textElement || !editor || !editButton || !cancelButton) {
          return;
        }

        const content = editor.value.trim();
        if (!content) {
          return;
        }

        this.vscode.postMessage({
          protocolVersion: 1,
          type: 'updateQueuedPrompt',
          sessionId: this.session?.sessionId,
          payload: {
            itemId,
            content
          }
        });

        textElement.classList.remove('is-hidden');
        editor.classList.add('is-hidden');
        editButton.classList.remove('is-hidden');
        button.classList.add('is-hidden');
        cancelButton.classList.add('is-hidden');
      });
    });

    queueCancelButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const itemId = button.dataset.itemId;
        if (!itemId) {
          return;
        }

        const item = this.session?.queuedPrompts.find((queuedPrompt) => queuedPrompt.itemId === itemId);
        const queueItem = document.querySelector<HTMLElement>(`.queue-stack-item[data-item-id="${itemId}"]`);
        const textElement = queueItem?.querySelector<HTMLElement>('.queue-stack-item-text');
        const editor = queueItem?.querySelector<HTMLTextAreaElement>('.queue-inline-editor');
        const editButton = queueItem?.querySelector<HTMLButtonElement>('.queue-edit-button');
        const saveButton = queueItem?.querySelector<HTMLButtonElement>('.queue-save-button');
        if (!queueItem || !textElement || !editor || !editButton || !saveButton || !item) {
          return;
        }

        editor.value = item.content;
        textElement.classList.remove('is-hidden');
        editor.classList.add('is-hidden');
        editButton.classList.remove('is-hidden');
        saveButton.classList.add('is-hidden');
        button.classList.add('is-hidden');
      });
    });
  }

  private bindInlineErrorEvents(): void {
    const dismissButton = document.getElementById('inline-error-dismiss') as HTMLButtonElement | null;
    dismissButton?.addEventListener('click', () => {
      this.inlineErrorMessage = null;
      this.renderSession();
    });
  }

  private openNewSession(): void {
    this.vscode.postMessage({
      protocolVersion: 1,
      type: 'newCopilotSession',
      payload: {}
    });
  }

  private reconcileComposerFocus(nextSession: SessionSnapshot | null): void {
    const activeElement = document.activeElement as HTMLElement | null;
    const composerWasFocused = activeElement?.id === 'composer-textarea';

    if (composerWasFocused || this.shouldAutoFocusComposer(nextSession)) {
      this.requestComposerRefocus();
    }
  }

  private shouldAutoFocusComposer(nextSession: SessionSnapshot | null): boolean {
    if (this.viewMode === 'global') {
      return false;
    }

    if (!nextSession?.pendingRequest) {
      return false;
    }

    if (!this.session || this.session.sessionId !== nextSession.sessionId) {
      return true;
    }

    const previousPendingRequestId = this.session.pendingRequest?.requestId;
    return previousPendingRequestId !== nextSession.pendingRequest.requestId;
  }

  private shouldShowProcessingIndicator(session: SessionSnapshot): boolean {
    return this.processingResponseBySession.has(session.sessionId);
  }

  private renderGlobalViewToggle(): void {
    const pendingCount = this.sessions.filter((session) => session.hasPendingRequest).length;
    this.globalViewToggleButton?.classList.toggle('is-active', this.viewMode === 'global');
    this.globalViewToggleButton?.setAttribute(
      'title',
      pendingCount > 0 ? `Global pending view (${pendingCount})` : 'Global pending view'
    );

    if (!this.globalViewCountElement) {
      return;
    }

    if (pendingCount === 0) {
      this.globalViewCountElement.classList.add('is-hidden');
      this.globalViewCountElement.textContent = '0';
      return;
    }

    this.globalViewCountElement.classList.remove('is-hidden');
    this.globalViewCountElement.textContent = String(pendingCount);
  }

  private applySidebarWidth(): void {
    const clampedWidth = this.clampSidebarWidth(this.sidebarWidth);
    this.sidebarWidth = clampedWidth;
    this.appShell?.style.setProperty('--session-sidebar-width', `${clampedWidth}px`);
  }

  private clampSidebarWidth(width: number): number {
    const containerWidth = this.appShell?.getBoundingClientRect().width ?? window.innerWidth;
    const maxWidth = Math.max(230, Math.min(420, containerWidth - 220));
    return Math.max(230, Math.min(width, maxWidth));
  }

  private beginProcessingIndicator(sessionId: string): void {
    const existingTimeout = this.processingResponseTimeouts.get(sessionId);
    if (existingTimeout !== undefined) {
      window.clearTimeout(existingTimeout);
    }

    this.processingResponseBySession.set(sessionId, {
      baselineMessageCount: this.session?.chatMessages.length ?? 0,
      startedAtMs: Date.now()
    });
    const timeoutHandle = window.setTimeout(() => {
      this.vscode.postMessage({
        protocolVersion: 1,
        type: 'markSessionInterrupted',
        sessionId,
        payload: {}
      });
      this.clearProcessingIndicator(sessionId);
      if (this.session?.sessionId === sessionId) {
        this.renderSession();
      }
    }, 15000);

    this.processingResponseTimeouts.set(sessionId, timeoutHandle);
  }

  private clearProcessingIndicator(sessionId: string): void {
    this.processingResponseBySession.delete(sessionId);
    const existingTimeout = this.processingResponseTimeouts.get(sessionId);
    if (existingTimeout !== undefined) {
      window.clearTimeout(existingTimeout);
      this.processingResponseTimeouts.delete(sessionId);
    }
  }

  private syncProcessingIndicator(session: SessionSnapshot | null): void {
    if (!session) {
      return;
    }

    const state = this.processingResponseBySession.get(session.sessionId);
    if (!state) {
      return;
    }

    const lastMessageRole = session.chatMessages.at(-1)?.role;
    const hasNewMessages = session.chatMessages.length > state.baselineMessageCount;

    if (session.pendingRequest || session.status === 'interrupted') {
      this.clearProcessingIndicator(session.sessionId);
      return;
    }

    if (hasNewMessages && (lastMessageRole === 'assistant' || lastMessageRole === 'system')) {
      this.clearProcessingIndicator(session.sessionId);
    }
  }

  private scrollTranscriptToBottom(): void {
    const transcript = document.querySelector('.chat-transcript');
    if (transcript) {
      transcript.scrollTop = transcript.scrollHeight;
    }
  }

  private openSettingsModal(): void {
    const backdrop = document.getElementById('settings-modal-backdrop');
    if (backdrop) {
      this.settingsOpen = true;
      backdrop.classList.remove('is-hidden');
    }
  }

  private refreshIcons(): void {
    document.querySelectorAll<HTMLElement>('[data-lucide]').forEach((placeholder) => {
      const iconName = placeholder.dataset.lucide as keyof typeof LUCIDE_ICONS | undefined;
      if (!iconName) {
        return;
      }

      const iconDefinition = LUCIDE_ICONS[iconName];
      if (!iconDefinition) {
        return;
      }

      const svg = createElement(iconDefinition, {
        width: '14',
        height: '14',
        'stroke-width': '1.8'
      });

      placeholder.replaceWith(svg);
    });
  }

  private requestComposerRefocus(): void {
    this.composerRefocusAttemptsRemaining = Math.max(this.composerRefocusAttemptsRemaining, 3);
  }
}
