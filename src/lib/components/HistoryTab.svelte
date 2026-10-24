<script lang="ts">
  import { store } from '$lib/store.svelte';
  import type { Exercise } from '$lib/types';
  import { today, fmtDate } from '$lib/utils';
  import {
    HISTORY_RANGES, historyWindow, bucketIndex, daysBetween,
    idealGap, cadenceDeviation, cadenceColor, cadenceVerdict, fmtIdeal, type HistoryRange,
  } from '$lib/history';

  let range = $state<HistoryRange>('month');
  // The column (and exercise row, or null for the totals bar) the readout describes.
  let selected = $state<{ row: string | null; col: number } | null>(null);
  let listOpen = $state(false);

  const win = $derived(historyWindow(range, today()));
  const cols = $derived(win.buckets.length);

  /** One logged session; `gap` is days since the exercise's previous session, null the first time. */
  type Session = { date: string; gap: number | null };
  type Row = { exercise: Exercise; ideal: number; cells: Session[][]; total: number };

  function thresholds(exercise: Exercise) {
    return exercise.colorOverride ?? store.settings;
  }

  // One row per exercise in the active schema, most done first. Gaps are
  // measured against the exercise's whole history, so the first session in
  // the window is still compared with the one before it.
  const rows = $derived.by((): Row[] => {
    const datesById = new Map<string, Set<string>>(store.activeExercises.map(e => [e.id, new Set()]));
    for (const entry of store.entries) {
      if (!entry.deletedAt) datesById.get(entry.exerciseId)?.add(entry.date);
    }
    return store.activeExercises
      .map(exercise => {
        const { yellowAfterDays, redAfterDays } = thresholds(exercise);
        const row: Row = { exercise, ideal: idealGap(yellowAfterDays, redAfterDays), cells: win.buckets.map(() => []), total: 0 };
        const dates = [...datesById.get(exercise.id)!].sort();
        dates.forEach((date, i) => {
          const col = bucketIndex(win, date);
          if (col < 0) return;
          row.cells[col].push({ date, gap: i > 0 ? daysBetween(dates[i - 1], date) : null });
          row.total++;
        });
        return row;
      })
      .sort((a, b) => b.total - a.total || a.exercise.name.localeCompare(b.exercise.name));
  });

  const totals = $derived(win.buckets.map((_, i) => rows.reduce((sum, r) => sum + r.cells[i].length, 0)));
  const peak = $derived(Math.max(0, ...totals));

  /**
   * How a cell is drawn: 'none', 'first' (nothing earlier to compare with), or
   * the cadence color — for a week or month, of the sessions' average distance
   * from the ideal.
   */
  function cellLook(row: Row, sessions: Session[]): { kind: 'none' | 'first' | 'done'; color?: string } {
    if (sessions.length === 0) return { kind: 'none' };
    const devs = sessions.filter(s => s.gap !== null).map(s => Math.abs(cadenceDeviation(s.gap!, row.ideal)));
    if (devs.length === 0) return { kind: 'first' };
    return { kind: 'done', color: cadenceColor(devs.reduce((a, b) => a + b, 0) / devs.length) };
  }

  function describeGap(row: Row, s: Session): string {
    if (s.gap === null) return 'first time';
    return `${s.gap} ${s.gap === 1 ? 'day' : 'days'}, ${cadenceVerdict(cadenceDeviation(s.gap, row.ideal))}`;
  }

  // Dates with anything logged, newest first — the list view and the summary.
  const days = $derived.by(() => {
    const byDate = new Map<string, string[]>();
    for (const row of rows) {
      for (const s of row.cells.flat()) {
        byDate.set(s.date, [...(byDate.get(s.date) ?? []), `${row.exercise.name} (${describeGap(row, s)})`]);
      }
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, names]) => ({ date, names: names.sort((a, b) => a.localeCompare(b)) }));
  });

  const logged = $derived(rows.reduce((sum, r) => sum + r.total, 0));

  const summary = $derived.by(() => {
    if (logged === 0) return 'Nothing logged in this period.';
    const where = store.liveSchemas.length > 1 && store.activeSchema ? ` in ${store.activeSchema.name}` : '';
    return `Trained on ${days.length} ${days.length === 1 ? 'day' : 'days'}${where} · ${logged} ${logged === 1 ? 'exercise' : 'exercises'} logged.`;
  });

  function rowReadout(row: Row, sessions: Session[]): string {
    if (sessions.length === 0) return 'Not done';
    if (sessions.length === 1) {
      const { gap } = sessions[0];
      if (gap === null) return 'First time logged';
      return `${gap} ${gap === 1 ? 'day' : 'days'} since the previous time — ${cadenceVerdict(cadenceDeviation(gap, row.ideal))}`;
    }
    const gaps = sessions.filter(s => s.gap !== null).map(s => s.gap!);
    if (gaps.length === 0) return `${sessions.length} times`;
    const list = gaps.length > 1 ? `${gaps.slice(0, -1).join(', ')} and ${gaps.at(-1)}` : String(gaps[0]);
    return `${sessions.length} times · ${list} days apart`;
  }

  const readout = $derived.by((): { value: string; context: string } | null => {
    const bucket = selected && win.buckets[selected.col];
    if (!selected || !bucket) return null;
    const col = selected.col;
    if (selected.row) {
      const row = rows.find(r => r.exercise.id === selected!.row);
      if (!row) return null;
      return {
        value: rowReadout(row, row.cells[col]),
        context: `${row.exercise.name} · ${bucket.label} · ideal gap ${fmtIdeal(row.ideal)}`,
      };
    }
    const done = rows
      .filter(r => r.cells[col].length > 0)
      .map(r => (win.unit === 'day' ? r.exercise.name : `${r.exercise.name} (${r.cells[col].length})`));
    return {
      value: `${totals[col]} logged`,
      context: done.length ? `${bucket.label} · ${done.join(', ')}` : bucket.label,
    };
  });

  // The legend uses the app-wide thresholds; an exercise with its own colors
  // has its own ideal, which the readout names.
  const legend = $derived.by(() => {
    const ideal = idealGap(store.settings.yellowAfterDays, store.settings.redAfterDays);
    const last = Math.ceil(ideal) + Math.max(Math.floor(ideal) - 1, 2);
    return {
      ideal,
      gaps: Array.from({ length: last }, (_, i) => ({
        label: i + 1 === last ? `${last}+` : String(i + 1),
        color: cadenceColor(cadenceDeviation(i + 1, ideal)),
      })),
      hasOverrides: rows.some(r => r.exercise.colorOverride),
    };
  });

  // The chart is one delegated hit area: every bar slot and cell carries its
  // column (and row). Mouse hover previews; a tap or click picks.
  function pick(e: Event) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-col]');
    if (el) selected = { row: el.dataset.row ?? null, col: Number(el.dataset.col) };
  }

  function setRange(id: HistoryRange) {
    range = id;
    selected = null;
  }
