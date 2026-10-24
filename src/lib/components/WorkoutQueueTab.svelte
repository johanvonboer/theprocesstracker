<script lang="ts">
  import { store } from '$lib/store.svelte';
  import type { Exercise } from '$lib/types';
  import type { AnimationConfig } from 'svelte/animate';
  import { expoInOut } from 'svelte/easing';
  import { Play, Pause, Check, EllipsisVertical } from 'lucide-svelte';

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

  function elapsedSeconds(startedAt: number): number {
    return Math.floor((Date.now() - startedAt) / 1000);
  }

  function getTimerDisplay(exerciseId: string): string | null {
    const timer = store.activeTimers[exerciseId];
    if (!timer) return null;
    // `now` ticks every second — read it so this stays reactive.
    return formatTime(Math.max(0, Math.floor((now - timer.startedAt) / 1000)));
  }

  /** "Set 2/3 · 8r" — the set in progress, with the exercise's targets if set. */
  function setLabel(exercise: Exercise, currentSet: number): string {
    const target = exercise.targetSets ? `/${exercise.targetSets}` : '';
    const reps = exercise.targetReps ? ` · ${exercise.targetReps}r` : '';
    return `Set ${currentSet}${target}${reps}`;
  }

  /** "Set 2/3 · 8r · exercising" / "Set 1/3 done · resting" — under the name while a session runs. */
  function statusLabel(exercise: Exercise, phase: 'exercise' | 'rest', setsDone: number): string {
    if (phase === 'exercise') return `${setLabel(exercise, setsDone + 1)} · exercising`;
    const target = exercise.targetSets ? `/${exercise.targetSets}` : '';
    return `Set ${setsDone}${target} done · resting`;
  }

  /** "3 × 8" — targets shown on the idle button, before any set is underway. */
  function targetHint(exercise: Exercise): string | null {
    if (exercise.targetSets && exercise.targetReps) return `${exercise.targetSets} × ${exercise.targetReps}`;
    if (exercise.targetSets) return `${exercise.targetSets} sets`;
    if (exercise.targetReps) return `${exercise.targetReps} reps`;
    return null;
  }

  let localSets = $state<Record<string, number>>({});
  // Rest accumulates across every rest period of the session, so the logged
  // entry records total rest rather than only the last stretch.
  let restTotals = $state<Record<string, number>>({});

  // One session at a time: while an exercise is being timed, the others can't
  // be started until it is logged or cancelled.
  const sessionRunning = $derived(Object.keys(store.activeTimers).length > 0);

  /**
   * One button cycles the whole set: idle → exercise → rest → exercise → …
   * A set is counted when an exercise period ends, and rest time is banked when
   * a rest period ends. "Log today" / "Finished" (handleLogDate) closes out whichever phase is
   * still open and clears the timer.
   */
  function handleTimerClick(exerciseId: string) {
    const timer = store.activeTimers[exerciseId];
    if (!timer) {
      if (sessionRunning) return;
      store.startPhase(exerciseId, 'exercise');
      return;
    }
    if (timer.phase === 'exercise') {
      localSets[exerciseId] = (localSets[exerciseId] ?? 0) + 1;
      store.startPhase(exerciseId, 'rest');
    } else {
      restTotals[exerciseId] = (restTotals[exerciseId] ?? 0) + elapsedSeconds(timer.startedAt);
      store.startPhase(exerciseId, 'exercise');
    }
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
    const timer = store.activeTimers[exerciseId];

    // Close out the phase still running: an unfinished exercise period is a set
    // the user actually performed, an unfinished rest period is rest to bank.
    let sets = localSets[exerciseId] ?? 0;
    let rest = restTotals[exerciseId] ?? 0;
    if (timer?.phase === 'exercise') sets += 1;
    else if (timer?.phase === 'rest') rest += elapsedSeconds(timer.startedAt);

    store.logEntry(exerciseId, date, isToday && sets ? sets : undefined, isToday && rest ? rest : undefined);
    store.clearTimer(exerciseId);
    if (isToday) {
      delete localSets[exerciseId];
      delete restTotals[exerciseId];
    }

    const entry = store.entries.find(e => e.exerciseId === exerciseId && e.date === date && !e.deletedAt);
    if (!entry) return;

    if (undoPending[exerciseId] !== undefined) clearTimeout(undoPending[exerciseId].timeoutId);
    undoPending[exerciseId] = {
      entryId: entry.id,
      timeoutId: setTimeout(() => { delete undoPending[exerciseId]; }, UNDO_MS),
    };
  }

  /**
   * Throw away an in-progress session: the running timer, the sets counted so
   * far and the banked rest. For starting an exercise by mistake — nothing is
   * logged, so there is nothing to undo afterwards.
   */
  function handleCancelSession(exerciseId: string) {
    store.clearTimer(exerciseId);
    delete localSets[exerciseId];
    delete restTotals[exerciseId];
  }

  function handleUndoLog(exerciseId: string) {
    const pending = undoPending[exerciseId];
    if (!pending) return;
    clearTimeout(pending.timeoutId);
    const entry = store.entries.find(e => e.id === pending.entryId);
    if (entry?.sets) localSets[exerciseId] = entry.sets;
    if (entry?.restSeconds) restTotals[exerciseId] = entry.restSeconds;
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
      {@const timer = store.activeTimers[exercise.id]}
      {@const timerDisplay = getTimerDisplay(exercise.id)}
      <li
        class="priority-card"
        class:active={!!timer}
        style="--urgency: {urgencyColor(lastDate, exercise.colorOverride?.yellowAfterDays ?? store.settings.yellowAfterDays, exercise.colorOverride?.redAfterDays ?? store.settings.redAfterDays)}"
        animate:translateFlip={{ duration: 650, easing: expoInOut }}
      >
        <div class="card-body">
          <div class="priority-rank">{i + 1}</div>
          <div class="priority-info">
            <span class="priority-name">{exercise.name}</span>
            {#if timer}
              <span class="priority-status phase-{timer.phase}">{statusLabel(exercise, timer.phase, setsToday)}</span>
            {:else}
              <span class="priority-last">
                {#if lastDate}
                  Last done {daysSince(lastDate)} &middot; {fmtDate(lastDate)}
                {:else}
                  Never done
                {/if}
              </span>
            {/if}
          </div>
          {#if timer}
            <span class="timer-elapsed phase-{timer.phase}">{timerDisplay}</span>
          {/if}
        </div>
        <div class="card-actions">
          <button
            class="btn-set"
            class:phase-exercise={timer?.phase === 'exercise'}
            class:phase-rest={timer?.phase === 'rest'}
            disabled={!timer && sessionRunning}
            title={!timer && sessionRunning ? 'Finish or cancel the running exercise first' : undefined}
            onclick={() => handleTimerClick(exercise.id)}
          >
            {#if timer?.phase === 'exercise'}
              <Pause size={16} /><span class="set-action">Stop and rest</span>
            {:else if timer}
              <Play size={16} /><span class="set-action">Start set {setsToday + 1}</span>
            {:else}
              <Play size={16} />
              <span class="set-idle">
                <span class="set-action">Start exercise</span>
                {#if targetHint(exercise)}<span class="set-hint">{targetHint(exercise)}</span>{/if}
              </span>
            {/if}
          </button>
          <div class="log-slot">
            {#if undoPending[exercise.id] !== undefined}
              <button class="btn-undo" style="--undo-ms: {UNDO_MS}ms" onclick={() => handleUndoLog(exercise.id)}>Undo</button>
            {/if}
            <div class="split-log" class:invisible={undoPending[exercise.id] !== undefined}>
              <button class="btn-log-main" onclick={() => handleLogDate(exercise.id, today())}>
                <Check size={16} /><span>{timer ? 'Finished' : 'Log today'}</span>
              </button>
              <button
                class="btn-log-arrow"
                aria-label="More options"
                aria-expanded={openDropdownId === exercise.id}
                onclick={(e) => { e.stopPropagation(); openDropdownId = openDropdownId === exercise.id ? null : exercise.id; }}
              ><EllipsisVertical size={18} /></button>
              {#if openDropdownId === exercise.id}
                <div class="log-dropdown">
                  <!-- A running session is happening today, so only offer backdating when idle. -->
                  {#if timer}
                    <button class="cancel-item" onclick={() => { handleCancelSession(exercise.id); openDropdownId = null; }}>
                      Cancel — discard this session
                    </button>
                  {:else}
                    <button onclick={() => { handleLogDate(exercise.id, daysAgo(1)); openDropdownId = null; }}>Log yesterday</button>
                    <button onclick={() => { handleLogDate(exercise.id, daysAgo(2)); openDropdownId = null; }}>Log 2 days ago</button>
                    <button onclick={() => { handleLogDate(exercise.id, daysAgo(3)); openDropdownId = null; }}>Log 3 days ago</button>
                  {/if}
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
    gap: 0.7rem;
  }

  /* Card is a row of full-height segments: body | rest | done | caret.
     No overflow:hidden here — the log dropdown escapes the card — so the
     trailing segments round their own outer corners instead. */
  .priority-card {
    position: relative;
    display: flex;
    align-items: stretch;
    background: var(--card-bg);
    border-left: 5px solid color-mix(in oklab, var(--urgency) var(--urgency-strength), #e8e0d6);
    border-radius: 12px;
    box-shadow: 0 0 0 1px var(--card-ring), 0 1px 2px rgba(44, 57, 71, 0.1), 0 6px 16px rgba(44, 57, 71, 0.07);
    padding: 0;
    transition: margin-bottom 200ms ease, box-shadow 200ms ease;
  }

  /* The exercise currently underway: pinned to the top by priorityCue, lifted
     slightly, and pushed away from the cards below. */
  .priority-card.active {
    margin-bottom: 0.7rem;
    box-shadow: 0 0 0 1px var(--card-ring-active), 0 1px 2px rgba(44, 57, 71, 0.12), 0 8px 22px rgba(44, 57, 71, 0.12);
  }

  .card-body {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.9rem;
    min-width: 0;
    padding: 0.85rem 1rem;
  }

  .priority-rank {
    font-size: 1.05rem;
    font-weight: 700;
    opacity: 0.3;
    min-width: 1.25rem;
    text-align: right;
  }

  .priority-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }

  .priority-name { font-weight: 700; font-size: 1rem; }
  .priority-last { font-size: 0.8rem; opacity: 0.5; }

  .priority-status { font-size: 0.8rem; font-weight: 500; }

  .phase-exercise { color: var(--phase-exercise-ink); }
  .phase-rest { color: var(--phase-rest-ink); }

  .timer-elapsed {
    flex-shrink: 0;
    font-size: 1.75rem;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .card-actions {
    display: flex;
    align-items: stretch;
    flex-shrink: 0;
  }

  .btn-set {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    text-align: left;
    border: none;
    border-left: 1px solid var(--card-border);
    border-radius: 0;
    background: var(--segment-bg);
    color: inherit;
    font-size: 0.85rem;
    line-height: 1;
    padding: 0 0.9rem;
    min-width: 9rem;
  }

  .btn-set:not(:disabled):hover { background: var(--segment-hover); }

  .btn-set.phase-exercise {
    background: var(--phase-exercise-bg);
    color: var(--phase-exercise-text);
    border-left-color: transparent;
  }
  .btn-set.phase-exercise:hover { background: var(--phase-exercise-hover); }

  .btn-set.phase-rest {
    background: var(--phase-rest-bg);
    color: var(--phase-rest-text);
    border-left-color: transparent;
  }
  .btn-set.phase-rest:hover { background: var(--phase-rest-hover); }

  .btn-set :global(svg) { flex-shrink: 0; }

  .set-action { font-size: 0.9rem; font-weight: 500; line-height: 1.2; }

  .set-idle { display: flex; flex-direction: column; gap: 0.15rem; }

  .set-hint { font-size: 0.72rem; opacity: 0.6; white-space: nowrap; }

  .log-slot {
    position: relative;
    display: flex;
    align-items: stretch;
  }

  .log-slot .btn-undo {
    position: absolute;
    inset: 0;
  }

  .split-log {
    position: relative;
    display: flex;
    align-items: stretch;
  }

  .split-log.invisible {
    visibility: hidden;
    pointer-events: none;
  }

  .btn-log-main {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    border: none;
    border-radius: 0;
    padding: 0 1.15rem;
    font-size: 0.9rem;
    min-width: 5.5rem;
    white-space: nowrap;
  }

  .btn-log-arrow {
    position: relative;
    display: flex;
    align-items: center;
    border: none;
    border-radius: 0 12px 12px 0;
    padding: 0 0.6rem;
    line-height: 1;
    background: var(--split-arrow-bg);
  }

  .btn-log-arrow:hover { background: var(--interactive-hover); }

  /* Divider drawn in the button's own text color so it reads on the navy
     (light theme) and on the gold (dark theme) alike. */
  .btn-log-arrow::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 1px;
    background: currentColor;
    opacity: 0.35;
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

  .log-dropdown .cancel-item { color: #ef4444; }

  /* Dropdown items sit on --interactive, which is gold in dark theme — bright
     red would barely read against it. */
  @media (prefers-color-scheme: dark) {
    :global(html:not([data-theme='light'])) .log-dropdown .cancel-item { color: #7f1d1d; }
  }

  :global(html[data-theme='dark']) .log-dropdown .cancel-item { color: #7f1d1d; }

  .btn-undo {
    position: relative;
    overflow: hidden;
    border: none;
    border-radius: 0 12px 12px 0;
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

  @media (max-width: 480px) {
    .card-body { padding: 0.7rem 0.75rem; gap: 0.6rem; }
    /* Narrow: two rows — name, status and timer on top, the buttons in a full
       row underneath — so neither squeezes the other. */
    .priority-card { flex-direction: column; }
    .card-actions { border-top: 1px solid var(--card-border); }
    .btn-set { flex: 1; min-width: 0; min-height: 2.9rem; padding: 0 0.75rem; border-left: none; border-radius: 0 0 0 7px; }
    .btn-log-arrow, .btn-undo { border-radius: 0 0 12px 0; }
    .timer-elapsed { font-size: 1.5rem; }
    .btn-log-main { min-width: 0; padding: 0 1rem; }
  }
</style>
