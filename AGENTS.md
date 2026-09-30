# Agent Instructions & Developer Overview

## What is it

**The Process** is a cross-platform workout tracker. Users define exercises, log dates they performed them, and see a priority queue that surfaces the exercises they've gone longest without. Optional cloud sync keeps data in sync across devices.

Targets: Linux desktop, Android (primary mobile), macOS/Windows.

---

## Tech stack

| Layer | Technology |
|---|---|
| UI framework | Svelte 5 (runes/`$state`) + SvelteKit 2 |
| Language | TypeScript 5.6 (strict) |
| Desktop/mobile shell | Tauri 2 (Rust) |
| Build | Vite 6, adapter-static (SPA, no SSR) |
| Icons | lucide-svelte |
| QR codes | qrcode |

The frontend is a pure SPA. Tauri wraps it with a native window and provides file system access. There is no server-side rendering (`ssr = false` in `+layout.ts`).

---

## Directory structure

```
src/
  app.html                   HTML shell (loads Iceland font)
  lib/
    types.ts                 All TypeScript interfaces & DEFAULT_SETTINGS
    toasts.svelte.ts         Global toast notification store (19 lines)
    utils.ts                 Pure date/color helpers (today, fmtDate, etc.)
    store.svelte.ts          WorkoutStore — data operations & persistence
    sync.svelte.ts           SyncManager — cloud sync, retry, account mgmt
    share.ts                 Schema share/import API client (pure, no store dep)
    components/
      SchemaBar.svelte       Schema selector + share/import overlays
      ExercisesTab.svelte    "Setup exercises" tab
      WorkoutQueueTab.svelte "Workout queue" tab
      SettingsTab.svelte     "Settings" tab (appearance + sync)
  routes/
    +layout.ts               Sets ssr = false
    +page.svelte             App shell: tab routing, toasts, global CSS

src-tauri/
  src/
    main.rs                  Entry point (calls lib::run)
    lib.rs                   Tauri setup + write_secret_file command
  tauri.conf.json            App name, window size, bundle config
  Cargo.toml                 Rust dependencies (tauri, serde, plugins)
```

---

## Architecture

```
+page.svelte          (shell: tabs, toasts, global CSS)
    │
    ├── ExercisesTab.svelte     (local UI state + store calls)
    │     └── SchemaBar.svelte  (schema selector, share QR, import scan)
    ├── WorkoutQueueTab.svelte  (local UI state + store calls)
    └── SettingsTab.svelte      (local UI state + store calls)

store.svelte.ts       (WorkoutStore: reactive data + file I/O)
    └── sync.svelte.ts          (SyncManager: HTTP sync, retry/backoff)

lib/share.ts          (share endpoint client — no store dependency)
lib/utils.ts          (pure functions — no store dependency)
lib/types.ts          (interfaces only — no logic)
lib/toasts.svelte.ts  (tiny global state for toast messages)
```

**The store is a singleton** (`export const store = new WorkoutStore()`). All components import it directly — there are no props passed between tabs and the page shell.

---

## Data model

Defined in `src/lib/types.ts`.

```
WorkoutSchema   id, name, importedAt?, updatedAt, deletedAt
Exercise        id, name, schemaId?, description?, colorOverride?, targetSets?,
                targetReps?, disabled?, updatedAt, deletedAt
WorkoutEntry    id, exerciseId, date (YYYY-MM-DD), sets?, restSeconds?,
                updatedAt, deletedAt
Settings        yellowAfterDays, redAfterDays, theme, activeSchemaId, updatedAt
SyncConfig      serverUrl, guid, secret, lastSyncedAt
```

### Schemas

A **workout schema** is a named set of exercises. Exactly one is active at a
time (`settings.activeSchemaId`), and `activeExercises` — which every tab reads
through — is scoped to it, so the Exercises tab and the workout queue both
follow the selection automatically.

`Exercise.schemaId` is **optional**. Exercises created before schemas existed —
or synced down from an older client — have no `schemaId` and are adopted by the
*primary* schema (`store.primarySchemaId`). Two consequences worth knowing:

- The migration creates the starter schema under the **fixed** id
  `default-schema`, not a UUID. Every device migrates independently, so a
  constant id makes them converge on one schema record instead of each
  inventing its own "My workout".
