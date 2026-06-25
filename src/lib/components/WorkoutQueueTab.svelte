<script lang="ts">
  import { store } from '$lib/store.svelte';
  import type { AnimationConfig } from 'svelte/animate';
  import { expoInOut } from 'svelte/easing';

  function translateFlip(
    _node: Element,
    { from, to }: { from: DOMRect; to: DOMRect },
    params?: { duration?: number; easing?: (t: number) => number }
  ): AnimationConfig {
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const { duration = 650, easing = expoInOut } = params ?? {};
    return {
      duration,
      easing,
      css: (_t, u) => `transform: translate(${u * dx}px, ${u * dy}px)`,
    };
  }
  import { fmtDate, daysSince, urgencyColor, today } from '$lib/utils';

  const UNDO_MS = 5_000;
  let undoPending = $state<Record<string, { timeoutId: ReturnType<typeof setTimeout>; entryId: string }>>({});

  // Ticks every second so rest timer displays stay reactive
  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => { now = Date.now(); }, 1000);
    return () => clearInterval(id);
  });

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function getRestDisplay(exerciseId: string): string | null {
    const startedAt = store.restTimers[exerciseId];
    if (!startedAt) return null;
    return formatTime(Math.floor((now - startedAt) / 1000));
  }

  let localSets = $state<Record<string, number>>({});

  function handleAddSet(exerciseId: string) {
    localSets[exerciseId] = (localSets[exerciseId] ?? 0) + 1;
    store.startRest(exerciseId);
  }

  function handleStopRest(exerciseId: string) {
    store.stopRest(exerciseId);
  }

  function addLocalSet(exerciseId: string) {
    localSets[exerciseId] = (localSets[exerciseId] ?? 0) + 1;
  }

  function removeLocalSet(exerciseId: string) {
    const n = localSets[exerciseId] ?? 0;
    if (n > 0) localSets[exerciseId] = n - 1;
  }

  let openDropdownId = $state<string | null>(null);

  $effect(() => {
    if (openDropdownId === null) return;
    const close = () => { openDropdownId = null; };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  });

  function daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function handleLogDate(exerciseId: string, date: string) {
    const isToday = date === today();
    const sets = isToday && localSets[exerciseId] ? localSets[exerciseId] : undefined;
    const restSeconds = isToday && store.restTimers[exerciseId]
      ? Math.floor((Date.now() - store.restTimers[exerciseId]) / 1000)
      : undefined;
    store.logEntry(exerciseId, date, sets, restSeconds);
    store.stopRest(exerciseId);
    if (isToday) delete localSets[exerciseId];

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
    const entry = store.entries.find(e => e.id === pending.entryId);
    if (entry?.sets) localSets[exerciseId] = entry.sets;
    store.removeEntry(pending.entryId);
    delete undoPending[exerciseId];
  }
</script>

