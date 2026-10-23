import type { Exercise, WorkoutEntry, Settings, SyncConfig, WorkoutSchema, SharedSchemaPayload, Account, LegacyCredentials } from './types';
import { DEFAULT_SETTINGS } from './types';
import { SyncManager, loadSyncConfig, type SyncStatus } from './sync.svelte';
import { urgencyScore } from './utils';
import { showToast } from './toasts.svelte';
import * as api from './api';

const EPOCH = new Date(0).toISOString();
const STORAGE_KEY = 'theprocesstracker';

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

function writeData(data: StoredData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    showToast("Couldn't save — the browser's storage for this site is full or blocked.");
  }
}

function readData(): StoredData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeData(JSON.parse(raw));
  } catch {}
  return normalizeData({});
}

/**
 * Asks the browser not to evict our storage under pressure. Done once there is
 * an account worth protecting, since Firefox shows a prompt for it.
 */
function requestPersistentStorage() {
  navigator.storage?.persist?.().catch(() => {});
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
    this.applyData(readData());
    this.sync.setConfig(loadSyncConfig());
    this.ready = true;
    if (this.sync.canSync) {
      this.sync.syncToServer();
      if (this.account) this.refreshAccount();
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.sync.canSync) {
        this.sync.syncToServer();
      }
    });
  }

  private applyData(d: StoredData) {
    this.exercises = d.exercises;
    this.entries = d.entries;
    this.schemas = d.schemas;
    this.settings = d.settings;
    this.activeTimers = {};
  }

  // Delegated sync state (read by the UI via store.syncConfig / store.syncStatus)
  get syncConfig(): SyncConfig | null { return this.sync.syncConfig; }
  get syncStatus(): SyncStatus { return this.sync.syncStatus; }
  get account(): Account | null { return this.sync.syncConfig?.account ?? null; }
  get legacyCredentials(): LegacyCredentials | null { return this.sync.syncConfig?.legacy ?? null; }
  get sessionExpired(): boolean { return !!this.sync.syncConfig?.sessionExpired; }

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
    writeData($state.snapshot({
      exercises: this.exercises,
      entries: this.entries,
      settings: this.settings,
      schemas: this.schemas,
    }));
  }

  private save() {
    this.saveData();
    this.sync.debouncedSync();
  }

  // ── Sync & accounts ────────────────────────────────────────────

  manualSync() { return this.sync.manualSync(); }

  /** Whether this device holds any exercises or logged workouts. */
  get hasLocalData(): boolean {
    return this.exercises.some(e => !e.deletedAt) || this.entries.some(e => !e.deletedAt);
  }

  /**
   * What logging in as `account` means for the data already on this device:
   * - 'resume'  it already belongs to this account (logging in again after expiry)
   * - 'ask'     anonymous or old-sync-account data the user may want to keep
   * - 'replace' nothing worth keeping, or another account's data
   */
  localDataPlanFor(account: Account): 'resume' | 'ask' | 'replace' {
    const c = this.syncConfig;
    if (c?.account?.guid === account.guid) return 'resume';
    if (c?.account) return 'replace';
    return this.hasLocalData ? 'ask' : 'replace';
  }

  /**
   * Second half of logging in, once the server has accepted the password.
   * `keepLocal` adds this device's data to the account (only consulted when
   * localDataPlanFor said 'ask'); otherwise the device is cleared and filled
   * from the account.
   */
  async completeLogin(account: Account, keepLocal: boolean) {
    const c = this.syncConfig;
    const plan = this.localDataPlanFor(account);
    if (plan === 'resume') {
      this.sync.setConfig({ ...$state.snapshot(c!), account, sessionExpired: false });
    } else {
      if (plan === 'ask' && keepLocal && c?.legacy) {
        // Bring the old sync account's server copy along too. Old-app devices
        // still using its token then sync straight into this account.
        try {
          await api.mergeLegacy(c.legacy);
        } catch (e: unknown) {
          showToast(`Couldn't merge your old sync account: ${e instanceof Error ? e.message : e}`);
        }
      }
      if (plan === 'replace' || !keepLocal) this.clearLocalData();
      this.sync.setConfig({ account, legacy: null, sessionExpired: false, lastSyncedAt: null });
    }
    requestPersistentStorage();
    await this.sync.syncToServer();
  }

  /**
   * Creates an account; the data on this device goes into it. `legacy` — this
   * device's old sync token, or one scanned from the old app — is upgraded in
   * place, so its server data and any old-app devices using it carry on.
   */
  async register(username: string, password: string, email: string | null, legacy: LegacyCredentials | null) {
    const account = await api.register({ username, password, email, legacy });
    // Data left behind by someone else's expired login isn't ours to keep.
    if (this.syncConfig?.account) this.clearLocalData();
    this.sync.setConfig({ account, legacy: null, sessionExpired: false, lastSyncedAt: null });
    requestPersistentStorage();
    await this.sync.syncToServer();
  }

  /**
   * Logs out and clears this device. When there are changes the server hasn't
   * received and they can't be synced right now, returns false without logging
   * out unless `force` is set.
   */
  async logout(force = false): Promise<boolean> {
    if (!force && this.sync.hasUnsyncedChanges) {
      if (!this.sync.canSync || !(await this.sync.manualSync())) return false;
    }
    try { await api.logout(); } catch {}
    this.sync.setConfig(null);
    this.clearLocalData();
    return true;
  }

  /** Stops an old-style sync token from syncing this device. Local data is kept. */
  disconnectLegacy() {
    this.sync.setConfig(null);
  }

  /** Deletes the account on the server. This device keeps its data, without an account. */
  async deleteAccount(password: string) {
    await api.deleteAccount(password);
    this.sync.setConfig(null);
  }

  /** Merges an old GUID account (e.g. scanned from the old app) into the logged-in account. */
  async importLegacyAccount(legacy: LegacyCredentials) {
    await api.mergeLegacy(legacy);
    // The merged records can be older than our last sync; fetch everything.
    this.sync.syncConfig!.lastSyncedAt = null;
    this.sync.persistConfig();
    await this.sync.manualSync();
  }

  changePassword(currentPassword: string, newPassword: string) {
    return api.changePassword(currentPassword, newPassword);
  }

  async setEmail(email: string | null, password: string) {
    this.updateAccount(await api.setEmail(email, password));
  }

  /** Re-reads the account (e.g. after the email was verified elsewhere). */
  async refreshAccount() {
    try {
      this.updateAccount(await api.fetchAccount());
    } catch (e: unknown) {
      if (e instanceof api.ApiError && e.status === 401) this.sync.markSessionExpired();
    }
  }

  private updateAccount(account: Account) {
    const c = this.sync.syncConfig;
    if (!c?.account || c.account.guid !== account.guid) return;
    c.account = account;
    this.sync.persistConfig();
  }

  private clearLocalData() {
    this.applyData(normalizeData({}));
    this.saveData();
  }

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