- The migration does **not** rewrite exercise records. The orphan fallback
  already puts them in the right place, so migrating costs no `updatedAt` churn
  and old clients keep working against the same data.

Deleting a schema cascades: the schema, its exercises, and their entries are all
soft-deleted. The last remaining schema cannot be deleted — the app always needs
one to add exercises into.

All records use **soft delete**: `deletedAt` is set to an ISO timestamp instead of removing the row. This is required for sync correctness — deletions must propagate to other devices.

All mutations set `updatedAt` to `new Date().toISOString()` so the delta-sync algorithm knows what changed.

---

## Persistence

**Main data** — `{appDataDir}/theprocesstracker.json`

Written via `@tauri-apps/plugin-fs`. The file contains `{ exercises, entries, settings }`. It is rewritten in full on every save (no partial updates).

**Sync credentials** — `{appDataDir}/config.json`

Written via the Tauri `write_secret_file` Rust command, which sets Unix permissions to `0o600` (owner read/write only) before writing. This command exists solely for the permission restriction — regular file write does not enforce this.

---

## Sync

The sync system lives entirely in `src/lib/sync.svelte.ts`.

**Protocol**: POST `/api/v1/sync` with a Bearer token (`guid.secret`). The body sends only records with `updatedAt > lastSyncedAt` (delta sync), under `changes.exercises`, `changes.entries`, `changes.schemas` and `changes.settings`. The server returns its own set of changes since the same timestamp. Conflicts resolve by `updatedAt` — most recently modified record wins.

`changes.schemas` is a per-record collection just like exercises and entries. A
server that ignores the key degrades gracefully: schemas still work locally,
they just don't propagate between devices.

**`SyncManager`** holds `syncConfig` and `syncStatus` as `$state`. It receives a `SyncDataRef` interface from `WorkoutStore` (a reference to `this`), giving it read/write access to the reactive `exercises`, `entries`, `settings` arrays plus a `saveData()` callback.

**Retry behaviour**: On failure, schedules a retry in 5 minutes, up to 5 attempts. Manual sync (clicking the cloud icon) resets the counter and fires immediately.

**Debounce**: Local changes trigger `debouncedSync()`, which waits 1500 ms before actually sending — preventing a flood of requests while a user is typing.

**Account linking** performs a test sync request to validate credentials before saving, so bad credentials are caught immediately.

---

## Schema sharing

Users share a schema by uploading a snapshot of it and handing over a short
code; the recipient scans a QR code (or pastes the code) to import it. The
client lives in `src/lib/share.ts`; the UI is `SchemaBar.svelte`, which reuses
the same QR generation and scanning approach as account linking in
`SettingsTab.svelte` (`qrcode` to render, the Tauri barcode-scanner plugin on
Android, `qr-scanner` webcam fallback on desktop).

**What travels**: `SharedSchemaPayload` — the schema name plus each exercise's
name, description, targets and color override. Deliberately **no ids, no
timestamps and no workout history**. The importing client mints fresh UUIDs for
the schema and every exercise, so an imported schema can never collide with the
sender's records during sync, and it starts with an empty history.

**Trust**: share payloads come from a stranger's device. `validateSharedPayload`
checks the shape field by field and trims/caps every string and number before
any of it reaches the store. Never feed a payload to `store.importSchema`
without it.

**Server side**: the two share endpoints do not exist yet, and `changes.schemas`
needs handling in the sync endpoint. Until then the app degrades gracefully —
schemas work locally, and pressing Share shows an error instead of a code.

---

## WorkoutStore public API

