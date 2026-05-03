<script lang="ts">
  import { store } from '$lib/store.svelte';
  import type { Exercise, WorkoutEntry } from '$lib/types';
  import { PenLine, Trash2 } from 'lucide-svelte';
  import { fmtDate, today } from '$lib/utils';

  // ── Add exercise ──────────────────────────────────────────────
  let newName = $state('');

  function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    store.addExercise(name);
    newName = '';
  }

  // ── Rename ────────────────────────────────────────────────────
  let editingId = $state<string | null>(null);
  let editingName = $state('');

  function startRename(exercise: Exercise) {
    editingId = exercise.id;
    editingName = exercise.name;
  }

  function confirmRename() {
    const name = editingName.trim();
    if (editingId && name) store.renameExercise(editingId, name);
    editingId = null;
  }

  function cancelRename() { editingId = null; }

  function onRenameKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') confirmRename();
    if (e.key === 'Escape') cancelRename();
  }

  // ── Description ──────────────────────────────────────────────
  let editingDescId = $state<string | null>(null);
  let editingDescValue = $state('');

  function startEditDesc(exercise: Exercise) {
    editingDescId = exercise.id;
    editingDescValue = exercise.description ?? '';
  }

  function confirmDesc() {
    if (editingDescId !== null) store.updateDescription(editingDescId, editingDescValue);
    editingDescId = null;
  }

  function onDescKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') confirmDesc();
    if (e.key === 'Escape') { editingDescId = null; }
  }

  // ── Delete confirmation ───────────────────────────────────────
  let pendingDeleteExercise = $state<string | null>(null);
  let pendingDeleteEntry = $state<string | null>(null);

  // ── History collapse ──────────────────────────────────────────
  let openHistory = $state<Record<string, boolean>>({});

  function toggleHistory(id: string) {
    openHistory[id] = !openHistory[id];
  }

  // ── Edit entry ───────────────────────────────────────────────
  let editingEntryId = $state<string | null>(null);
  let editingEntryDate = $state('');

  function startEditEntry(entry: WorkoutEntry) {
    editingEntryId = entry.id;
    editingEntryDate = entry.date;
  }

  function confirmEditEntry() {
    if (editingEntryId && editingEntryDate) store.updateEntry(editingEntryId, editingEntryDate);
    editingEntryId = null;
  }

  function cancelEditEntry() { editingEntryId = null; }

  function onEntryKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') confirmEditEntry();
    if (e.key === 'Escape') cancelEditEntry();
  }

  // ── Log workout ───────────────────────────────────────────────
  let selectedDates = $state<Record<string, string>>({});

  function getDate(id: string) { return selectedDates[id] ?? today(); }

  function handleLog(exerciseId: string) {
    store.logEntry(exerciseId, getDate(exerciseId));
  }
</script>

<section class="add-exercise">
  <form onsubmit={(e) => { e.preventDefault(); handleAdd(); }}>
    <input
      type="text"
      placeholder="New exercise name..."
      bind:value={newName}
    />
    <button type="submit" disabled={!newName.trim()}>Add exercise</button>
  </form>
</section>

