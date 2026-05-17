import type { Exercise, WorkoutEntry, Settings, SyncConfig } from './types';
import { DEFAULT_SETTINGS } from './types';
import { SyncManager, loadSyncConfig } from './sync.svelte';
import { urgencyScore } from './utils';
import { IS_TAURI } from './platform';

const EPOCH = new Date(0).toISOString();
const WEB_STORAGE_KEY = 'theprocesstracker';

function now(): string {
  return new Date().toISOString();
}

function normalizeData(d: any): { exercises: Exercise[]; entries: WorkoutEntry[]; settings: Settings } {
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

async function writeData(exercises: Exercise[], entries: WorkoutEntry[], settings: Settings) {
  if (IS_TAURI) {
    const { mkdir, writeTextFile } = await import('@tauri-apps/plugin-fs');
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    const dir = await appDataDir();
    await mkdir(dir, { recursive: true });
    await writeTextFile(await join(dir, 'theprocesstracker.json'), JSON.stringify({ exercises, entries, settings }, null, 2));
  } else {
    localStorage.setItem(WEB_STORAGE_KEY, JSON.stringify({ exercises, entries, settings }));
  }
}

async function readData(): Promise<{ exercises: Exercise[]; entries: WorkoutEntry[]; settings: Settings }> {
  try {
    if (IS_TAURI) {
      const { exists, readTextFile } = await import('@tauri-apps/plugin-fs');
      const { appDataDir, join } = await import('@tauri-apps/api/path');
      const path = await join(await appDataDir(), 'theprocesstracker.json');
      if (await exists(path)) {
        return normalizeData(JSON.parse(await readTextFile(path)));
      }
    } else {
      const raw = localStorage.getItem(WEB_STORAGE_KEY);
      if (raw) return normalizeData(JSON.parse(raw));
    }
  } catch {}
  return { exercises: [], entries: [], settings: { ...DEFAULT_SETTINGS } };
}

class WorkoutStore {
  exercises = $state<Exercise[]>([]);
  entries = $state<WorkoutEntry[]>([]);
  settings = $state<Settings>({ ...DEFAULT_SETTINGS });
  ready = $state(false);

  readonly sync: SyncManager;

  constructor() {
    this.sync = new SyncManager(this);
    Promise.all([readData(), loadSyncConfig()]).then(([d, syncConfig]) => {
      this.exercises = d.exercises;
      this.entries = d.entries;
      this.settings = d.settings;
      this.sync.syncConfig = syncConfig;
      this.ready = true;
      if (syncConfig) {
        this.sync.syncToServer();
        this.sync.startPeriodicSync();
      }
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.sync.syncConfig) {
          this.sync.syncToServer();
        }
      });
    });
  }

  // Delegated sync state (read by the UI via store.syncConfig / store.syncStatus)
  get syncConfig(): SyncConfig | null { return this.sync.syncConfig; }
  get syncStatus(): 'idle' | 'syncing' | 'error' { return this.sync.syncStatus; }

  get activeExercises(): Exercise[] {
    return this.exercises.filter(e => !e.deletedAt);
  }

  get priorityCue(): Array<{ exercise: Exercise; lastDate: string | null }> {
    return this.activeExercises
      .filter(e => !e.disabled)
      .map(exercise => {
        const dates = this.entries
          .filter(e => e.exerciseId === exercise.id && !e.deletedAt)
          .map(e => e.date)
          .sort((a, b) => b.localeCompare(a));
        return { exercise, lastDate: dates[0] ?? null };
      })
      .sort((a, b) => {
        const ya = a.exercise.colorOverride?.yellowAfterDays ?? this.settings.yellowAfterDays;
        const ra = a.exercise.colorOverride?.redAfterDays   ?? this.settings.redAfterDays;
        const yb = b.exercise.colorOverride?.yellowAfterDays ?? this.settings.yellowAfterDays;
        const rb = b.exercise.colorOverride?.redAfterDays   ?? this.settings.redAfterDays;
        return urgencyScore(b.lastDate, yb, rb) - urgencyScore(a.lastDate, ya, ra);
      });
  }

  // Called by SyncManager after merging a server response
  saveData() {
    writeData(this.exercises, this.entries, this.settings);
  }

  private save() {
    this.saveData();
    this.sync.debouncedSync();
  }

  // Sync operations — delegated to SyncManager
  manualSync() { this.sync.manualSync(); }
  createAccount(serverUrl: string) { return this.sync.createAccount(serverUrl); }
  linkAccount(serverUrl: string, guid: string, secret: string) { return this.sync.linkAccount(serverUrl, guid, secret); }
  unlinkAccount() { return this.sync.unlinkAccount(); }

  // Data operations
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

  toggleDisableExercise(id: string) {
    const exercise = this.exercises.find(e => e.id === id);
    if (!exercise) return;
    exercise.disabled = !exercise.disabled;
    exercise.updatedAt = now();
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

  updateColorOverride(id: string, override: { yellowAfterDays: number; redAfterDays: number } | undefined) {
    const exercise = this.exercises.find(e => e.id === id);
    if (!exercise) return;
    if (override !== undefined) exercise.colorOverride = override;
    else delete exercise.colorOverride;
    exercise.updatedAt = now();
    this.save();
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
}

export const store = new WorkoutStore();
