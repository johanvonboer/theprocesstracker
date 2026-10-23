<script lang="ts">
  import { version } from '../../../package.json';
  import { store } from '$lib/store.svelte';
  import { ui, installApp, closeOverlay, switchOverlay } from '$lib/ui.svelte';
  import { urgencyColorFromDays } from '$lib/utils';
  import Modal from './Modal.svelte';
  import FeedbackForm from './FeedbackForm.svelte';
  import PrivacyPolicy from './PrivacyPolicy.svelte';
  import {
    ListOrdered, Palette, Timer, Layers, QrCode, WifiOff,
    UserRoundX, Cloud, Ban, Trash2, Download,
  } from 'lucide-svelte';

  // The mock queue in the hero, colored with this user's own thresholds so it
  // looks like their real queue.
  const DEMO = [
    { name: 'Deadlifts', days: 8 },
    { name: 'Running', days: 6 },
    { name: 'Squats', days: 4 },
    { name: 'Push-ups', days: 2 },
    { name: 'Pull-ups', days: 0 },
  ];

  const demoColor = (days: number) =>
    urgencyColorFromDays(days, store.settings.yellowAfterDays, store.settings.redAfterDays);
  const demoLabel = (days: number) =>
    days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;

  const FEATURES = [
    { icon: ListOrdered, title: 'Workout queue',
      body: "Exercises sort themselves by how long it's been. The most overdue is always on top — no planning, no spreadsheets, no decision fatigue." },
    { icon: Palette, title: 'Visual urgency',
      body: 'A color strip shifts from green through yellow to red as the days pass. Set the pace for everything, or per exercise.' },
    { icon: Timer, title: 'Sets & rest timer',
      body: 'Tap to start a set, tap again to rest. Sets are counted against your targets and rest is timed for you.' },
    { icon: Layers, title: 'Workout schemas',
      body: 'Keep separate routines — gym, home, travel — and switch between them. Each one has its own queue.' },
    { icon: QrCode, title: 'Share with a QR code',
      body: 'Hand a routine to a friend with a link or a QR code. Only the exercises travel, never your history.' },
    { icon: WifiOff, title: 'Works offline',
      body: "Add it to your home screen and it opens like an app — with or without signal in the gym." },
  ];

  const STEPS = [
    { title: 'Add your exercises', body: 'Name them, describe them, set targets for sets and reps. As many or as few as you like.' },
    { title: 'Log your workouts', body: "Tap Done when you've trained. Forgot yesterday? Log it for an earlier day instead." },
    { title: 'Follow the queue', body: "Open the app: the most overdue exercise is at the top, in red. Work down the list. That's it." },
  ];

  const PRIVACY = [
    { icon: UserRoundX, title: 'No account required', body: 'Open it and start. Everything is saved right here, in this browser.' },
    { icon: Cloud, title: 'Sync is optional', body: 'A username and password is all it takes. An email address is optional, and only used for password resets.' },
    { icon: Ban, title: 'No ads, no tracking', body: 'No analytics, no ad SDKs, no profile. Free and open source.' },
    { icon: Trash2, title: 'Yours to delete', body: 'Log out and your data leaves the browser. Delete your account and everything synced goes with it.' },
  ];
</script>

