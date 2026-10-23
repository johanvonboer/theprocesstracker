import type { Exercise, WorkoutEntry, Settings, SyncConfig, WorkoutSchema } from './types';
import { showToast } from './toasts.svelte';
import { apiFetch, ApiError, NetworkError } from './api';
import { version } from '../../package.json';

const SYNC_CONFIG_KEY = 'theprocesstracker-sync-config';

export function loadSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(SYNC_CONFIG_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.account?.guid && data.account.username) {
      return {
        account: data.account,
        legacy: null,
        sessionExpired: !!data.sessionExpired,
        lastSyncedAt: data.lastSyncedAt ?? null,
      };
    }
    // Pre-account shape { serverUrl, guid, secret, lastSyncedAt } — and the new
    // shape's legacy-only form. Either way it keeps syncing with the old token
    // until the user upgrades it to an account.
    const legacy = data?.legacy ?? data;
    if (legacy?.guid && legacy?.secret) {
      return {
        account: null,
        legacy: { guid: legacy.guid, secret: legacy.secret },
        sessionExpired: false,
        lastSyncedAt: data.lastSyncedAt ?? null,
      };
    }
  } catch {}
  return null;
}

function saveSyncConfig(config: SyncConfig | null) {
  try {
    if (config === null) localStorage.removeItem(SYNC_CONFIG_KEY);
    else localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config));
  } catch {}
}

export interface SyncDataRef {
  exercises: Exercise[];
  entries: WorkoutEntry[];
  schemas: WorkoutSchema[];
  settings: Settings;
  saveData(): void;
}

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

const PERIODIC_SYNC_INTERVAL_MS = 10 * 60 * 1000;

export class SyncManager {
  syncConfig = $state<SyncConfig | null>(null);
  syncStatus = $state<SyncStatus>('idle');

  private _retryCount = 0;
  private _retryTimer: ReturnType<typeof setTimeout> | null = null;
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _periodicTimer: ReturnType<typeof setInterval> | null = null;
  private _inFlight: Promise<boolean> | null = null;
  private _followUp: Promise<boolean> | null = null;
  private data: SyncDataRef;

  constructor(data: SyncDataRef) {
    this.data = data;
    // Coming back online is the moment to push whatever was logged offline.
    window.addEventListener('online', () => this.manualSync());
    window.addEventListener('offline', () => {
      if (this.syncConfig) this.syncStatus = 'offline';
    });
  }

  /** Whether syncing is currently possible (an account or legacy token, and a live session). */
  get canSync(): boolean {
    const c = this.syncConfig;
    return !!c && (!!c.legacy || (!!c.account && !c.sessionExpired));
  }

  /** Replaces and persists the config, starting or stopping background sync to match. */
  setConfig(config: SyncConfig | null) {
    this.syncConfig = config;
    saveSyncConfig(config);
    this._clearTimers();
    this._retryCount = 0;
    this.syncStatus = 'idle';
    if (this.canSync) this.startPeriodicSync();
  }

  /** Persists a change made to the current config in place. */
  persistConfig() {
    saveSyncConfig(this.syncConfig ? $state.snapshot(this.syncConfig) : null);
  }

  /**
   * The server no longer accepts the session. The data is kept — it still
   * belongs to this account — and syncing pauses until a re-login.
   */
  markSessionExpired() {
    const c = this.syncConfig;
    if (!c?.account || c.sessionExpired) return;
    c.sessionExpired = true;
    this.persistConfig();
    this._clearTimers();
    this.syncStatus = 'error';
    showToast('Your login has expired — log in again to resume syncing.');
  }