```ts
// Reactive state (read in templates)
store.exercises          Exercise[]
store.entries            WorkoutEntry[]
store.schemas            WorkoutSchema[]
store.settings           Settings
store.syncConfig         SyncConfig | null   (delegated from SyncManager)
store.syncStatus         'idle'|'syncing'|'error'  (delegated)
store.ready              boolean
store.activeTimers       Record<exerciseId, { phase: 'exercise'|'rest'; startedAt }>
                         (ephemeral — never persisted or synced)

// Computed
store.liveSchemas        WorkoutSchema[]  (non-deleted)
store.schemaList         WorkoutSchema[]  (non-deleted, alphabetical — for pickers)
store.activeSchema       WorkoutSchema | null
store.activeSchemaId     string | null    (falls back to primary if stale)
store.primarySchemaId    string | null    (adopts exercises with no schemaId)
store.activeExercises    Exercise[]  (non-deleted, in the active schema)
store.priorityCue        { exercise, lastDate }[]  (oldest first; an exercise
                         with a running timer is pinned to the top)
store.entriesFor(id)     WorkoutEntry[]  (non-deleted, sorted newest first)
store.schemaIdOf(ex)     string | null   (applies the orphan fallback)
store.exercisesInSchema(schemaId)  Exercise[]

// Data mutations (each triggers save + debounced sync)
store.addExercise(name)
store.removeExercise(id)
store.renameExercise(id, name)
store.updateDescription(id, description)
store.logEntry(exerciseId, date)
store.removeEntry(id)
store.updateEntry(id, date)
store.updateSettings(patch)

// Schema operations
store.addSchema(name)             → new schema id (becomes active)
store.renameSchema(id, name)
store.removeSchema(id)            cascades to exercises + entries; no-op on the last one
store.setActiveSchema(id)
store.moveExerciseToSchema(exerciseId, schemaId)   keeps history
store.schemaPayload(schemaId)     → SharedSchemaPayload  (for sharing)
store.importSchema(payload)       → { schemaId, count }  (fresh ids, becomes active)

// Workout session timer (ephemeral, no save/sync)
store.startPhase(exerciseId, 'exercise' | 'rest')
store.clearTimer(exerciseId)

// Sync
store.manualSync()
store.createAccount(serverUrl)    async, throws on error
store.linkAccount(serverUrl, guid, secret)  async, throws on error
store.unlinkAccount()
```

---

## Utility functions (`src/lib/utils.ts`)

Pure functions, no side effects, no store dependency.

```ts
today()                             → 'YYYY-MM-DD'
calendarDiff(dateStr)               → integer days since date (calendar days)
fmtDate(dateStr)                    → 'Mon, Jan 1, 2025' (en-US locale)
daysSince(dateStr | null)           → 'Today' | 'Yesterday' | 'X days ago' | 'Never done'
urgencyColor(lastDate, yellow, red) → HSL string (green → yellow → red)
```

`urgencyColor` takes the threshold values as parameters rather than reading from the store, keeping it testable in isolation.

---

## CSS strategy

Global design tokens (CSS variables, base `button`/`input` styles, shared utility classes like `.btn-icon`, `.btn-ghost`, `.btn-danger`) are defined as `:global()` rules in `+page.svelte`. This makes them available to all child components without duplication.

Component-specific layout and structural styles are scoped inside each component's `<style>` block (Svelte's default behaviour).

Brand palette variables (`--color-primary`, `--color-secondary`, `--color-accent1`, `--color-accent2`) are defined on `:global(html)` and used throughout via `var(--interactive)`, `var(--accent)`, `var(--card-bg)`, etc.

---

## Development

```bash
npm run dev          # Tauri dev mode (opens native window, hot reload)
npm run dev:web      # Vite only (browser at localhost:1420, no Tauri APIs)
npm run check        # svelte-check TypeScript type checking
npm run build        # Production build
npm run build:linux  # Linux .deb bundle
npm run build:android
```

Use `dev:web` for pure UI work — it's faster. Use `dev` when testing file I/O, sync credentials, or anything that touches Tauri APIs.

---

## Conventions

- **No component props** — components import `store` directly. The store is the single source of truth.
- **Soft delete only** — never remove records from arrays; set `deletedAt`.
- **Always set `updatedAt`** when mutating a record, so delta sync works correctly.
- **Duplicate prevention** — `logEntry` silently no-ops if an entry for that exercise+date already exists.
- **Date format** — always `YYYY-MM-DD` strings for workout dates. ISO strings for `updatedAt`/`deletedAt` timestamps.
- **`$state` runes files** — files that use Svelte 5 `$state` outside of `.svelte` files must use the `.svelte.ts` extension (e.g. `store.svelte.ts`, `sync.svelte.ts`, `toasts.svelte.ts`).

---

## Version bumping

When bumping the version, update it in all three of these files:

- `package.json` — `"version"` field
- `src-tauri/tauri.conf.json` — `"version"` field
- `src-tauri/Cargo.toml` — `version` field under `[package]`
- `src-tauri/Cargo.lock` — `version` under the `theprocesstracker` package
- `package-lock.json` — both `version` fields (`npm install --package-lock-only`)
