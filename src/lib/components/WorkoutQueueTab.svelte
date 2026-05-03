<script lang="ts">
  import { store } from '$lib/store.svelte';
  import { flip } from 'svelte/animate';
  import { expoInOut } from 'svelte/easing';
  import { fmtDate, daysSince, urgencyColor, today } from '$lib/utils';

  const UNDO_MS = 10_000;
  let undoPending = $state<Record<string, { timeoutId: ReturnType<typeof setTimeout>; entryId: string }>>({});

  function handleLogToday(exerciseId: string) {
    const date = today();
    store.logEntry(exerciseId, date);
    const entry = store.entries.find(e => e.exerciseId === exerciseId && e.date === date && !e.deletedAt);
    if (!entry) return;

    if (undoPending[exerciseId] !== undefined) clearTimeout(undoPending[exerciseId].timeoutId);
    undoPending[exerciseId] = {
      entryId: entry.id,
      timeoutId: setTimeout(() => { delete undoPending[exerciseId]; }, UNDO_MS),
    };
  }

  function handleUndoLog(exerciseId: string) {
    const pending = undoPending[exerciseId];
    if (!pending) return;
    clearTimeout(pending.timeoutId);
    store.removeEntry(pending.entryId);
    delete undoPending[exerciseId];
  }
</script>

{#if store.activeExercises.length === 0}
  <p class="empty">Add exercises in the Setup exercises tab first.</p>
{:else}
  <p class="priority-hint">Exercises you've gone the longest without are listed first.</p>
  <ol class="priority-list">
    {#each store.priorityCue as { exercise, lastDate }, i (exercise.id)}
      <li
        class="priority-card"
        style="border-left-color: {urgencyColor(lastDate, store.settings.yellowAfterDays, store.settings.redAfterDays)}"
        animate:flip={{ duration: 650, easing: expoInOut }}
      >
        <div class="priority-rank">{i + 1}</div>
        <div class="priority-info">
          <span class="priority-name">{exercise.name}</span>
          <span class="priority-last">
            {#if lastDate}
              Last done {daysSince(lastDate)} &middot; {fmtDate(lastDate)}
            {:else}
              Never done
            {/if}
          </span>
        </div>
        {#if undoPending[exercise.id] !== undefined}
          <button class="btn-undo" onclick={() => handleUndoLog(exercise.id)}>Undo</button>
        {:else}
          <button onclick={() => handleLogToday(exercise.id)}>Log today</button>
        {/if}
      </li>
    {/each}
  </ol>
{/if}

<style>
  .priority-hint {
    font-size: 0.875rem;
    opacity: 0.55;
    margin: 0 0 1rem;
  }

  .priority-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .priority-card {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    gap: 1rem;
    background: var(--card-bg);
    border-left: 4px solid transparent;
    border-radius: 10px;
    padding: 0.75rem 1rem;
  }

  .btn-undo {
    position: relative;
    overflow: hidden;
    background: var(--color-accent1);
    color: #1a1a1a;
    min-width: 5.5rem;
  }

  .btn-undo:hover { background: #a88a52; }

  .btn-undo::before {
    content: '';
    position: absolute;
    inset: 0;
    right: auto;
    width: 100%;
    background: rgba(255, 255, 255, 0.3);
    animation: btn-countdown 10s linear forwards;
    pointer-events: none;
  }

  @keyframes btn-countdown {
    from { width: 100%; }
    to   { width: 0%; }
  }

  .priority-rank {
    font-size: 1rem;
    font-weight: 700;
    opacity: 0.35;
    min-width: 1.5rem;
    text-align: right;
  }

  .priority-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .priority-name { font-weight: 600; font-size: 0.95rem; }
  .priority-last { font-size: 0.8rem; opacity: 0.55; }
</style>
