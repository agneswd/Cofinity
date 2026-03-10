import type * as vscode from 'vscode';

export interface GlobalSettings {
  notificationSoundEnabled: boolean;
  autoOpenView: 'off' | 'session' | 'global';
  autoQueuePrompts: boolean;
  enterSends: boolean;
  autopilotPrompts: string[];
  autopilotDelayMinMs: number;
  autopilotDelayMaxMs: number;
}

const SETTINGS_KEY = 'cofinity.globalSettings';

const DEFAULT_AUTOPILOT_PROMPTS = [
  'Continue with your best judgment. You are in autopilot mode.'
];

type StoredGlobalSettings = Partial<GlobalSettings> & {
  autoRevealEnabled?: boolean;
};

const DEFAULTS: GlobalSettings = {
  notificationSoundEnabled: true,
  autoOpenView: 'session',
  autoQueuePrompts: true,
  enterSends: false,
  autopilotPrompts: DEFAULT_AUTOPILOT_PROMPTS,
  autopilotDelayMinMs: 2000,
  autopilotDelayMaxMs: 5000
};

export class GlobalSettingsManager {
  constructor(private readonly globalState: vscode.Memento) {}

  public get(): GlobalSettings {
    const stored = this.globalState.get<StoredGlobalSettings>(SETTINGS_KEY, {});
    const autoOpenView = stored.autoOpenView ?? (stored.autoRevealEnabled === false ? 'off' : 'session');

    return {
      ...DEFAULTS,
      ...stored,
      autoOpenView,
      autopilotPrompts:
        Array.isArray(stored.autopilotPrompts) && stored.autopilotPrompts.length > 0
          ? stored.autopilotPrompts
          : DEFAULT_AUTOPILOT_PROMPTS
    };
  }

  public async update(patch: Partial<GlobalSettings>): Promise<void> {
    const current = this.get();
    await this.globalState.update(SETTINGS_KEY, { ...current, ...patch });
  }
}
