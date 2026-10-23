<script lang="ts">
  import { currentOverlay, closeOverlay } from '$lib/ui.svelte';
  import Modal from './Modal.svelte';
  import LoginForm from './LoginForm.svelte';
  import RegisterForm from './RegisterForm.svelte';
  import ForgotPasswordForm from './ForgotPasswordForm.svelte';

  const overlay = $derived(currentOverlay());
  const label = $derived(
    overlay === 'register' ? 'Create an account'
    : overlay === 'forgot-password' ? 'Reset your password'
    : 'Log in'
  );
</script>

<Modal {label} onclose={closeOverlay}>
  <div class="auth-card">
    <p class="auth-brand">The Process</p>
    {#if overlay === 'register'}
      <RegisterForm />
    {:else if overlay === 'forgot-password'}
      <ForgotPasswordForm />
    {:else}
      <LoginForm />
    {/if}
  </div>
</Modal>

<style>
  .auth-brand {
    margin: 0 0 1rem;
    font-family: 'Iceland', sans-serif;
    font-size: 1.6rem;
    line-height: 1;
    opacity: 0.85;
  }
</style>
