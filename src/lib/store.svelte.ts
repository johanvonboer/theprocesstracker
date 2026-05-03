import { exists, mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/core';
import type { Exercise, WorkoutEntry, Settings, SyncConfig } from './types';
import { DEFAULT_SETTINGS } from './types';
import { showToast } from './toasts.svelte';

const EPOCH = new Date(0).toISOString();

function now(): string {
  return new Date().toISOString();
}

async function getDir(): Promise<string> {
  return appDataDir();
}

async function getPath(): Promise<string> {
  return join(await getDir(), 'theprocesstracker.json');
}

async function saveData(exercises: Exercise[], entries: WorkoutEntry[], settings: Settings) {
  const dir = await getDir();
  await mkdir(dir, { recursive: true });
  await writeTextFile(await getPath(), JSON.stringify({ exercises, entries, settings }, null, 2));
}

async function getSyncConfigPath(): Promise<string> {
  return join(await getDir(), 'config.json');
}

async function loadSyncConfig(): Promise<SyncConfig | null> {
  try {
    const path = await getSyncConfigPath();
    if (await exists(path)) {
      const data = JSON.parse(await readTextFile(path));
      if (data?.serverUrl && data?.guid && data?.secret) {
        return { lastSyncedAt: null, ...data } as SyncConfig;
      }
    }
  } catch {}
  return null;
}

async function saveSyncConfig(config: SyncConfig | null): Promise<void> {
  const dir = await getDir();
  await mkdir(dir, { recursive: true });
  await invoke('write_secret_file', {
    path: await getSyncConfigPath(),
    content: JSON.stringify(config, null, 2),
  });
}

async function loadData(): Promise<{ exercises: Exercise[]; entries: WorkoutEntry[]; settings: Settings }> {
  try {
    const path = await getPath();
    if (await exists(path)) {
      const d = JSON.parse(await readTextFile(path));
      return {
        exercises: (d.exercises ?? []).map((e: any) => ({
          ...e,
          updatedAt: e.updatedAt ?? EPOCH,
          deletedAt: e.deletedAt ?? null,
        })),
        entries: (d.entries ?? []).map((e: any) => ({
          ...e,
          updatedAt: e.updatedAt ?? EPOCH,
          deletedAt: e.deletedAt ?? null,
        })),
        settings: {
          ...DEFAULT_SETTINGS,
          ...d.settings,
          updatedAt: d.settings?.updatedAt ?? EPOCH,
        },
      };
    }
  } catch {}
  return { exercises: [], entries: [], settings: { ...DEFAULT_SETTINGS } };
}

class WorkoutStore {
  exercises = $state<Exercise[]>([]);
  entries = $state<WorkoutEntry[]>([]);
  settings = $state<Settings>({ ...DEFAULT_SETTINGS });
  syncConfig = $state<SyncConfig | null>(null);
  syncStatus = $state<'idle' | 'syncing' | 'error'>('idle');
  ready = $state(false);

  private _retryCount = 0;
  private _retryTimer: ReturnType<typeof setTimeout> | null = null;
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _pendingSync = false;

  constructor() {
    Promise.all([loadData(), loadSyncConfig()]).then(([d, sync]) => {
      this.exercises = d.exercises;
      this.entries = d.entries;
      this.settings = d.settings;
      this.syncConfig = sync;
      this.ready = true;
      if (sync) this.syncToServer();
    });
  }

  get activeExercises(): Exercise[] {
    return this.exercises.filter(e => !e.deletedAt);
  }

  private _saveData() {
    saveData(this.exercises, this.entries, this.settings);
  }

  private save() {
    this._saveData();
    if (this.syncConfig) this._debouncedSync();
  }

  private _debouncedSync() {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this.syncToServer(), 1500);
  }

  private _scheduleRetry() {
    if (this._retryCount >= 5) return;
    if (this._retryTimer) clearTimeout(this._retryTimer);
    this._retryTimer = setTimeout(() => {
      this._retryCount++;
      this.syncToServer();
    }, 5 * 60 * 1000);
  }

  manualSync() {
    this._retryCount = 0;
    if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
    if (this._debounceTimer) { clearTimeout(this._debounceTimer); this._debounceTimer = null; }
    this.syncToServer();
  }

  async syncToServer() {
    if (!this.syncConfig) return;
    if (this.syncStatus === 'syncing') { this._pendingSync = true; return; }

    this.syncStatus = 'syncing';
    this._pendingSync = false;

    const { serverUrl, guid, secret, lastSyncedAt } = this.syncConfig;
    const since = lastSyncedAt;
    const changedExercises = since ? this.exercises.filter(e => e.updatedAt > since) : this.exercises;
    const changedEntries = since ? this.entries.filter(e => e.updatedAt > since) : this.entries;
    const settingsChanged = !since || this.settings.updatedAt > since;

    try {
      const res = await fetch(`${serverUrl}/api/v1/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${guid}.${secret}`,
        },
        body: JSON.stringify({
          lastSyncedAt: since,
          changes: {
            exercises: changedExercises,
            entries: changedEntries,
            settings: settingsChanged ? this.settings : null,
          },
        }),
      });

      if (res.status === 401 || res.status === 403) throw new Error('Sync credentials rejected — try relinking your account.');
      if (res.status >= 500) throw new Error('The sync server ran into a problem.');
      if (!res.ok) throw new Error('Sync request failed.');

      if (!this.syncConfig) { this.syncStatus = 'idle'; return; }
      const { syncedAt, changes } = await res.json();

      for (const se of (changes.exercises ?? []) as Exercise[]) {
        const idx = this.exercises.findIndex(e => e.id === se.id);
        if (idx === -1) this.exercises.push(se);
        else if (se.updatedAt > this.exercises[idx].updatedAt) this.exercises[idx] = se;
      }
      for (const se of (changes.entries ?? []) as WorkoutEntry[]) {
        const idx = this.entries.findIndex(e => e.id === se.id);
        if (idx === -1) this.entries.push(se);
        else if (se.updatedAt > this.entries[idx].updatedAt) this.entries[idx] = se;
      }
      if (changes.settings && changes.settings.updatedAt > this.settings.updatedAt) {
        Object.assign(this.settings, changes.settings);
      }

      const updated: SyncConfig = { ...this.syncConfig, lastSyncedAt: syncedAt };
      this.syncConfig = updated;
      await saveSyncConfig(updated);
      this._saveData();

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

  addExercise(name: string) {
    this.exercises.push({ id: crypto.randomUUID(), name, updatedAt: now(), deletedAt: null });
    this.save();
  }

  removeExercise(id: string) {
    const t = now();
    const exercise = this.exercises.find(e => e.id === id);
    if (exercise) { exercise.deletedAt = t; exercise.updatedAt = t; }
    this.entries
      .filter(e => e.exerciseId === id && !e.deletedAt)
      .forEach(e => { e.deletedAt = t; e.updatedAt = t; });
    this.save();
  }

  renameExercise(id: string, name: string) {
    const exercise = this.exercises.find(e => e.id === id);
    if (exercise) { exercise.name = name; exercise.updatedAt = now(); this.save(); }
  }

  updateDescription(id: string, description: string) {
    const exercise = this.exercises.find(e => e.id === id);
    if (!exercise) return;
    const trimmed = description.trim();
    if (trimmed) exercise.description = trimmed; else delete exercise.description;
    exercise.updatedAt = now();
    this.save();
  }

  logEntry(exerciseId: string, date: string) {
    if (!this.entries.some(e => e.exerciseId === exerciseId && e.date === date && !e.deletedAt)) {
      this.entries.push({ id: crypto.randomUUID(), exerciseId, date, updatedAt: now(), deletedAt: null });
      this.save();
    }
  }

  removeEntry(id: string) {
    const entry = this.entries.find(e => e.id === id);
    if (entry) { const t = now(); entry.deletedAt = t; entry.updatedAt = t; this.save(); }
  }

  updateEntry(id: string, date: string) {
    const entry = this.entries.find(e => e.id === id);
    if (!entry) return;
    const duplicate = this.entries.some(
      e => e.id !== id && e.exerciseId === entry.exerciseId && e.date === date && !e.deletedAt
    );
    if (!duplicate) { entry.date = date; entry.updatedAt = now(); this.save(); }
  }

  updateSettings(patch: Partial<Settings>) {
    Object.assign(this.settings, patch);
    this.settings.updatedAt = now();
    this.save();
  }

  entriesFor(exerciseId: string): WorkoutEntry[] {
    return this.entries
      .filter(e => e.exerciseId === exerciseId && !e.deletedAt)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  get priorityCue(): Array<{ exercise: Exercise; lastDate: string | null }> {
    return this.activeExercises
      .map(exercise => {
        const dates = this.entries
          .filter(e => e.exerciseId === exercise.id && !e.deletedAt)
          .map(e => e.date)
          .sort((a, b) => b.localeCompare(a));
        return { exercise, lastDate: dates[0] ?? null };
      })
      .sort((a, b) => {
        if (!a.lastDate && !b.lastDate) return 0;
        if (!a.lastDate) return -1;
        if (!b.lastDate) return 1;
        return a.lastDate.localeCompare(b.lastDate);
      });
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
        body: JSON.stringify({ lastSyncedAt: null, changes: { exercises: [], entries: [], settings: null } }),
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
  }

  async unlinkAccount(): Promise<void> {
    await saveSyncConfig(null);
    this.syncConfig = null;
    this.syncStatus = 'idle';
    this._retryCount = 0;
    if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
    if (this._debounceTimer) { clearTimeout(this._debounceTimer); this._debounceTimer = null; }
  }
}

export const store = new WorkoutStore();
