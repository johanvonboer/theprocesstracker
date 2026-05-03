import { exists, mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import type { Exercise, WorkoutEntry, Settings, SyncConfig } from './types';
import { DEFAULT_SETTINGS } from './types';
import { SyncManager, loadSyncConfig } from './sync.svelte';

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

async function writeData(exercises: Exercise[], entries: WorkoutEntry[], settings: Settings) {
  const dir = await getDir();
  await mkdir(dir, { recursive: true });
  await writeTextFile(await getPath(), JSON.stringify({ exercises, entries, settings }, null, 2));
}

async function readData(): Promise<{ exercises: Exercise[]; entries: WorkoutEntry[]; settings: Settings }> {
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
      if (syncConfig) this.sync.syncToServer();
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
}

export const store = new WorkoutStore();