{#if store.activeExercises.length === 0}
  <p class="empty">No exercises yet. Add one above to get started.</p>
{:else}
  <ul class="exercise-list">
    {#each [...store.activeExercises].sort((a, b) => a.name.localeCompare(b.name)) as exercise (exercise.id)}
      {@const entries = store.entriesFor(exercise.id)}
      <li class="exercise-card">
        <div class="card-header">
          {#if editingId === exercise.id}
            <input
              class="rename-input"
              type="text"
              bind:value={editingName}
              onkeydown={onRenameKeydown}
              onblur={confirmRename}
              autofocus
            />
            <div class="rename-actions">
              <button class="btn-icon btn-confirm" onclick={confirmRename} title="Confirm">✓</button>
              <button class="btn-icon btn-ghost" onclick={cancelRename} title="Cancel">✗</button>
            </div>
          {:else}
            <h2>{exercise.name}</h2>
            <div class="header-actions">
              <button class="btn-icon btn-ghost" onclick={() => startRename(exercise)} title="Rename"><PenLine size={14} /></button>
              {#if pendingDeleteExercise === exercise.id}
                <div class="delete-confirm">
                  <span>Delete?</span>
                  <button class="btn-icon btn-danger" onclick={() => { store.removeExercise(exercise.id); pendingDeleteExercise = null; }} title="Confirm">✓</button>
                  <button class="btn-icon btn-ghost" onclick={() => pendingDeleteExercise = null} title="Cancel">✗</button>
                </div>
              {:else}
                <button class="btn-icon btn-ghost" onclick={() => pendingDeleteExercise = exercise.id} title="Delete"><Trash2 size={14} /></button>
              {/if}
            </div>
          {/if}
        </div>

        <!-- Description -->
        {#if editingDescId === exercise.id}
          <input
            class="desc-input"
            type="text"
            placeholder="Add description..."
            bind:value={editingDescValue}
            onkeydown={onDescKeydown}
            onblur={confirmDesc}
            autofocus
          />
        {:else if exercise.description}
          <button class="desc-text" onclick={() => startEditDesc(exercise)} title="Edit description">{exercise.description}</button>
        {:else}
          <button class="btn-add-desc" onclick={() => startEditDesc(exercise)}>+ Add description</button>
        {/if}

        <!-- History toggle -->
        <button class="btn-history-toggle" onclick={() => toggleHistory(exercise.id)}>
          History
          <span class="toggle-arrow">{openHistory[exercise.id] ? '▲' : '▼'}</span>
        </button>

        <!-- Collapsible history panel -->
        {#if openHistory[exercise.id]}
          <div class="history-panel">
            <div class="log-row">
              <input
                type="date"
                value={getDate(exercise.id)}
                onchange={(e) => { selectedDates[exercise.id] = (e.target as HTMLInputElement).value; }}
              />
              <button onclick={() => handleLog(exercise.id)}>Log workout</button>
            </div>

            {#if entries.length > 0}
              <ul class="entry-list">
                {#each entries as entry (entry.id)}
                  <li>
                    {#if editingEntryId === entry.id}
                      <input
                        class="entry-date-input"
                        type="date"
                        bind:value={editingEntryDate}
                        onkeydown={onEntryKeydown}
                        onblur={confirmEditEntry}
                        autofocus
                      />
                      <div class="entry-actions">
                        <button class="btn-icon btn-confirm" onclick={confirmEditEntry} title="Save">✓</button>
                        <button class="btn-icon btn-ghost" onclick={cancelEditEntry} title="Cancel">✗</button>
                      </div>
                    {:else}
                      <span>{fmtDate(entry.date)}</span>
                      <div class="entry-actions">
                        <button class="btn-icon btn-ghost" onclick={() => startEditEntry(entry)} title="Edit date"><PenLine size={14} /></button>
                        {#if pendingDeleteEntry === entry.id}
                          <div class="delete-confirm">
                            <span>Delete?</span>
                            <button class="btn-icon btn-danger" onclick={() => { store.removeEntry(entry.id); pendingDeleteEntry = null; }} title="Confirm">✓</button>
                            <button class="btn-icon btn-ghost" onclick={() => pendingDeleteEntry = null} title="Cancel">✗</button>
                          </div>
                        {:else}
                          <button class="btn-icon btn-ghost" onclick={() => pendingDeleteEntry = entry.id} title="Delete"><Trash2 size={14} /></button>
                        {/if}
                      </div>
                    {/if}
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="no-entries">No entries yet.</p>
            {/if}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .add-exercise form { display: flex; gap: 0.5rem; }
  .add-exercise input { flex: 1; }

  .exercise-list {
    list-style: none;
    padding: 0;
    margin: 1.5rem 0 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .exercise-card {
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 12px;
    padding: 1rem 1.25rem;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .card-header h2 { margin: 0; font-size: 1.05rem; font-weight: 600; }

  .rename-input { flex: 1; font-size: 1rem; font-weight: 600; }

  .header-actions,
  .rename-actions { display: flex; gap: 0.1rem; align-items: center; }

  .log-row { display: flex; gap: 0.5rem; align-items: center; }
  .log-row input[type='date'] { flex: 1; }

  .entry-list {
    list-style: none;
    padding: 0;
    margin: 0.75rem 0 0;
    border-top: 1px solid rgba(128,128,128,0.15);
  }

  .entry-list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.35rem 0;
    border-bottom: 1px solid rgba(128,128,128,0.08);
    font-size: 0.875rem;
    opacity: 0.85;
  }

  .entry-date-input { flex: 1; padding: 0.25rem 0.5rem; font-size: 0.875rem; }
  .entry-actions { display: flex; gap: 0.1rem; align-items: center; }

  .desc-input {
    width: 100%;
    margin: 0.25rem 0 0.5rem;
    font-size: 0.875rem;
    padding: 0.3rem 0.5rem;
    border-radius: 6px;
  }

  .desc-text {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    color: inherit;
    padding: 0.1rem 0;
    margin: 0.1rem 0 0.4rem;
    font-size: 0.875rem;
    font-family: inherit;
    opacity: 0.55;
    cursor: text;
  }

  .desc-text:hover { opacity: 0.85; background: none; }

  .btn-add-desc {
    background: none;
    border: none;
    padding: 0.1rem 0;
    margin: 0.1rem 0 0.4rem;
    font-size: 0.8rem;
    font-family: inherit;
    opacity: 0.35;
    cursor: pointer;
    color: inherit;
  }

  .btn-add-desc:hover { opacity: 0.65; background: none; }

  .btn-history-toggle {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.5rem;
    background: none;
    border: none;
    color: inherit;
    font-size: 0.82rem;
    font-weight: 600;
    opacity: 0.45;
    cursor: pointer;
    padding: 0.2rem 0;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .btn-history-toggle:hover { opacity: 0.75; background: none; }
  .toggle-arrow { font-size: 0.65rem; }

  .history-panel {
    margin-top: 0.75rem;
    border-top: 1px solid rgba(128,128,128,0.15);
    padding-top: 0.75rem;
  }

  .no-entries {
    font-size: 0.85rem;
    opacity: 0.4;
    margin: 0.5rem 0 0;
    text-align: center;
  }
</style>
