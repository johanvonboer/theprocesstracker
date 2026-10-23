<script lang="ts">
  import QrScanner from 'qr-scanner';
  import { showToast } from '$lib/toasts.svelte';

  // A generic widget rather than app UI, so unlike the tabs it takes props:
  // what to do with a scanned code, and how to close.
  let { onscan, onclose, hint = '' }: {
    onscan: (text: string) => void;
    onclose: () => void;
    hint?: string;
  } = $props();

  let videoEl = $state<HTMLVideoElement | null>(null);

  $effect(() => {
    if (!videoEl) return;
    let done = false;
    const scanner = new QrScanner(
      videoEl,
      (result) => {
        if (done) return;
        done = true;
        scanner.stop();
        onscan(result.data);
      },
      { returnDetailedScanResult: true, highlightScanRegion: true },
    );
    scanner.start().catch(() => {
      showToast('Could not access the camera');
      onclose();
    });
    return () => scanner.destroy();
  });
</script>

<div class="qr-overlay">
  <button class="qr-back" onclick={onclose}>← Back</button>
  <div class="qr-content">
    <video bind:this={videoEl} class="scan-video"></video>
    {#if hint}<p class="qr-hint">{hint}</p>{/if}
  </div>
</div>

<style>
  .qr-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: var(--bg);
    display: flex;
    flex-direction: column;
  }

  .qr-back {
    align-self: flex-start;
    background: none;
    border: none;
    padding: 1rem 1.25rem;
    font-size: 1rem;
    color: inherit;
    opacity: 0.7;
    cursor: pointer;
  }

  .qr-back:hover { opacity: 1; background: none; }

  .qr-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.25rem;
    padding: 1rem 2rem 3rem;
  }

  .scan-video { width: 100%; max-width: 480px; border-radius: 12px; display: block; }

  .qr-hint {
    font-size: 0.9rem;
    opacity: 0.6;
    text-align: center;
    margin: 0;
    max-width: 320px;
  }
</style>
