export interface WorkoutSchema {
  id: string;
  name: string;
  /** Set when this schema was imported from someone else's share code. */
  importedAt?: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Exercise {
  id: string;
  name: string;
  /**
   * The schema this exercise belongs to. Exercises that predate schemas (or
   * that arrive from a client too old to know about them) have no schemaId and
   * are treated as belonging to the primary schema — see store.primarySchemaId.
   */
  schemaId?: string;
  description?: string;
  colorOverride?: { yellowAfterDays: number; redAfterDays: number };
  targetSets?: number;
  targetReps?: number;
  disabled?: boolean;
  updatedAt: string;
  deletedAt: string | null;
}

export interface WorkoutEntry {
  id: string;
  exerciseId: string;
  date: string; // YYYY-MM-DD
  sets?: number;
  restSeconds?: number;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Settings {
  yellowAfterDays: number;
  redAfterDays: number;
  theme: 'system' | 'light' | 'dark';
  /** Which schema the Exercises and Workout queue tabs are showing. */
  activeSchemaId: string | null;
  updatedAt: string;
}

export const DEFAULT_SETTINGS: Settings = {
  yellowAfterDays: 3,
  redAfterDays: 5,
  theme: 'system',
  activeSchemaId: null,
  updatedAt: new Date(0).toISOString(),
};

/** A username/password account. The credential itself lives in an HttpOnly cookie. */
export interface Account {
  /** Server-side id; also the id of the data folder the account syncs into. */
  guid: string;
  username: string;
  /** Optional, used only for password recovery. */
  email: string | null;
  emailVerified: boolean;
}

/** Anonymous pre-account sync credentials ("guid.secret" bearer token). */
export interface LegacyCredentials {
  guid: string;
  secret: string;
}

/**
 * Who this device syncs as. At most one of `account` / `legacy` is set: a
 * legacy credential is dropped as soon as it is upgraded or merged into an
 * account.
 */
export interface SyncConfig {
  account: Account | null;
  legacy: LegacyCredentials | null;
  /**
   * The server rejected the session. Local data is kept (it still belongs to
   * `account`) until that user logs in again or someone else does.
   */
  sessionExpired: boolean;
  lastSyncedAt: string | null;
}

/**
 * The shape uploaded to / downloaded from the share endpoint. Deliberately a
 * flat snapshot: no ids, no timestamps, no workout history. The importing
 * client mints fresh ids for everything so an imported schema can never
 * collide with the sender's records during sync.
 */
export interface SharedSchemaPayload {
  version: 1;
  name: string;
  exercises: Array<{
    name: string;
    description?: string;
    targetSets?: number;
    targetReps?: number;
    colorOverride?: { yellowAfterDays: number; redAfterDays: number };
  }>;
}
