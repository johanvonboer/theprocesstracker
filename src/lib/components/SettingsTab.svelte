<script lang="ts">
  import { store } from '$lib/store.svelte';
  import { urgencyColorFromDays } from '$lib/utils';
  import AccountSection from './AccountSection.svelte';
</script>

<section class="settings">
  <AccountSection />

  <h2 style="margin-top: 1.75rem;">Workout queue colors</h2>
  <p class="settings-hint">
    Controls how quickly the left-hand color strip transitions from green through yellow to red.
  </p>

  <div class="setting-row">
    <label for="yellow-days">Turn yellow after</label>
    <div class="slider-row">
      <input
        id="yellow-days"
        type="range" min="1" max="6"
        value={store.settings.yellowAfterDays}
        oninput={(e) => {
          const val = Number((e.target as HTMLInputElement).value);
          const red = store.settings.redAfterDays;
          store.updateSettings({ yellowAfterDays: Math.min(val, red - 1) });
        }}
      />
      <span class="slider-value">{store.settings.yellowAfterDays} {store.settings.yellowAfterDays === 1 ? 'day' : 'days'}</span>
    </div>
  </div>

  <div class="setting-row">
    <label for="red-days">Turn red after</label>
    <div class="slider-row">
      <input
        id="red-days"
        type="range" min="2" max="7"
        value={store.settings.redAfterDays}
        oninput={(e) => {
          const val = Number((e.target as HTMLInputElement).value);
          const yellow = store.settings.yellowAfterDays;
          store.updateSettings({ redAfterDays: Math.max(val, yellow + 1) });
        }}
      />
      <span class="slider-value">{store.settings.redAfterDays} {store.settings.redAfterDays === 1 ? 'day' : 'days'}</span>
    </div>
  </div>

  <div class="color-preview">
    {#each Array.from({ length: store.settings.redAfterDays + 1 }, (_, i) => i) as day}
      <div class="preview-swatch" style="background: {urgencyColorFromDays(day, store.settings.yellowAfterDays, store.settings.redAfterDays)}">
        <span>{day === 0 ? 'Today' : day === 1 ? '1 day' : `${day} days`}</span>
      </div>
    {/each}
  </div>
</section>

<style>
  .settings h2 { margin: 0 0 0.35rem; font-size: 1.05rem; }

  .settings-hint {
    font-size: 0.85rem;
    opacity: 0.55;
    margin: 0 0 1.5rem;
  }

  .setting-row {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-bottom: 1.25rem;
  }

  .setting-row label { font-size: 0.9rem; font-weight: 500; }

  .slider-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .slider-row input[type='range'] {
    flex: 1;
    border: none;
    padding: 0;
    accent-color: var(--accent);
    cursor: pointer;
  }

  .slider-value {
    font-size: 0.875rem;
    font-weight: 600;
    min-width: 4rem;
  }

  .color-preview {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
    margin-top: 1.5rem;
  }

  .preview-swatch {
    border-radius: 8px;
    padding: 0.4rem 0.6rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: #fff;
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
    white-space: nowrap;
  }
</style>
