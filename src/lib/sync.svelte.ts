import type { Exercise, WorkoutEntry, Settings, SyncConfig } from './types';
import { showToast } from './toasts.svelte';
import { IS_TAURI } from './platform';

const WEB_SYNC_CONFIG_KEY = 'theprocesstracker-sync-config';

export async function loadSyncConfig(): Promise<SyncConfig | null> {
  try {
    if (IS_TAURI) {
      const { exists, readTextFile } = await import('@tauri-apps/plugin-fs');
      const { appDataDir, join } = await import('@tauri-apps/api/path');
      const path = await join(await appDataDir(), 'config.json');
      if (await exists(path)) {
        const data = JSON.parse(await readTextFile(path));
        if (data?.serverUrl && data?.guid && data?.secret) {
          return { lastSyncedAt: null, ...data } as SyncConfig;
        }
      }
    } else {
      const raw = localStorage.getItem(WEB_SYNC_CONFIG_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data?.serverUrl && data?.guid && data?.secret) {
          return { lastSyncedAt: null, ...data } as SyncConfig;
        }
      }
    }
  } catch {}
  return null;
}

export async function saveSyncConfig(config: SyncConfig | null): Promise<void> {
  if (IS_TAURI) {
    const { mkdir } = await import('@tauri-apps/plugin-fs');
    const { invoke } = await import('@tauri-apps/api/core');
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    const dir = await appDataDir();
    await mkdir(dir, { recursive: true });
    await invoke('write_secret_file', {
      path: await join(dir, 'config.json'),
      content: JSON.stringify(config, null, 2),
    });
  } else {
    if (config === null) {
      localStorage.removeItem(WEB_SYNC_CONFIG_KEY);
    } else {
      localStorage.setItem(WEB_SYNC_CONFIG_KEY, JSON.stringify(config));
    }
  }
}

export interface SyncDataRef {
  exercises: Exercise[];
  entries: WorkoutEntry[];
  settings: Settings;
  saveData(): void;
}

let _appVersion: string | null = null;
async function appVersion(): Promise<string> {
  if (!_appVersion) {
    if (IS_TAURI) {
      const { getVersion } = await import('@tauri-apps/api/app');
      _appVersion = await getVersion();
    } else {
      _appVersion = 'web';
    }
  }
  return _appVersion;
}

const PERIODIC_SYNC_INTERVAL_MS = 10 * 60 * 1000;

export class SyncManager {
  syncConfig = $state<SyncConfig | null>(null);
  syncStatus = $state<'idle' | 'syncing' | 'error'>('idle');

  private _retryCount = 0;
  private _retryTimer: ReturnType<typeof setTimeout> | null = null;
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _periodicTimer: ReturnType<typeof setInterval> | null = null;
  private _pendingSync = false;
  private data: SyncDataRef;

  constructor(data: SyncDataRef) {
    this.data = data;
  }