{#if store.priorityCue.length === 0}
  <p class="empty">{store.activeExercises.length === 0 ? 'Add exercises in the Setup exercises tab first.' : 'All exercises are disabled. Enable some in the Setup exercises tab.'}</p>
{:else}
  <p class="priority-hint">Exercises you've gone the longest without are listed first.</p>
  <ol class="priority-list">
    {#each store.priorityCue as { exercise, lastDate }, i (exercise.id)}
      {@const setsToday = localSets[exercise.id] ?? 0}
      {@const restDisplay = getRestDisplay(exercise.id)}
      {@const restRunning = store.restTimers[exercise.id] !== undefined}
      {@const loggedToday = store.entries.some(e => e.exerciseId === exercise.id && e.date === today() && !e.deletedAt)}
      {@const showSetsRow = !loggedToday && (setsToday > 0 || restRunning || !!exercise.targetSets || !!exercise.targetReps)}
      <li
        class="priority-card"
        style="border-left-color: {urgencyColor(lastDate, exercise.colorOverride?.yellowAfterDays ?? store.settings.yellowAfterDays, exercise.colorOverride?.redAfterDays ?? store.settings.redAfterDays)}"
        animate:translateFlip={{ duration: 650, easing: expoInOut }}
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
          {#if showSetsRow}
            <span class="sets-row">
              <span class="sets-stepper">
                <button class="sets-adj" onclick={() => addLocalSet(exercise.id)}>+</button>
                <span class="sets-adj-divider"></span>
                <button class="sets-adj" onclick={() => removeLocalSet(exercise.id)} disabled={setsToday === 0}>−</button>
                <span class="sets-count">Sets: {setsToday}{exercise.targetSets ? `/${exercise.targetSets}` : ''}{exercise.targetReps ? ` · ${exercise.targetReps}r` : ''}</span>
              </span>
              {#if restDisplay}
                <span class="rest-badge">Rest: {restDisplay}</span>
              {/if}
            </span>
          {/if}
        </div>
        <div class="card-actions">
          {#if restRunning}
            <button class="btn-stop" onclick={() => handleStopRest(exercise.id)}>Stop</button>
          {:else}
            <button class="btn-set" onclick={() => handleAddSet(exercise.id)}>+ Set</button>
          {/if}
          <div class="log-slot">
            {#if undoPending[exercise.id] !== undefined}
              <button class="btn-undo" style="--undo-ms: {UNDO_MS}ms" onclick={() => handleUndoLog(exercise.id)}>Undo</button>
            {/if}
            <div class="split-log" class:invisible={undoPending[exercise.id] !== undefined}>
              <button class="btn-log-main" onclick={() => handleLogDate(exercise.id, today())}>Log today</button>
              <button class="btn-log-arrow" onclick={(e) => { e.stopPropagation(); openDropdownId = openDropdownId === exercise.id ? null : exercise.id; }}>&#9662;</button>
              {#if openDropdownId === exercise.id}
                <div class="log-dropdown">
                  <button onclick={() => { handleLogDate(exercise.id, daysAgo(1)); openDropdownId = null; }}>Log yesterday</button>
                  <button onclick={() => { handleLogDate(exercise.id, daysAgo(2)); openDropdownId = null; }}>Log 2 days ago</button>
                  <button onclick={() => { handleLogDate(exercise.id, daysAgo(3)); openDropdownId = null; }}>Log 3 days ago</button>
                </div>
              {/if}
            </div>
          </div>
        </div>
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
    display: flex;
    align-items: center;
    gap: 1rem;
    background: var(--card-bg);
    border-left: 4px solid transparent;
    border-radius: 10px;
    padding: 0.75rem 1rem;
  }

  .priority-rank {
    font-size: 1rem;
    font-weight: 700;
    opacity: 0.35;
    min-width: 1.5rem;
    text-align: right;
    align-self: flex-start;
    padding-top: 0.15rem;
  }

  .priority-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }

  .priority-name { font-weight: 600; font-size: 0.95rem; }
  .priority-last { font-size: 0.8rem; opacity: 0.55; }

  .sets-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.35rem;
  }

  .sets-stepper {
    display: flex;
    align-items: stretch;
    border: 1px solid rgba(128, 128, 128, 0.35);
    border-radius: 6px;
    overflow: hidden;
  }

  .sets-adj {
    border: none;
    border-radius: 0;
    background: none;
    color: inherit;
    font-size: 0.85rem;
    line-height: 1;
    padding: 0.2rem 0.4rem;
  }

  .sets-adj:hover { background: rgba(128, 128, 128, 0.12); }
  .sets-adj:disabled { opacity: 0.2; cursor: default; background: none; }

  .sets-adj-divider {
    width: 1px;
    background: rgba(128, 128, 128, 0.25);
    align-self: stretch;
  }

  .sets-count {
    border-left: 1px solid rgba(128, 128, 128, 0.25);
    padding: 0.2rem 0.5rem;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--accent);
    background: rgba(84, 122, 149, 0.1);
    display: flex;
    align-items: center;
    white-space: nowrap;
  }

  .rest-badge {
    background: rgba(194, 165, 109, 0.18);
    color: var(--color-accent1);
  }

  .card-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-shrink: 0;
  }

  .btn-set {
    background: none;
    border: 1px solid rgba(128, 128, 128, 0.4);
    color: inherit;
    font-size: 0.85rem;
    line-height: 1;
    padding: 0.5rem 0.75rem;
    min-width: 4.5rem;
  }

  .btn-set:hover { background: rgba(128, 128, 128, 0.1); border-color: rgba(128, 128, 128, 0.6); }

  .btn-stop {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.35);
    color: #ef4444;
    font-size: 0.85rem;
    padding: 0.4rem 0.75rem;
    min-width: 4.5rem;
  }

  .btn-stop:hover { background: rgba(239, 68, 68, 0.2); }

  .log-slot {
    position: relative;
  }

  .log-slot .btn-undo {
    position: absolute;
    inset: 0;
  }

  .split-log {
    position: relative;
    display: flex;
  }

  .split-log.invisible {
    visibility: hidden;
    pointer-events: none;
  }

  .btn-log-main {
    border-radius: 8px 0 0 8px;
    border-right: none;
    padding-right: 0.6rem;
  }

  .btn-log-arrow {
    border-radius: 0 8px 8px 0;
    border-left: 1px solid rgba(128, 128, 128, 0.25);
    padding: 0.4rem 0.55rem;
    font-size: 0.75rem;
    line-height: 1;
  }

  .log-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 50;
    background: var(--card-bg);
    border: 1px solid rgba(128, 128, 128, 0.3);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    min-width: 11rem;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
    overflow: hidden;
  }

  .log-dropdown button {
    border-radius: 0;
    border: none;
    text-align: left;
    padding: 0.5rem 0.85rem;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .log-dropdown button:hover { background: var(--interactive-hover); }

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
    animation: btn-countdown var(--undo-ms) linear forwards;
    pointer-events: none;
  }

  @keyframes btn-countdown {
    from { width: 100%; }
    to   { width: 0%; }
  }
</style>