<Modal label="About The Process" onclose={closeOverlay} sheet>
  <div class="about">
    <div class="topbar"><span class="topbar-brand">The Process</span></div>

    <!-- ── Hero ── -->
    <section class="hero container">
      <div class="hero-content">
        <p class="eyebrow">Free · Open source · No ads</p>
        <h1 class="hero-title">
          <span class="brand-name">The Process</span>
          <span class="brand-sub">Workout tracker</span>
        </h1>
        <p class="tagline">
          Train what you've neglected the longest. Log the days you work out, and the
          exercise you've gone longest without is always on top.
        </p>
        <div class="ctas">
          <button class="btn btn-primary" onclick={closeOverlay}>
            {store.hasLocalData ? 'Back to my workouts' : 'Start tracking'}
          </button>
          {#if !store.syncConfig}
            <button class="btn btn-secondary" onclick={() => switchOverlay('register')}>Create free account</button>
          {/if}
          {#if ui.installPrompt}
            <button class="btn btn-secondary" onclick={installApp}><Download size={18} />Install app</button>
          {/if}
        </div>
        {#if !store.syncConfig}
          <p class="hero-meta">
            An account is optional — it syncs your workouts between devices.
            <button class="link" onclick={() => switchOverlay('login')}>Log in</button>
          </p>
        {/if}
      </div>

      <div class="demo" aria-hidden="true">
        <div class="demo-header">
          <span class="demo-app-name">The Process</span>
          <span class="demo-app-sub">Workout queue</span>
        </div>
        <ol class="demo-queue">
          {#each DEMO as item, i}
            <li class="demo-card" style="border-left-color: {demoColor(item.days)}">
              <span class="demo-rank">{i + 1}</span>
              <span class="demo-info">
                <span class="demo-exercise">{item.name}</span>
                <span class="demo-days">Last done {demoLabel(item.days)}</span>
              </span>
              <span class="demo-done">Done</span>
            </li>
          {/each}
        </ol>
        <div class="demo-legend">
          <span><i style="background: {demoColor(0)}"></i>Fresh</span>
          <span><i style="background: {demoColor(store.settings.yellowAfterDays)}"></i>Due soon</span>
          <span><i style="background: {demoColor(store.settings.redAfterDays)}"></i>Overdue</span>
        </div>
      </div>
    </section>

    <!-- ── Features ── -->
    <section class="band band-alt">
      <div class="container">
        <header class="section-header">
          <h2 class="section-title">Everything you need.<br />Nothing you don't.</h2>
          <p class="section-subtitle">Designed around one idea: show me what I haven't done in a while.</p>
        </header>
        <div class="grid features">
          {#each FEATURES as f}
            <div class="card">
              <div class="feature-icon"><f.icon size={22} /></div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          {/each}
        </div>
        {#if !ui.installPrompt}
          <p class="install-tip">
            <strong>Tip:</strong> use your browser's “Add to Home Screen” or “Install”
            option to keep The Process one tap away.
          </p>
        {/if}
      </div>
    </section>

    <!-- ── How it works ── -->
    <section class="band">
      <div class="container narrow">
        <header class="section-header">
          <h2 class="section-title">How it works</h2>
          <p class="section-subtitle">Three steps. No tutorial required.</p>
        </header>
        <ol class="steps">
          {#each STEPS as step, i}
            <li class="step">
              <span class="step-number">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </li>
          {/each}
        </ol>
      </div>
    </section>

    <!-- ── Quote ── -->
    <section class="band quote-band">
      <figure class="container narrow quote">
        <span class="quote-mark" aria-hidden="true">“</span>
        <blockquote>
          I built The Process because I wanted a workout app that is simple, private,
          and just for tracking my workouts — nothing else. No unwanted data collection,
          no ads. Just me and the process.
        </blockquote>
        <figcaption>— Johan, creator</figcaption>
      </figure>
    </section>

    <!-- ── Privacy ── -->
    <section class="band band-alt">
      <div class="container">
        <header class="section-header">
          <h2 class="section-title">Privacy by design</h2>
          <p class="section-subtitle">Not a policy document. Just how the app actually works.</p>
        </header>
        <div class="grid privacy">
          {#each PRIVACY as p}
            <div class="card">
              <div class="privacy-icon"><p.icon size={26} /></div>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </div>
          {/each}
        </div>
      </div>
    </section>

    <!-- ── Feedback ── -->
    <section class="band">
      <div class="container narrow">
        <header class="section-header">
          <h2 class="section-title">Send feedback</h2>
          <p class="section-subtitle">Bug reports, feature requests, or anything else on your mind.</p>
        </header>
        <div class="card feedback-card"><FeedbackForm /></div>
      </div>
    </section>

    <footer class="footer">
      <div class="container narrow">
        <span class="footer-brand">The Process</span>
        <p>
          v{version} · MIT License · © {new Date().getFullYear()} The Process Tracker contributors
        </p>
        <PrivacyPolicy />
      </div>
    </footer>
  </div>
</Modal>

<style>
  .about { min-height: 100dvh; }

  .container {
    max-width: 960px;
    margin: 0 auto;
    padding: 0 1rem;
  }

  .container.narrow { max-width: 680px; }

  /* ── Top bar ── */
  .topbar {
    position: sticky;
    top: 0;
    z-index: 1;
    height: 3.25rem;
    display: flex;
    align-items: center;
    padding: 0 1rem;
    background: color-mix(in srgb, var(--bg) 92%, transparent);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--card-border);
  }

  .topbar-brand {
    font-family: 'Iceland', sans-serif;
    font-size: 1.5rem;
    line-height: 1;
  }

  /* ── Hero ── */
  .hero {
    display: flex;
    flex-direction: column;
    gap: 2.5rem;
    padding-top: 2.5rem;
    padding-bottom: 3.5rem;
  }

  .eyebrow {
    display: inline-block;
    margin: 0 0 1.25rem;
    padding: 0.3em 0.9em;
    border-radius: 20px;
    background: var(--card-border);
    font-size: 0.7rem;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    opacity: 0.8;
  }

  .hero-title {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0 0 1.25rem;
    line-height: 1;
  }

  .brand-name {
    font-family: 'Iceland', sans-serif;
    font-size: clamp(3.5rem, 15vw, 5.5rem);
    font-weight: 400;
    line-height: 0.9;
  }

  .brand-sub {
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    opacity: 0.6;
  }

  .tagline {
    margin: 0 0 1.75rem;
    max-width: 30rem;
    font-size: clamp(1rem, 2.5vw, 1.15rem);
    line-height: 1.6;
    opacity: 0.75;
  }

  .ctas {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-bottom: 1.1rem;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1.4rem;
    font-size: 0.95rem;
    line-height: 1;
    transition: background 0.15s, transform 0.1s, box-shadow 0.15s, border-color 0.15s;
  }

  .btn:hover { transform: translateY(-1px); }
  .btn:active { transform: none; }

  .btn-primary { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15); }
  .btn-primary:hover { box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18); }

  .btn-secondary {
    background: transparent;
    color: var(--text);
    border: 1.5px solid var(--card-border);
  }

  .btn-secondary:hover { background: transparent; border-color: var(--accent); color: var(--accent); }

  .hero-meta { margin: 0; font-size: 0.85rem; opacity: 0.7; }

  .link {
    background: none;
    border: none;
    padding: 0;
    font-size: inherit;
    color: var(--accent);
    font-weight: 600;
    cursor: pointer;
  }

  .link:hover { background: none; text-decoration: underline; }

  /* ── Demo queue (looks like the real Workout queue tab) ── */
  .demo {
    width: 100%;
    max-width: 360px;
    align-self: center;
    border-radius: 16px;
    border: 1px solid var(--card-border);
    background: var(--bg);
    box-shadow: var(--shadow);
    overflow: hidden;
  }

  .demo-header {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 1rem 1.25rem 0.85rem;
    background: var(--color-primary);
  }

  .demo-app-name {
    font-family: 'Iceland', sans-serif;
    font-size: 1.4rem;
    line-height: 1;
    color: #E8EDF2;
  }

  .demo-app-sub {
    font-size: 0.6rem;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #9badbf;
  }

  .demo-queue {
    list-style: none;
    margin: 0;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .demo-card {
    display: flex;
    align-items: stretch;
    background: var(--card-bg);
    border-left: 4px solid;
    border-radius: 9px;
    box-shadow: 0 1px 2px rgba(44, 57, 71, 0.1), 0 4px 10px rgba(44, 57, 71, 0.06);
    overflow: hidden;
  }

  .demo-rank {
    align-self: center;
    padding-left: 0.7rem;
    min-width: 1.6rem;
    font-weight: 700;
    font-size: 0.85rem;
    opacity: 0.3;
  }

  .demo-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    padding: 0.5rem 0.6rem;
  }

  .demo-exercise { font-size: 0.875rem; font-weight: 700; line-height: 1.3; }
  .demo-days { font-size: 0.7rem; opacity: 0.55; }

  .demo-done {
    display: flex;
    align-items: center;
    padding: 0 0.85rem;
    background: var(--interactive);
    color: var(--interactive-text);
    font-size: 0.75rem;
    font-weight: 500;
  }

  .demo-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    padding: 0.6rem 0.85rem 0.8rem;
    border-top: 1px solid var(--card-border);
    font-size: 0.7rem;
    opacity: 0.75;
  }

  .demo-legend span { display: flex; align-items: center; gap: 0.35rem; }
  .demo-legend i { width: 8px; height: 8px; border-radius: 50%; }

  /* ── Bands & sections ── */
  .band { padding: 3.5rem 0; }
  .band-alt { background: var(--bg-alt); }

  .section-header { text-align: center; margin-bottom: 2.25rem; }

  .section-title {
    margin: 0 0 0.6rem;
    font-size: clamp(1.6rem, 6vw, 2.4rem);
    font-weight: 700;
    line-height: 1.2;
  }

  .section-subtitle { margin: 0; font-size: 1rem; opacity: 0.65; }

  .grid { display: grid; gap: 1rem; }
  .grid.features { grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
  .grid.privacy { grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); }

  .card {
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: var(--shadow-card);
  }

  .card h3 { margin: 0 0 0.45rem; font-size: 1rem; font-weight: 700; }
  .card p { margin: 0; font-size: 0.92rem; line-height: 1.6; opacity: 0.75; }

  .feature-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    margin-bottom: 1rem;
    border-radius: 10px;
    background: var(--card-border);
    color: var(--accent);
  }

  .privacy-icon { margin-bottom: 0.9rem; color: #22c55e; }

  .install-tip {
    margin: 1.5rem auto 0;
    max-width: 34rem;
    text-align: center;
    font-size: 0.85rem;
    opacity: 0.7;
  }

  /* ── Steps ── */
  .steps { list-style: none; margin: 0; padding: 0; }

  .step {
    display: flex;
    gap: 1.25rem;
    align-items: flex-start;
    padding: 1.6rem 0;
    border-bottom: 1px solid var(--card-border);
  }

  .step:first-child { padding-top: 0; }
  .step:last-child { border-bottom: none; padding-bottom: 0; }

  .step-number {
    flex-shrink: 0;
    width: 3rem;
    font-family: 'Iceland', sans-serif;
    font-size: 2.25rem;
    line-height: 1;
    color: var(--accent);
    opacity: 0.75;
  }

  .step h3 { margin: 0.2rem 0 0.35rem; font-size: 1.1rem; font-weight: 700; }
  .step p { margin: 0; font-size: 0.95rem; line-height: 1.6; opacity: 0.75; }

  /* ── Quote ── */
  .quote-band {
    position: relative;
    overflow: hidden;
    /* Darkens toward the bottom so the band still stands out in dark mode,
       where --color-primary is also the page background. */
    background: linear-gradient(160deg, var(--color-primary) 30%, #1b2530);
    color: #E8EDF2;
  }

  .quote-band::before {
    content: '';
    position: absolute;
    top: -110px;
    right: -110px;
    width: 360px;
    height: 360px;
    border-radius: 50%;
    background: var(--color-secondary);
    opacity: 0.14;
    pointer-events: none;
  }

  .quote { position: relative; margin: 0 auto; text-align: center; }

  .quote-mark {
    display: block;
    height: 2.75rem;
    font-family: 'Iceland', sans-serif;
    font-size: 6.5rem;
    line-height: 1;
    color: var(--color-secondary);
  }

  .quote blockquote {
    margin: 0 0 1.25rem;
    font-size: clamp(1.05rem, 3vw, 1.3rem);
    font-style: italic;
    line-height: 1.75;
  }

  .quote figcaption { font-size: 0.875rem; font-weight: 500; color: var(--color-accent1); }

  .feedback-card { padding: 1.5rem 1.25rem; }

  /* ── Footer ── */
  .footer {
    padding: 2.5rem 0 3rem;
    border-top: 1px solid var(--card-border);
    text-align: center;
    font-size: 0.8rem;
  }

  .footer-brand { font-family: 'Iceland', sans-serif; font-size: 1.6rem; line-height: 1; }
  .footer p { margin: 0.4rem 0 1rem; opacity: 0.6; }

  /* ── Wider screens: hero side by side ── */
  @media (min-width: 760px) {
    .hero {
      flex-direction: row;
      align-items: center;
      gap: 3.5rem;
      padding-top: 4.5rem;
      padding-bottom: 5rem;
    }

    .hero-content { flex: 1; min-width: 0; }
    .demo { flex: 0 0 320px; }
    .band { padding: 5rem 0; }
    .card { transition: transform 0.2s, box-shadow 0.2s; }
    .card:hover { transform: translateY(-2px); box-shadow: var(--shadow); }
    .feedback-card:hover { transform: none; box-shadow: var(--shadow-card); }
  }

  @media (max-width: 420px) {
    .ctas .btn { flex: 1 1 100%; }
  }
</style>
