import type { Exercise, WorkoutEntry, Settings, SyncConfig, WorkoutSchema, SharedSchemaPayload } from './types';
import { DEFAULT_SETTINGS } from './types';
import { SyncManager, loadSyncConfig } from './sync.svelte';
import { urgencyScore } from './utils';
import { IS_TAURI } from './platform';

const EPOCH = new Date(0).toISOString();
const WEB_STORAGE_KEY = 'theprocesstracker';

/**
 * Id of the schema the migration creates for pre-schema data. Deliberately a
 * fixed string rather than a UUID: every device migrates independently, and a
 * constant id makes them converge on one schema record instead of each
 * inventing its own "My workout".
 */
const DEFAULT_SCHEMA_ID = 'default-schema';

function now(): string {
  return new Date().toISOString();
}

type StoredData = {
  exercises: Exercise[];
  entries: WorkoutEntry[];
  settings: Settings;
  schemas: WorkoutSchema[];
};

function normalizeData(d: any): StoredData {
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

  const exercises: Exercise[] = (d.exercises ?? []).map((e: any) => ({
    ...e,
    updatedAt: e.updatedAt ?? EPOCH,
    deletedAt: e.deletedAt ?? null,
  }));

  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...d.settings,
    updatedAt: d.settings?.updatedAt ?? EPOCH,
  };

  const schemas: WorkoutSchema[] = (d.schemas ?? []).map((sc: any) => ({
    ...sc,
    updatedAt: sc.updatedAt ?? EPOCH,
    deletedAt: sc.deletedAt ?? null,
  }));

  // Migrate pre-schema data: create the starter schema that everything without
  // an explicit schemaId belongs to. Exercise records are intentionally left
  // untouched — the primarySchemaId fallback adopts them, so migrating costs no
  // updatedAt churn and old clients keep working against the same data.
  if (!schemas.some(sc => !sc.deletedAt)) {
    schemas.push({
      id: DEFAULT_SCHEMA_ID,
      name: 'My workout',
      updatedAt: EPOCH,
      deletedAt: null,
    });
  }
  if (!settings.activeSchemaId || !schemas.some(sc => sc.id === settings.activeSchemaId && !sc.deletedAt)) {
    settings.activeSchemaId = schemas.find(sc => !sc.deletedAt)!.id;
  }

  return { exercises, entries, settings, schemas };
}

async function writeData(exercises: Exercise[], entries: WorkoutEntry[], settings: Settings, schemas: WorkoutSchema[]) {
  const payload = { exercises, entries, settings, schemas };
  if (IS_TAURI) {
    const { mkdir, writeTextFile } = await import('@tauri-apps/plugin-fs');
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    const dir = await appDataDir();
    await mkdir(dir, { recursive: true });
    await writeTextFile(await join(dir, 'theprocesstracker.json'), JSON.stringify(payload, null, 2));
  } else {
    localStorage.setItem(WEB_STORAGE_KEY, JSON.stringify(payload));
  }
}

