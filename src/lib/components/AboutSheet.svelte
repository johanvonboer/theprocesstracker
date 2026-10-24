<script lang="ts">
  import { version } from '../../../package.json';
  import { closeOverlay } from '$lib/ui.svelte';
  import Modal from './Modal.svelte';
  import FeedbackForm from './FeedbackForm.svelte';
  import PrivacyPolicy from './PrivacyPolicy.svelte';
</script>

<Modal label="About The Process" onclose={closeOverlay} sheet>
  <div class="about">
    <header class="about-header">
      <h1 class="brand-name">The Process</h1>
      <p class="meta">
        v{version} · MIT License · © {new Date().getFullYear()} The Process Tracker contributors
      </p>
    </header>

    <section>
      <h2>Send feedback</h2>
      <p class="section-subtitle">Bug reports, feature requests, or anything else on your mind.</p>
      <div class="card"><FeedbackForm /></div>
    </section>

    <section>
      <PrivacyPolicy />
    </section>
  </div>
</Modal>

<style>
  .about {
    max-width: 680px;
    margin: 0 auto;
    padding: 2rem 1rem 3rem;
    display: flex;
    flex-direction: column;
    gap: 2.5rem;
  }

  .about-header { text-align: center; }

  .brand-name {
    margin: 0;
    font-family: 'Iceland', sans-serif;
    font-size: 3rem;
    font-weight: 400;
    line-height: 1;
  }

  .meta { margin: 0.5rem 0 0; font-size: 0.8rem; opacity: 0.6; }

  h2 { margin: 0 0 0.35rem; font-size: 1.25rem; font-weight: 700; }

  .section-subtitle { margin: 0 0 1rem; font-size: 0.9rem; opacity: 0.65; }

  .card {
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 12px;
    padding: 1.5rem 1.25rem;
    box-shadow: var(--shadow-card);
  }
</style>
