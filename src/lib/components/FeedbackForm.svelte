<script lang="ts">
  import { version } from '../../../package.json';

  const FEEDBACK_EMAIL = 'sysop@hellocyberspace.com';

  let message = $state('');
  let status = $state<'idle' | 'sent'>('idle');

  function submitFeedback(e: SubmitEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    const subject = `The Process feedback (v${version})`;
    // Hand the message to the user's own email app; nothing is sent from here.
    window.location.href =
      `mailto:${FEEDBACK_EMAIL}` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(message.trim())}`;
    // Keep the message: the user may still cancel in their email app.
    status = 'sent';
  }
</script>

{#if status === 'sent'}
  <div class="feedback-success">
    Your email app should have opened — just hit send there. Thanks!
    <button class="btn-link" onclick={() => (status = 'idle')}>Send more</button>
  </div>
{:else}
  <form class="feedback-form" onsubmit={submitFeedback}>
    <div class="field">
      <label for="fb-message">Message</label>
      <textarea
        id="fb-message"
        rows="5"
        placeholder="What's on your mind?"
        bind:value={message}
      ></textarea>
    </div>
    <p class="hint">
      Opens your email app with a message to
      <a href="mailto:{FEEDBACK_EMAIL}">{FEEDBACK_EMAIL}</a>.
    </p>
    <button type="submit" disabled={!message.trim()}>Send feedback</button>
  </form>
{/if}

<style>
  .feedback-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .feedback-form button { align-self: flex-start; padding: 0.6rem 1.25rem; }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .field label {
    font-size: 0.9rem;
    font-weight: 500;
  }

  .hint {
    font-size: 0.85rem;
    opacity: 0.7;
    margin: 0;
  }

  .field textarea {
    resize: vertical;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    border: 1px solid rgba(128, 128, 128, 0.35);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.9rem;
    outline: none;
  }

  .field textarea:focus { border-color: var(--accent); }

  .feedback-success {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.3);
    border-radius: 10px;
    padding: 0.75rem 1rem;
    font-size: 0.9rem;
    font-weight: 500;
  }

  .btn-link {
    background: none;
    border: none;
    padding: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--accent);
    cursor: pointer;
    text-decoration: underline;
  }

  .btn-link:hover { opacity: 0.75; background: none; }
</style>