  startPeriodicSync() {
    this._stopPeriodicSync();
    this._periodicTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && this.syncConfig) {
        this.syncToServer();
      }
    }, PERIODIC_SYNC_INTERVAL_MS);
  }

  private _stopPeriodicSync() {
    if (this._periodicTimer) { clearInterval(this._periodicTimer); this._periodicTimer = null; }
  }

  debouncedSync() {
    if (!this.syncConfig) return;
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this.syncToServer(), 1500);
  }

  manualSync() {
    this._retryCount = 0;
    if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
    if (this._debounceTimer) { clearTimeout(this._debounceTimer); this._debounceTimer = null; }
    this.syncToServer();
  }

  private _scheduleRetry() {
    if (this._retryCount >= 5) return;
    if (this._retryTimer) clearTimeout(this._retryTimer);
    this._retryTimer = setTimeout(() => {
      this._retryCount++;
      this.syncToServer();
    }, 5 * 60 * 1000);
  }

  async syncToServer() {
    if (!this.syncConfig) return;
    if (this.syncStatus === 'syncing') { this._pendingSync = true; return; }

    this.syncStatus = 'syncing';
    this._pendingSync = false;

    const { serverUrl, guid, secret, lastSyncedAt } = this.syncConfig;
    const since = lastSyncedAt;
    const changedExercises = since ? this.data.exercises.filter(e => e.updatedAt > since) : this.data.exercises;
    const changedEntries = since ? this.data.entries.filter(e => e.updatedAt > since) : this.data.entries;
    const settingsChanged = !since || this.data.settings.updatedAt > since;

    try {
      const res = await fetch(`${serverUrl}/api/v1/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${guid}.${secret}`,
        },
        body: JSON.stringify({
          clientVersion: await appVersion(),
          lastSyncedAt: since,
          changes: {
            exercises: changedExercises,
            entries: changedEntries,
            settings: settingsChanged ? this.data.settings : null,
          },
        }),
      });

      if (res.status === 401 || res.status === 403) throw new Error('Sync credentials rejected — try relinking your account.');
      if (res.status >= 500) throw new Error('The sync server ran into a problem.');
      if (!res.ok) throw new Error('Sync request failed.');

      if (!this.syncConfig) { this.syncStatus = 'idle'; return; }
      const { syncedAt, changes } = await res.json();

      for (const se of (changes.exercises ?? []) as Exercise[]) {
        const idx = this.data.exercises.findIndex(e => e.id === se.id);
        if (idx === -1) this.data.exercises.push(se);
        else if (se.updatedAt > this.data.exercises[idx].updatedAt) this.data.exercises[idx] = se;
      }
      for (const se of (changes.entries ?? []) as WorkoutEntry[]) {
        const idx = this.data.entries.findIndex(e => e.id === se.id);
        if (idx === -1) this.data.entries.push(se);
        else if (se.updatedAt > this.data.entries[idx].updatedAt) this.data.entries[idx] = se;
      }
      if (changes.settings && changes.settings.updatedAt > this.data.settings.updatedAt) {
        Object.assign(this.data.settings, changes.settings);
      }

      const updated: SyncConfig = { ...this.syncConfig, lastSyncedAt: syncedAt };
      this.syncConfig = updated;
      await saveSyncConfig(updated);
      this.data.saveData();

      this.syncStatus = 'idle';
      this._retryCount = 0;
      if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
      if (this._pendingSync) this.syncToServer();

    } catch (e: unknown) {
      if (!this.syncConfig) { this.syncStatus = 'idle'; return; }
      this.syncStatus = 'error';
      const msg = e instanceof TypeError ? "Couldn't reach the sync server — will retry."
        : e instanceof Error ? e.message
        : 'Sync failed — will retry.';
      showToast(msg);
      this._scheduleRetry();
    }
  }

  async createAccount(serverUrl: string): Promise<void> {
    const url = serverUrl.replace(/\/$/, '');
    let res: Response;
    try {
      res = await fetch(`${url}/api/v1/account/create`, { method: 'POST' });
    } catch {
      throw new Error("Couldn't connect to the server — check the server URL.");
    }
    if (res.status >= 500) throw new Error('The server ran into a problem — try again later.');
    if (!res.ok) throw new Error('Account creation failed — try again later.');
    const { guid, secret } = await res.json();
    const config: SyncConfig = { serverUrl: url, guid, secret, lastSyncedAt: null };
    await saveSyncConfig(config);
    this.syncConfig = config;
    this.syncToServer();
    this.startPeriodicSync();
  }

  async linkAccount(serverUrl: string, guid: string, secret: string): Promise<void> {
    const url = serverUrl.replace(/\/$/, '');
    let res: Response;
    try {
      res = await fetch(`${url}/api/v1/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${guid}.${secret}`,
        },
        body: JSON.stringify({ clientVersion: await appVersion(), lastSyncedAt: null, changes: { exercises: [], entries: [], settings: null } }),
      });
    } catch {
      throw new Error("Couldn't connect to the server — check the server URL.");
    }
    if (res.status === 401 || res.status === 403) throw new Error('Invalid account credentials — check your GUID and secret.');
    if (res.status >= 500) throw new Error('The server ran into a problem — try again later.');
    if (!res.ok) throw new Error('Link failed — try again later.');
    const config: SyncConfig = { serverUrl: url, guid, secret, lastSyncedAt: null };
    await saveSyncConfig(config);
    this.syncConfig = config;
    this.syncToServer();
    this.startPeriodicSync();
  }

  async unlinkAccount(): Promise<void> {
    await saveSyncConfig(null);
    this.syncConfig = null;
    this.syncStatus = 'idle';
    this._retryCount = 0;
    if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
    if (this._debounceTimer) { clearTimeout(this._debounceTimer); this._debounceTimer = null; }
    this._stopPeriodicSync();
  }

  async deleteAccount(): Promise<void> {
    if (!this.syncConfig) throw new Error('No account to delete.');
    const { serverUrl, guid, secret } = this.syncConfig;
    let res: Response;
    try {
      res = await fetch(`${serverUrl}/api/v1/account`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${guid}.${secret}` },
      });
    } catch {
      throw new Error("Couldn't connect to the server.");
    }
    if (res.status === 401 || res.status === 403) throw new Error('Credentials rejected — account may already be deleted.');
    if (res.status >= 500) throw new Error('The server ran into a problem — try again later.');
    if (!res.ok) throw new Error('Delete failed — try again later.');
    await this.unlinkAccount();
  }
}
