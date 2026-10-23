<script lang="ts">
  let open = $state(false);
</script>

<div class="privacy-policy">
  <button class="privacy-toggle" onclick={() => (open = !open)} aria-expanded={open}>
    Privacy policy
    <span class="privacy-chevron" class:open>›</span>
  </button>

  {#if open}
    <div class="privacy-body">
      <p><strong>Last updated: October 2026</strong></p>

      <p>The Process Tracker is designed to respect your privacy. This policy explains what little data the app touches and why.</p>

      <h3>Data stored locally</h3>
      <p>Your exercises, workout log, and settings are stored in your browser on this device. We never read or upload this data unless you create an account or log in.</p>

      <h3>Accounts (optional)</h3>
      <p>An account lets you sync your workout data between devices through our server (<code>api.theprocesstracker.com</code>). It consists of a username you choose and your password, which is stored only as a one-way hash. Logging in places a cookie in your browser that keeps you logged in; it is used for nothing else.</p>
      <p>You may add an email address to your account. It is used only to send you a link to confirm it and, if you ask for one, a password reset link — never for newsletters or anything else.</p>
      <p>Logging out removes your data from that browser. You can delete your account, and everything synced to it, at any time from the Settings tab.</p>

      <h3>Older anonymous sync accounts</h3>
      <p>Earlier versions of the app created anonymous sync accounts made of a random GUID and secret key. These keep working, and can be turned into a regular account from the Settings tab.</p>

      <h3>Feedback form (optional)</h3>
      <p>The feedback form lets you send us a message. You may optionally include your email address if you'd like a reply. Submitted messages and any email address you provide are used solely to respond to your feedback and are not shared with third parties.</p>

      <h3>No tracking, no ads</h3>
      <p>We do not use analytics, advertising SDKs, or any form of behavioural tracking.</p>

      <h3>Contact</h3>
      <p>Questions about this policy? Use the feedback form above.</p>
    </div>
  {/if}
</div>

<style>
  .privacy-toggle {
    background: none;
    border: none;
    padding: 0;
    font-size: 0.85rem;
    font-weight: 500;
    color: inherit;
    opacity: 0.6;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .privacy-toggle:hover { opacity: 1; background: none; }

  .privacy-chevron {
    display: inline-block;
    font-size: 1rem;
    line-height: 1;
    transition: transform 0.2s ease;
  }

  .privacy-chevron.open { transform: rotate(90deg); }

  .privacy-body {
    margin-top: 1rem;
    font-size: 0.85rem;
    line-height: 1.6;
    opacity: 0.75;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    text-align: left;
  }

  .privacy-body p { margin: 0; }

  .privacy-body h3 {
    font-size: 0.85rem;
    font-weight: 700;
    margin: 0.75rem 0 0;
  }

  .privacy-body code {
    font-family: monospace;
    font-size: 0.8rem;
    background: rgba(128, 128, 128, 0.12);
    border-radius: 4px;
    padding: 0.1em 0.3em;
  }
</style>
