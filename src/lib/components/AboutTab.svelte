<script lang="ts">
  import { version } from '../../../package.json';

  const FEEDBACK_URL = 'https://api.theprocesstracker.com/api/v1/feedback';

  let message = $state('');
  let email = $state('');
  let status = $state<'idle' | 'sending' | 'sent' | 'error'>('idle');
  let errorText = $state('');
  let privacyOpen = $state(false);

  async function submitFeedback() {
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

<section class="about">
  <h2>The Process Tracker</h2>
  <p class="about-hint">v{version}</p>

  <a class="website-link" href="https://theprocesstracker.com" target="_blank" rel="noopener noreferrer">
    theprocesstracker.com ↗
  </a>

  <div class="license-block">
    <span class="license-badge">MIT License</span>
    <p class="license-text">
      Copyright © {new Date().getFullYear()} The Process Tracker contributors.
      Permission is granted to use, copy, modify, and distribute this software
      under the terms of the MIT License.
    </p>
  </div>

  <div class="author-note">
    <p>Hi I'm Johan, and I built The Process Tracker because I wanted a workout app that is simple, private, and just for tracking my workouts, nothing else. No unwanted data collection, no ads. Just me and the process.</p>
    <p>Let me know if you have any suggestions or feedback!</p>
    <p class="author-sig">Johan</p>
  </div>

  <h2 style="margin-top: 1.75rem;">Send feedback</h2>
  <p class="about-hint">Bug reports, feature requests, or anything else on your mind.</p>

  {#if status === 'sent'}
    <div class="feedback-success">
      Thanks — your feedback was received!
      <button class="btn-link" onclick={() => (status = 'idle')}>Send more</button>
    </div>
  {:else}
    <div class="feedback-form">
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
        <label for="fb-email">Email <span class="optional">(optional)</span></label>
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
      <button
        onclick={submitFeedback}
        disabled={status === 'sending' || !message.trim()}
      >
        {status === 'sending' ? 'Sending…' : 'Send feedback'}
      </button>
    </div>
  {/if}

  <div class="privacy-section">
    <button class="privacy-toggle" onclick={() => (privacyOpen = !privacyOpen)}>
      Privacy Policy
      <span class="privacy-chevron" class:open={privacyOpen}>›</span>
    </button>

    {#if privacyOpen}
      <div class="privacy-body">
        <p><strong>Last updated: May 2026</strong></p>

        <p>The Process Tracker is designed to respect your privacy. This policy explains what little data the app touches and why.</p>

        <h3>Data stored locally</h3>
        <p>Your exercises, workout log, and settings are stored only on your device. We never read or upload this data unless you explicitly enable remote sync.</p>

        <h3>Remote sync (optional)</h3>
        <p>If you choose to activate sync, an anonymous account is created on our server (<code>api.theprocesstracker.com</code>). It consists of a random GUID and a secret key — no name, email, or personal identifier is required or collected. Your workout data is synced to this account so it can be shared across your devices. You can unlink and delete your account at any time from the Settings tab.</p>

        <h3>Feedback form (optional)</h3>
        <p>The feedback form lets you send us a message. You may optionally include your email address if you'd like a reply. Submitted messages and any email address you provide are used solely to respond to your feedback and are not shared with third parties.</p>

        <h3>No tracking, no ads</h3>
        <p>We do not use analytics, advertising SDKs, or any form of behavioural tracking.</p>

        <h3>Contact</h3>
        <p>Questions about this policy? Use the feedback form above.</p>
      </div>
    {/if}
  </div>
</section>

<style>
  .about h2 { margin: 0 0 0.35rem; font-size: 1.05rem; }

  .about-hint {
    font-size: 0.85rem;
    opacity: 0.55;
    margin: 0 0 1.25rem;
  }

  .website-link {
    display: inline-block;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--accent);
    text-decoration: none;
    margin-bottom: 1.5rem;
  }

  .website-link:hover { text-decoration: underline; }

  .license-block {
    background: rgba(128, 128, 128, 0.07);
    border: 1px solid rgba(128, 128, 128, 0.15);
    border-radius: 10px;
    padding: 0.85rem 1rem;
  }

  .license-badge {
    display: inline-block;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    background: rgba(128, 128, 128, 0.15);
    border-radius: 5px;
    padding: 0.15rem 0.5rem;
    margin-bottom: 0.5rem;
  }

  .license-text {
    font-size: 0.82rem;
    opacity: 0.6;
    margin: 0;
    line-height: 1.55;
  }

  .author-note {
    margin-top: 1.5rem;
    border-left: 3px solid var(--accent);
    padding-left: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .author-note p {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.6;
    opacity: 0.8;
  }

  .author-sig {
    font-weight: 600;
    opacity: 1 !important;
  }

  .feedback-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

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
    opacity: 0.5;
  }

  .field textarea,
  .field input {
    resize: vertical;
  }

  .feedback-success {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: rgba(34, 197, 94, 0.08);
    border: 1px solid rgba(34, 197, 94, 0.25);
    border-radius: 10px;
    padding: 0.75rem 1rem;
    font-size: 0.9rem;
    font-weight: 500;
  }

  .feedback-error {
    font-size: 0.85rem;
    color: var(--color-accent1, #ef4444);
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

  .privacy-section {
    margin-top: 2rem;
    border-top: 1px solid rgba(128, 128, 128, 0.15);
    padding-top: 1rem;
  }

  .privacy-toggle {
    background: none;
    border: none;
    padding: 0;
    font-size: 0.85rem;
    font-weight: 500;
    color: inherit;
    opacity: 0.45;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .privacy-toggle:hover { opacity: 0.75; background: none; }

  .privacy-chevron {
    display: inline-block;
    font-size: 1rem;
    line-height: 1;
    transition: transform 0.2s ease;
    transform: rotate(0deg);
  }

  .privacy-chevron.open { transform: rotate(90deg); }

  .privacy-body {
    margin-top: 1rem;
    font-size: 0.82rem;
    line-height: 1.6;
    opacity: 0.7;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .privacy-body p { margin: 0; }

  .privacy-body h3 {
    font-size: 0.82rem;
    font-weight: 700;
    margin: 0.75rem 0 0;
    opacity: 1;
  }

  .privacy-body code {
    font-family: monospace;
    font-size: 0.8rem;
    background: rgba(128, 128, 128, 0.12);
    border-radius: 4px;
    padding: 0.1em 0.3em;
  }
</style>
