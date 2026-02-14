<script>
  import { Copy, Check, ArrowLeft, ArrowRight, ArrowDown, Undo2, Sparkles } from 'lucide-svelte'

  let copied = $state(false)
  const installCmd = 'git clone https://github.com/sasha-computer/readwise-triage.git && cd readwise-triage && bun install'

  function copyInstall() {
    navigator.clipboard.writeText(installCmd)
    copied = true
    setTimeout(() => copied = false, 2000)
  }

  const shortcuts = [
    { icon: ArrowLeft, key: '←', label: 'Archive', desc: 'Dismiss and move on' },
    { icon: ArrowRight, key: '→', label: 'Keep', desc: 'Move to your shortlist' },
    { icon: ArrowDown, key: '↓', label: 'Summary', desc: 'AI summary before deciding' },
    { icon: Undo2, key: 'u', label: 'Undo', desc: 'Restore the last swipe' },
  ]
</script>

<main>
  <!-- Hero -->
  <section class="hero">
    <img src="/hero.png" alt="" class="blob" />
    <h1>readwise-triage</h1>
    <p class="tagline">Swipe through your Readwise Reader inbox like Tinder.</p>
  </section>

  <!-- Install -->
  <section class="install">
    <div class="install-block">
      <code>{installCmd}</code>
      <button class="copy-btn" onclick={copyInstall} aria-label="Copy to clipboard">
        {#if copied}
          <Check size={16} strokeWidth={1.5} />
        {:else}
          <Copy size={16} strokeWidth={1.5} />
        {/if}
      </button>
    </div>
    <p class="install-sub">Then <code class="inline-code">bun run start</code> to sync and start swiping.</p>
  </section>

  <!-- How it works -->
  <section class="shortcuts">
    {#each shortcuts as s, i}
      <div class="shortcut" style="animation-delay: {0.4 + i * 0.08}s">
        <div class="shortcut-icon">
          <s.icon size={18} strokeWidth={1.5} />
        </div>
        <div class="shortcut-info">
          <div class="shortcut-header">
            <kbd>{s.key}</kbd>
            <span class="shortcut-label">{s.label}</span>
          </div>
          <span class="shortcut-desc">{s.desc}</span>
        </div>
      </div>
    {/each}
  </section>

  <!-- Features -->
  <section class="features">
    <div class="feature">
      <Sparkles size={16} strokeWidth={1.5} />
      <span>AI summaries via OpenRouter so you can decide without opening the article</span>
    </div>
    <div class="feature">
      <span class="feature-bullet">◦</span>
      <span>Syncs your full Readwise Reader library to a local SQLite database</span>
    </div>
    <div class="feature">
      <span class="feature-bullet">◦</span>
      <span>Dark and light themes, keyboard-driven, zero config</span>
    </div>
  </section>

  <!-- Footer -->
  <footer>
    <a href="https://github.com/sasha-computer/readwise-triage" class="github-link">GitHub</a>
  </footer>
</main>

<style>
  main {
    max-width: var(--content-width);
    margin: 0 auto;
    padding: 0 24px;
  }

  /* Hero */
  .hero {
    text-align: center;
    padding-top: 80px;
  }

  .blob {
    width: 180px;
    height: 180px;
    animation: fadeIn 0.8s ease;
  }

  h1 {
    font-family: var(--mono);
    font-size: 3.5rem;
    font-weight: 400;
    letter-spacing: -0.02em;
    animation: fadeIn 0.8s ease 0.1s both;
  }

  .tagline {
    color: var(--muted);
    font-size: 1.2rem;
    margin-bottom: 32px;
    animation: fadeIn 0.8s ease 0.2s both;
  }

  /* Install */
  .install {
    animation: fadeIn 0.8s ease 0.3s both;
  }

  .install-block {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    background: var(--code-bg);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    padding: 18px 20px;
    transition: box-shadow 0.3s ease, border-color 0.3s ease;
  }

  .install-block:hover {
    border-color: rgba(74, 222, 128, 0.3);
    box-shadow: 0 0 40px var(--accent-glow);
  }

  .install-block code {
    font-family: var(--mono);
    font-size: 0.65rem;
    color: var(--fg);
    flex: 1;
    word-break: break-all;
    line-height: 1.5;
  }

  .copy-btn {
    background: none;
    border: none;
    color: var(--muted);
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
    transition: color 0.2s, background 0.2s;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .copy-btn:hover {
    color: var(--accent);
    background: rgba(74, 222, 128, 0.1);
  }

  .install-sub {
    text-align: center;
    color: var(--muted);
    font-size: 0.9rem;
    margin-top: 16px;
    margin-bottom: 32px;
  }

  .inline-code {
    font-family: var(--mono);
    font-size: 0.82em;
    background: var(--code-bg);
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  /* Shortcuts */
  .shortcuts {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-top: 8px;
  }

  .shortcut {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 18px;
    background: var(--code-bg);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    opacity: 0;
    animation: fadeIn 0.6s ease forwards;
    transition: border-color 0.3s ease, box-shadow 0.3s ease;
  }

  .shortcut:hover {
    border-color: rgba(74, 222, 128, 0.3);
    box-shadow: 0 0 40px var(--accent-glow);
  }

  .shortcut-icon {
    color: var(--accent);
    flex-shrink: 0;
  }

  .shortcut-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .shortcut-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  kbd {
    display: inline-block;
    font-family: var(--mono);
    font-size: 0.75rem;
    padding: 1px 7px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    color: var(--fg);
  }

  .shortcut-label {
    font-size: 0.95rem;
    color: var(--fg);
    font-weight: 500;
  }

  .shortcut-desc {
    font-size: 0.82rem;
    color: var(--muted);
  }

  /* Features */
  .features {
    margin-top: 24px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    animation: fadeIn 0.8s ease 0.7s both;
  }

  .feature {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.88rem;
    color: var(--muted);
  }

  .feature :global(svg) {
    color: var(--accent);
    flex-shrink: 0;
  }

  .feature-bullet {
    color: var(--accent);
    flex-shrink: 0;
    width: 18px;
    text-align: center;
  }

  /* Footer */
  footer {
    text-align: center;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    color: var(--muted);
    font-size: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 32px;
    padding-top: 24px;
    padding-bottom: 40px;
  }

  footer a {
    color: var(--accent);
    text-decoration: none;
  }

  footer a:hover {
    text-decoration: underline;
  }

  .github-link {
    font-family: var(--mono);
    font-size: 0.8rem;
  }

  /* Animation */
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* Mobile */
  @media (max-width: 500px) {
    h1 {
      font-size: 2.5rem;
    }
  }
</style>