async function readData(): Promise<StoredData> {
  if (!IS_TAURI) {
    try {
      const raw = localStorage.getItem(WEB_STORAGE_KEY);
      if (raw) return normalizeData(JSON.parse(raw));
    } catch {}
    return normalizeData({});
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

  return normalizeData({});
}

class WorkoutStore {
  exercises = $state<Exercise[]>([]);
  entries = $state<WorkoutEntry[]>([]);
  schemas = $state<WorkoutSchema[]>([]);
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
      this.schemas = d.schemas;
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

  get liveSchemas(): WorkoutSchema[] {
    return this.schemas.filter(s => !s.deletedAt);
  }

  /** Schemas in display order (alphabetical). */
  get schemaList(): WorkoutSchema[] {
    return [...this.liveSchemas].sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * The schema that adopts exercises with no schemaId — data from before this
   * feature, or from a client too old to set the field. Resolved the same way on
   * every device so an exercise never appears in two schemas at once.
   */
  get primarySchemaId(): string | null {
    const live = this.liveSchemas;
    if (live.length === 0) return null;
    if (live.some(s => s.id === DEFAULT_SCHEMA_ID)) return DEFAULT_SCHEMA_ID;
    return [...live].sort((a, b) => a.id.localeCompare(b.id))[0].id;
  }

  /**
   * The selected schema. Falls back to the primary one when the stored id
   * points at a schema another device has since deleted.
   */
  get activeSchemaId(): string | null {
    const id = this.settings.activeSchemaId;
    if (id && this.liveSchemas.some(s => s.id === id)) return id;
    return this.primarySchemaId;
  }

  get activeSchema(): WorkoutSchema | null {
    const id = this.activeSchemaId;
    return this.liveSchemas.find(s => s.id === id) ?? null;
  }

  /** Which schema an exercise belongs to, applying the orphan fallback. */
  schemaIdOf(exercise: Exercise): string | null {
    return exercise.schemaId ?? this.primarySchemaId;
  }

  exercisesInSchema(schemaId: string): Exercise[] {
    return this.exercises.filter(e => !e.deletedAt && this.schemaIdOf(e) === schemaId);
  }

  get activeExercises(): Exercise[] {
    const schemaId = this.activeSchemaId;
    // No schema at all (should not happen after migration) — show everything
    // rather than presenting an empty app.
    if (!schemaId) return this.exercises.filter(e => !e.deletedAt);
    return this.exercisesInSchema(schemaId);
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
    writeData(this.exercises, this.entries, this.settings, this.schemas);
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

  // Schema operations
  addSchema(name: string): string {
    const id = crypto.randomUUID();
    this.schemas.push({ id, name: this.uniqueSchemaName(name), updatedAt: now(), deletedAt: null });
    this.settings.activeSchemaId = id;
    this.settings.updatedAt = now();
    this.save();
    return id;
  }

  renameSchema(id: string, name: string) {
    const schema = this.schemas.find(s => s.id === id);
    const trimmed = name.trim();
    if (!schema || !trimmed) return;
    schema.name = trimmed;
    schema.updatedAt = now();
    this.save();
  }

  /**
   * Soft-deletes a schema along with its exercises and their entries. Refuses to
   * remove the last remaining schema — the app always needs one to add into.
   */
  removeSchema(id: string) {
    if (this.liveSchemas.length <= 1) return;
    const schema = this.schemas.find(s => s.id === id);
    if (!schema) return;
    const t = now();
    for (const exercise of this.exercisesInSchema(id)) {
      exercise.deletedAt = t;
      exercise.updatedAt = t;
      this.entries
        .filter(e => e.exerciseId === exercise.id && !e.deletedAt)
        .forEach(e => { e.deletedAt = t; e.updatedAt = t; });
    }
    schema.deletedAt = t;
    schema.updatedAt = t;
    if (this.settings.activeSchemaId === id) {
      this.settings.activeSchemaId = this.primarySchemaId;
      this.settings.updatedAt = t;
    }
    this.save();
  }

  setActiveSchema(id: string) {
    if (!this.liveSchemas.some(s => s.id === id)) return;
    this.settings.activeSchemaId = id;
    this.settings.updatedAt = now();
    this.save();
  }

  /** "Push day" → "Push day (2)" when the name is already taken. */
  private uniqueSchemaName(name: string): string {
    const base = name.trim() || 'Untitled schema';
    const taken = new Set(this.liveSchemas.map(s => s.name));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) {
      const candidate = `${base} (${n})`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  /** The snapshot uploaded when sharing — no ids, no timestamps, no history. */
  schemaPayload(schemaId: string): SharedSchemaPayload {
    const schema = this.liveSchemas.find(s => s.id === schemaId);
    return {
      version: 1,
      name: schema?.name ?? 'Workout schema',
      exercises: this.exercisesInSchema(schemaId).map(e => ({
        name: e.name,
        ...(e.description ? { description: e.description } : {}),
        ...(e.targetSets ? { targetSets: e.targetSets } : {}),
        ...(e.targetReps ? { targetReps: e.targetReps } : {}),
        ...(e.colorOverride ? { colorOverride: { ...e.colorOverride } } : {}),
      })),
    };
  }

  /**
   * Creates a new local schema from a shared payload and makes it active. Every
   * record gets a fresh id so the import stays entirely separate from the
   * sender's data — including its own workout history, which starts empty.
   */
  importSchema(payload: SharedSchemaPayload): { schemaId: string; count: number } {
    const t = now();
    const schemaId = crypto.randomUUID();
    this.schemas.push({
      id: schemaId,
      name: this.uniqueSchemaName(payload.name),
      importedAt: t,
      updatedAt: t,
      deletedAt: null,
    });
    for (const e of payload.exercises) {
      this.exercises.push({
        id: crypto.randomUUID(),
        name: e.name,
        schemaId,
        ...(e.description ? { description: e.description } : {}),
        ...(e.targetSets ? { targetSets: e.targetSets } : {}),
        ...(e.targetReps ? { targetReps: e.targetReps } : {}),
        ...(e.colorOverride ? { colorOverride: { ...e.colorOverride } } : {}),
        updatedAt: t,
        deletedAt: null,
      });
    }
    this.settings.activeSchemaId = schemaId;
    this.settings.updatedAt = t;
    this.save();
    return { schemaId, count: payload.exercises.length };
  }

  /** Moves an exercise into another schema, keeping its history. */
  moveExerciseToSchema(exerciseId: string, schemaId: string) {
    const exercise = this.exercises.find(e => e.id === exerciseId);
    if (!exercise || !this.liveSchemas.some(s => s.id === schemaId)) return;
    exercise.schemaId = schemaId;
    exercise.updatedAt = now();
    this.save();
  }

  // Data operations
  addExercise(name: string) {
    this.exercises.push({
      id: crypto.randomUUID(),
      name,
      schemaId: this.activeSchemaId ?? undefined,
      updatedAt: now(),
      deletedAt: null,
    });
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