  startPeriodicSync() {
    this._stopPeriodicSync();
    this._periodicTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && this.canSync) {
        this.syncToServer();
      }
    }, PERIODIC_SYNC_INTERVAL_MS);
  }

  private _stopPeriodicSync() {
    if (this._periodicTimer) { clearInterval(this._periodicTimer); this._periodicTimer = null; }
  }

  private _clearTimers() {
    if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
    if (this._debounceTimer) { clearTimeout(this._debounceTimer); this._debounceTimer = null; }
    this._stopPeriodicSync();
  }

  debouncedSync() {
    if (!this.canSync) return;
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this.syncToServer(), 1500);
  }

  manualSync() {
    this._retryCount = 0;
    if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
    if (this._debounceTimer) { clearTimeout(this._debounceTimer); this._debounceTimer = null; }
    return this.syncToServer();
  }

  private _scheduleRetry() {
    if (this._retryCount >= 5) return;
    if (this._retryTimer) clearTimeout(this._retryTimer);
    this._retryTimer = setTimeout(() => {
      this._retryCount++;
      this.syncToServer();
    }, 5 * 60 * 1000);
  }

  /** True when something changed locally since the last successful sync. */
  get hasUnsyncedChanges(): boolean {
    const since = this.syncConfig?.lastSyncedAt;
    if (!since) return true;
    return this.data.exercises.some(e => e.updatedAt > since)
      || this.data.entries.some(e => e.updatedAt > since)
      || this.data.schemas.some(s => s.updatedAt > since)
      || this.data.settings.updatedAt > since;
  }

  /**
   * Sends local changes and merges the server's. Resolves true on success.
   * A call made while a sync is running is queued behind it, and resolves with
   * the outcome of that follow-up sync.
   */
  syncToServer(): Promise<boolean> {
    if (!this.canSync) return Promise.resolve(false);
    if (this._inFlight) {
      // Every call made during a sync shares one follow-up round.
      this._followUp ??= this._inFlight.then(() => {
        this._followUp = null;
        return this.syncToServer();
      });
      return this._followUp;
    }
    this._inFlight = this._sync().finally(() => { this._inFlight = null; });
    return this._inFlight;
  }

  private async _sync(): Promise<boolean> {
    const config = this.syncConfig!;
    if (!navigator.onLine) {
      this.syncStatus = 'offline';
      return false;
    }
    this.syncStatus = 'syncing';

    const since = config.lastSyncedAt;
    const changedExercises = since ? this.data.exercises.filter(e => e.updatedAt > since) : this.data.exercises;
    const changedEntries = since ? this.data.entries.filter(e => e.updatedAt > since) : this.data.entries;
    const changedSchemas = since ? this.data.schemas.filter(s => s.updatedAt > since) : this.data.schemas;
    const settingsChanged = !since || this.data.settings.updatedAt > since;

    try {
      const { syncedAt, changes } = await apiFetch('/api/v1/sync', {
        legacy: config.account ? null : config.legacy,
        body: {
          clientVersion: version,
          lastSyncedAt: since,
          changes: {
            exercises: changedExercises,
            entries: changedEntries,
            schemas: changedSchemas,
            settings: settingsChanged ? this.data.settings : null,
          },
        },
      });

      // Logged out (or switched user) while the request was in flight.
      if (this.syncConfig !== config) { this.syncStatus = 'idle'; return false; }

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
      for (const ss of (changes.schemas ?? []) as WorkoutSchema[]) {
        const idx = this.data.schemas.findIndex(s => s.id === ss.id);
        if (idx === -1) this.data.schemas.push(ss);
        else if (ss.updatedAt > this.data.schemas[idx].updatedAt) this.data.schemas[idx] = ss;
      }
      if (changes.settings && changes.settings.updatedAt > this.data.settings.updatedAt) {
        Object.assign(this.data.settings, changes.settings);
      }

      config.lastSyncedAt = syncedAt;
      this.persistConfig();
      this.data.saveData();

      this.syncStatus = 'idle';
      this._retryCount = 0;
      if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
      return true;

    } catch (e: unknown) {
      if (this.syncConfig !== config) { this.syncStatus = 'idle'; return false; }

      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        this.syncStatus = 'error';
        if (config.account) {
          this.markSessionExpired();
        } else {
          showToast('Sync credentials rejected — this sync account may have been deleted.');
        }
        return false;
      }

      if (e instanceof NetworkError && !navigator.onLine) {
        // The 'online' listener resumes syncing; no need to nag or retry.
        this.syncStatus = 'offline';
        return false;
      }

      this.syncStatus = 'error';
      showToast(e instanceof NetworkError ? "Couldn't reach the sync server — will retry."
        : e instanceof Error ? e.message
        : 'Sync failed — will retry.');
      this._scheduleRetry();
      return false;
    }
  }
}
