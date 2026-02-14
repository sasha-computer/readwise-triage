<p align="center">
  <img src="assets/hero.png" alt="readwise-triage" width="200" />
</p>

<h1 align="center">readwise-triage</h1>

<p align="center">
  Swipe through your Readwise Reader inbox like Tinder.
</p>

<p align="center">
  <a href="#why">Why?</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#installation">Installation</a> ·
  <a href="#usage">Usage</a> ·
  <a href="#license">License</a>
</p>

## Why?

Readwise Reader is great at collecting articles. The problem is the inbox grows faster than you can read it. You open the app, see 200+ unread items, feel overwhelmed, and close it again.

What you actually need is a quick way to triage: keep the stuff worth reading, archive the rest, and move on. That's hard to do in Reader's own UI because every article feels like a commitment.

**readwise-triage turns your inbox into a card stack.** Left to archive, right to keep. You can burn through dozens of articles in a few minutes.

## How it works

- Syncs your Readwise Reader library (inbox, later, shortlist) to a local SQLite database
- Shows one article at a time as a swipeable card
- Left arrow archives it in Reader, right arrow moves it to your shortlist
- Down arrow generates an AI summary (via OpenRouter) so you can decide without opening the article
- Tracks what you've read and lets you undo the last swipe
- Dark and light themes, keyboard-driven

## Installation

Requires [Bun](https://bun.sh).

```bash
git clone https://github.com/sasha-computer/readwise-triage.git
cd readwise-triage
bun install
```

Create a `.env` file with your API keys:

```bash
cp .env.example .env
```

You'll need:

- **READWISE_TOKEN** -- get one from [readwise.io/access_token](https://readwise.io/access_token)
- **OPENROUTER_API_KEY** -- get one from [openrouter.ai](https://openrouter.ai) (only needed for AI summaries)

## Usage

### Sync your library

Pull documents from Readwise Reader into the local database:

```bash
bun run sync
```

### Start the triage UI

```bash
bun run dev
```

Open [localhost:3141](http://localhost:3141) and start swiping.

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `←` | Archive (dismiss) |
| `→` | Keep (shortlist) |
| `↓` | Show AI summary |
| `u` | Undo last swipe |
| `Esc` | Close summary overlay |

### Running tests

```bash
bun test
```

## License

MIT