</script>

<section class="history">
  <div class="range-picker" role="group" aria-label="Time range">
    {#each HISTORY_RANGES as r (r.id)}
      <button class="range-btn" class:active={range === r.id} aria-pressed={range === r.id} onclick={() => setRange(r.id)}>
        {r.label}
      </button>
    {/each}
  </div>

  {#if rows.length === 0}
    <p class="empty">No exercises yet. Add some in the Setup exercises tab.</p>
  {:else}
    <p class="history-hint">{summary}</p>

    <div class="readout" aria-live="polite">
      {#if readout}
        <span class="readout-value">{readout.value}</span>
        <span class="readout-context">{readout.context}</span>
      {:else}
        <span class="readout-context">Tap the chart to see what you did when.</span>
      {/if}
    </div>

    <!-- The list below is the keyboard and screen-reader view of the same data. -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div
      class="chart"
      class:dense={cols > 40}
      style="--cols: {cols}"
      onclick={pick}
      onpointerover={(e) => { if (e.pointerType === 'mouse') pick(e); }}
      onpointerleave={(e) => { if (e.pointerType === 'mouse') selected = null; }}
    >
      <div class="chart-label">
        <span>Exercises logged per {win.unit}</span>
        {#if peak > 0}<span class="chart-peak">peak {peak}</span>{/if}
      </div>
      <div class="bars" role="img" aria-label="Exercises logged per {win.unit}, peak {peak}">
        {#each totals as total, i}
          <div class="bar-slot" class:selected={selected?.col === i && selected.row === null} data-col={i}>
            {#if total > 0}<div class="bar" style="height: {(total / peak) * 100}%"></div>{/if}
          </div>
        {/each}
      </div>
      <div class="axis" aria-hidden="true">
        {#each win.buckets as bucket, i}
          {#if bucket.tick}<span style="grid-column: {i + 1}">{bucket.tick}</span>{/if}
        {/each}
      </div>

      {#each rows as row (row.exercise.id)}
        <div class="row-head" class:row-disabled={row.exercise.disabled}>
          <span class="row-name">{row.exercise.name}</span>
          <span class="row-total">{row.total}</span>
        </div>
        <div class="cells" role="img" aria-label="{row.exercise.name}: {row.total} in this period">
          {#each row.cells as sessions, i}
            {@const look = cellLook(row, sessions)}
            <div
              class="cell {look.kind}"
              class:selected={selected?.col === i && selected.row === row.exercise.id}
              style={look.color ? `--cadence: ${look.color}` : undefined}
              data-row={row.exercise.id}
              data-col={i}
            ></div>
          {/each}
        </div>
      {/each}
    </div>

    <div class="legend">
      <span>Days since the previous time:</span>
      <span class="legend-scale">
        {#each legend.gaps as gap (gap.label)}
          <span class="legend-step">
            <span class="legend-swatch done" style="--cadence: {gap.color}"></span>{gap.label}
          </span>
        {/each}
      </span>
      <span class="legend-item"><span class="legend-swatch first"></span>First time</span>
      <span class="legend-item"><span class="legend-swatch none"></span>Not done</span>
    </div>
    <p class="legend-note">
      Green is the ideal gap: {fmtIdeal(legend.ideal)}, halfway between when the workout queue turns
      yellow and red (set in Settings). Sooner or later fades through yellow and orange to red.
      {#if win.unit !== 'day'}A {win.unit} shows its sessions' average.{/if}
      {#if legend.hasOverrides}Exercises with their own queue colors have their own ideal.{/if}
    </p>

    <details class="day-list" bind:open={listOpen}>
      <summary>List by date ({days.length} {days.length === 1 ? 'day' : 'days'})</summary>
      {#if listOpen}
        {#if days.length === 0}
          <p class="day-list-empty">Nothing logged in this period.</p>
        {:else}
          <ul>
            {#each days as day (day.date)}
              <li>
                <span class="day-date">{fmtDate(day.date)}</span>
                <span class="day-names">{day.names.join(', ')}</span>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    </details>
  {/if}
</section>

<style>
  .history { --cell-empty: rgba(128, 128, 128, 0.14); }

  .range-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-bottom: 1rem;
  }

  .range-btn {
    padding: 0.35rem 0.75rem;
    font-size: 0.85rem;
    border-radius: 999px;
    background: none;
    border: 1px solid rgba(128, 128, 128, 0.35);
    color: inherit;
  }

  .range-btn:hover { background: rgba(128, 128, 128, 0.1); }

  .range-btn.active {
    background: var(--interactive);
    border-color: var(--interactive);
    color: var(--interactive-text);
  }

  .history-hint {
    font-size: 0.875rem;
    opacity: 0.55;
    margin: 0 0 0.75rem;
  }

  /* Fixed height, so picking a cell never shifts the chart under the finger. */
  .readout {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: 3.7rem;
    margin-bottom: 0.5rem;
    line-height: 1.3;
  }

  .readout-value { font-weight: 700; font-size: 0.95rem; }

  .readout-context {
    font-size: 0.8rem;
    opacity: 0.6;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }

  .chart {
    --gap: 2px;
    --radius: 3px;
    background: var(--card-bg);
    border-radius: 12px;
    box-shadow: 0 0 0 1px var(--card-ring), 0 1px 2px rgba(44, 57, 71, 0.1), 0 6px 16px rgba(44, 57, 71, 0.07);
    padding: 0.85rem 1rem 1rem;
    touch-action: manipulation;
  }

  .chart.dense { --gap: 1px; --radius: 1px; }

  .chart-label {
    display: flex;
    justify-content: space-between;
    font-size: 0.78rem;
    opacity: 0.55;
    margin-bottom: 0.35rem;
  }

  .chart-peak { font-variant-numeric: tabular-nums; }

  .bars, .axis, .cells {
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    column-gap: var(--gap);
  }

  .bars {
    height: 56px;
    align-items: end;
    border-bottom: 1px solid var(--card-border);
  }

  .bar-slot {
    height: 100%;
    display: flex;
    align-items: flex-end;
    border-radius: var(--radius) var(--radius) 0 0;
    cursor: pointer;
  }

  .bar-slot.selected { background: rgba(128, 128, 128, 0.14); }
  .bar-slot.selected .bar { opacity: 0.6; }

  .bar {
    width: 100%;
    min-height: 2px;
    background: var(--accent);
    border-radius: var(--radius) var(--radius) 0 0;
  }

  .axis {
    height: 1.4rem;
    margin-bottom: 0.4rem;
    font-size: 0.7rem;
    opacity: 0.5;
    font-variant-numeric: tabular-nums;
  }

  .axis span {
    grid-row: 1;
    padding-top: 0.2rem;
    white-space: nowrap;
  }

  .row-head {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    margin: 0.55rem 0 0.2rem;
    font-size: 0.82rem;
  }

  .row-name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-disabled .row-name { opacity: 0.5; }

  .row-total {
    opacity: 0.55;
    font-variant-numeric: tabular-nums;
  }

  .cell {
    height: 16px;
    border-radius: var(--radius);
    cursor: pointer;
  }

  .cell.selected {
    outline: 2px solid var(--text);
    outline-offset: 1px;
    position: relative;
    z-index: 1;
  }

  .none { background: var(--cell-empty); }

  /* Toned like the queue's urgency stripe, so dark mode isn't neon. */
  .done { background: color-mix(in oklab, var(--cadence) var(--urgency-strength), #e8e0d6); }

  /* Nothing earlier to compare with: an outline, not a color on the scale. */
  .first {
    background: var(--cell-empty);
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--text) 55%, transparent);
  }

  .dense .first { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text) 55%, transparent); }

  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem 0.8rem;
    margin-top: 0.75rem;
    font-size: 0.78rem;
    /* Dim the text only — the swatches must match the cells exactly. */
    color: color-mix(in srgb, var(--text) 70%, transparent);
  }

  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }

  .legend-swatch {
    width: 12px;
    height: 12px;
    border-radius: 3px;
  }

  .legend-scale {
    display: inline-flex;
    gap: 2px;
  }

  /* Each step is its swatch with the day count under it. */
  .legend-step {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
    min-width: 16px;
    font-size: 0.7rem;
    font-variant-numeric: tabular-nums;
  }

  .legend-step .legend-swatch { width: 100%; }

  .legend-note {
    margin: 0.5rem 0 0;
    font-size: 0.78rem;
    opacity: 0.55;
  }

  .day-list {
    margin-top: 1.5rem;
    font-size: 0.875rem;
  }

  .day-list summary {
    cursor: pointer;
    font-weight: 500;
    opacity: 0.75;
  }

  .day-list ul {
    list-style: none;
    padding: 0;
    margin: 0.75rem 0 0;
    display: flex;
    flex-direction: column;
  }

  .day-list li {
    display: flex;
    flex-direction: column;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--card-border);
  }

  .day-date { font-size: 0.78rem; opacity: 0.55; }

  .day-list-empty { opacity: 0.55; margin: 0.75rem 0 0; }
</style>
