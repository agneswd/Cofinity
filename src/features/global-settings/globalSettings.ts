import type * as vscode from 'vscode';

export interface GlobalSettings {
  notificationSoundEnabled: boolean;
  autoRevealEnabled: boolean;
  autoQueuePrompts: boolean;
  enterSends: boolean;
}

const SETTINGS_KEY = 'cofinity.globalSettings';

const DEFAULTS: GlobalSettings = {
  notificationSoundEnabled: true,
  autoRevealEnabled: true,
  autoQueuePrompts: true,
  enterSends: false
};

export class GlobalSettingsManager {
  constructor(private readonly globalState: vscode.Memento) {}

  public get(): GlobalSettings {
    return { ...DEFAULTS, ...this.globalState.get<Partial<GlobalSettings>>(SETTINGS_KEY, {}) };
  }

  public async update(patch: Partial<GlobalSettings>): Promise<void> {
    const current = this.get();
    await this.globalState.update(SETTINGS_KEY, { ...current, ...patch });
  }
}
