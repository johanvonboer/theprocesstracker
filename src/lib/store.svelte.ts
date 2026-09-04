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
  const entries: WorkoutEntry[] = (d.entries ?? []).map((e: any) => ({
    ...e,
    updatedAt: e.updatedAt ?? EPOCH,
    deletedAt: e.deletedAt ?? null,
  }));

  // Migrate legacy setEntries → entry.sets
  const legacySetEntries: any[] = (d.setEntries ?? []).filter((s: any) => !s.deletedAt);
  if (legacySetEntries.length > 0) {
    for (const entry of entries) {
      if (entry.sets == null) {
        const count = legacySetEntries.filter(s => s.exerciseId === entry.exerciseId && s.date === entry.date).length;
        if (count > 0) entry.sets = count;
      }
    }
  }

  return {
    exercises: (d.exercises ?? []).map((e: any) => ({
      ...e,
      updatedAt: e.updatedAt ?? EPOCH,
      deletedAt: e.deletedAt ?? null,
    })),
    entries,
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
  if (!IS_TAURI) {
    try {
      const raw = localStorage.getItem(WEB_STORAGE_KEY);
      if (raw) return normalizeData(JSON.parse(raw));
    } catch {}
    return { exercises: [], entries: [], settings: { ...DEFAULT_SETTINGS } };
  }

  const { exists, readTextFile, writeTextFile, mkdir } = await import('@tauri-apps/plugin-fs');
  const { appDataDir, join, dirname } = await import('@tauri-apps/api/path');
  const dir = await appDataDir();
  await mkdir(dir, { recursive: true });
  const mainPath = await join(dir, 'theprocesstracker.json');

  // Read from primary location
  if (await exists(mainPath)) {
    try {
      const raw = await readTextFile(mainPath);
      const data = normalizeData(JSON.parse(raw));
      if (data.exercises.length > 0 || data.entries.length > 0) {
        // Back up on every startup so the previous session is always recoverable
        try { await writeTextFile(await join(dir, 'theprocesstracker.json.bak'), raw); } catch {}
        return data;
      }
    } catch {}
  }

  // Primary location is empty or missing — check known legacy locations.
  // $DATA is the parent of $APPDATA (e.g. ~/.local/share/ on Linux), so
  // dirname(appDataDir()) gives us the sibling directory of the old identifier.
  const legacyIdentifiers = ['theprocesstracker'];
  const parentDir = await dirname(dir);
  for (const id of legacyIdentifiers) {
    try {
      const legacyPath = await join(parentDir, id, 'theprocesstracker.json');
      if (!await exists(legacyPath)) continue;
      const raw = await readTextFile(legacyPath);
      const data = normalizeData(JSON.parse(raw));
      if (data.exercises.length === 0 && data.entries.length === 0) continue;
      // Migrate to primary location and create startup backup
      await writeTextFile(mainPath, raw);
      try { await writeTextFile(await join(dir, 'theprocesstracker.json.bak'), raw); } catch {}
      return data;
    } catch {}
  }

  return { exercises: [], entries: [], settings: { ...DEFAULT_SETTINGS } };
}

class WorkoutStore {
  exercises = $state<Exercise[]>([]);
  entries = $state<WorkoutEntry[]>([]);
  // activeTimers: exerciseId → the phase currently being timed and when it began.
  // The workout queue alternates exercise ↔ rest on each button press until the
  // set is logged. Ephemeral — never persisted or synced.
  activeTimers = $state<Record<string, { phase: 'exercise' | 'rest'; startedAt: number }>>({});
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
        // An exercise with a running timer is pinned to the top for as long as
        // the session lasts; if several are running, most recently started wins.
        const ta = this.activeTimers[a.exercise.id]?.startedAt ?? 0;
        const tb = this.activeTimers[b.exercise.id]?.startedAt ?? 0;
        if (ta !== tb) return tb - ta;

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
  deleteAccount() { return this.sync.deleteAccount(); }

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

  logEntry(exerciseId: string, date: string, sets?: number, restSeconds?: number) {
    if (!this.entries.some(e => e.exerciseId === exerciseId && e.date === date && !e.deletedAt)) {
      this.entries.push({ id: crypto.randomUUID(), exerciseId, date, sets, restSeconds, updatedAt: now(), deletedAt: null });
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

  startPhase(exerciseId: string, phase: 'exercise' | 'rest') {
    this.activeTimers[exerciseId] = { phase, startedAt: Date.now() };
  }

  clearTimer(exerciseId: string) {
    delete this.activeTimers[exerciseId];
  }

  updateExerciseTargets(id: string, targetSets: number | undefined, targetReps: number | undefined) {
    const exercise = this.exercises.find(e => e.id === id);
    if (!exercise) return;
    if (targetSets) exercise.targetSets = targetSets; else delete exercise.targetSets;
    if (targetReps) exercise.targetReps = targetReps; else delete exercise.targetReps;
    exercise.updatedAt = now();
    this.save();
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
