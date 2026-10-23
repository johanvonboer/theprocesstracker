<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<main class="auth">
  <a class="auth-brand" href="/">The Process</a>
  <div class="auth-card">
    {@render children()}
  </div>
  <a class="auth-back" href="/">← Back to the app</a>
</main>

<style>
  .auth {
    max-width: 420px;
    margin: 0 auto;
    padding: 2.5rem 1rem 4rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .auth-brand {
    font-family: 'Iceland', sans-serif;
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--text);
    text-decoration: none;
    text-align: center;
    line-height: 1;
  }

  .auth-card {
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 14px;
    padding: 1.5rem 1.25rem;
  }

  .auth-back {
    align-self: center;
    font-size: 0.85rem;
    color: inherit;
    opacity: 0.6;
    text-decoration: none;
  }

  .auth-back:hover { opacity: 1; }
</style>
