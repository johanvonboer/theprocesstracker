export interface Exercise {
  id: string;
  name: string;
  description?: string;
  colorOverride?: { yellowAfterDays: number; redAfterDays: number };
  updatedAt: string;
  deletedAt: string | null;
}

export interface WorkoutEntry {
  id: string;
  exerciseId: string;
  date: string; // YYYY-MM-DD
  updatedAt: string;
  deletedAt: string | null;
}

export interface Settings {
  yellowAfterDays: number;
  redAfterDays: number;
  theme: 'system' | 'light' | 'dark';
  updatedAt: string;
}

export const DEFAULT_SETTINGS: Settings = {
  yellowAfterDays: 3,
  redAfterDays: 5,
  theme: 'system',
  updatedAt: new Date(0).toISOString(),
};

export interface SyncConfig {
  serverUrl: string;
  guid: string;
  secret: string;
  lastSyncedAt: string | null;
}
