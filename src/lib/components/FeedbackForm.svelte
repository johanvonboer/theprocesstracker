<script lang="ts">
  import { API_URL } from '$lib/api';

  const FEEDBACK_URL = `${API_URL}/api/v1/feedback`;

  let message = $state('');
  let email = $state('');
  let status = $state<'idle' | 'sending' | 'sent' | 'error'>('idle');
  let errorText = $state('');

  async function submitFeedback(e: SubmitEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    status = 'sending';
    errorText = '';
    try {
      const res = await fetch(FEEDBACK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim(), email: email.trim() || undefined }),
      });
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      status = 'sent';
      message = '';
      email = '';
    } catch (e) {
      status = 'error';
      errorText = e instanceof Error ? e.message : 'Something went wrong';
    }
  }
</script>

{#if status === 'sent'}
  <div class="feedback-success">
    Thanks — your feedback was received!
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
        disabled={status === 'sending'}
      ></textarea>
    </div>
    <div class="field">
      <label for="fb-email">Email <span class="optional">(optional, if you'd like a reply)</span></label>
      <input
        id="fb-email"
        type="email"
        placeholder="you@example.com"
        bind:value={email}
        disabled={status === 'sending'}
      />
    </div>
    {#if status === 'error'}
      <p class="feedback-error">{errorText}</p>
    {/if}
    <button type="submit" disabled={status === 'sending' || !message.trim()}>
      {status === 'sending' ? 'Sending…' : 'Send feedback'}
    </button>
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

  .optional {
    font-size: 0.8rem;
    font-weight: 400;
    opacity: 0.55;
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

  .feedback-error {
    font-size: 0.85rem;
    color: #ef4444;
    margin: 0;
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
