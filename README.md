# 📄 Markdown → PDF

> **Render Markdown to PDF from the command line — matching the exact look of the yzane "Markdown-PDF" VS Code extension.** Same parser, same CSS, printed by your own Chrome. Plus Mermaid diagrams and embedded charts, so complete documents come out complete.

Works as a plain CLI and as a **skill** for AI coding agents — Claude Code, Cursor, Codex, and more (see [`SKILL.md`](SKILL.md)).

```
🎯 Pixel-parity with the VS Code extension     📊 Mermaid + embedded SVG/PNG     🖨️ Prints via your installed Chrome
```

## 📑 Table of Contents

- [✨ What it does](#-what-it-does)
- [📥 Install as a skill](#-install-as-a-skill)
- [🚀 Quick Start](#-quick-start)
- [📖 Usage](#-usage)
- [🎨 Project overrides](#-project-overrides)
- [🔧 What it reproduces](#-what-it-reproduces)
- [⚠️ Limitations](#️-limitations)
- [🧰 Prerequisites](#-prerequisites)
- [🙌 Built by](#-built-by)
- [📜 License](#-license)

## ✨ What it does

Most Markdown-to-PDF tools (`pandoc`, `md-to-pdf`) produce a *different* look — LaTeX styling or their own baked-in CSS. This one reproduces the **yzane Markdown-PDF** extension's pipeline end to end:

`markdown-it` (same options + plugins) → HTML with the extension's own CSS → printed by your Google Chrome via `puppeteer-core`, using the extension's default page options.

On top of that it:

- 📊 **Renders Mermaid diagrams** — ```` ```mermaid ```` fences become SVG (fail-soft: a broken diagram is left as source, not a failed document).
- 🖼️ **Embeds images and charts** referenced by paths relative to the Markdown file, so SVG/PNG assets resolve and print.
- 📁 **Batch-renders** a single file, a list of files, or whole folders (optionally recursive).
- 📦 **Downloads no browser** — it drives the Chrome you already have.

## 📥 Install as a skill

Add it to your AI coding agent with the [skills](https://github.com/vercel-labs/skills) CLI:

```bash
npx skills add onsen-ai/markdown-pdf-skill
```

Or install globally, for every project:

```bash
npx skills add onsen-ai/markdown-pdf-skill -g
```

Target a specific agent explicitly:

```bash
npx skills add onsen-ai/markdown-pdf-skill -a claude-code
npx skills add onsen-ai/markdown-pdf-skill -a cursor
```

The skill is copied into your agent's skills directory (e.g. `~/.claude/skills/`), where it's discovered automatically — the agent reads [`SKILL.md`](SKILL.md) and can render Markdown to PDF on request. See [vercel-labs/skills](https://github.com/vercel-labs/skills) for more install options.

> **The `skills` CLI needs Node 20.12+ or 22+.** On Node 18 it fails with `SyntaxError: ... does not provide an export named 'styleText'`. Run the install under a newer Node (`nvm use 20`), or use the manual install below — the skill *itself* runs fine on Node 18+.

### Manual install (no CLI)

Clone straight into your agent's skills directory — works on any Node version:

```bash
# Claude Code
git clone https://github.com/onsen-ai/markdown-pdf-skill.git ~/.claude/skills/markdown-to-pdf

# Cursor
git clone https://github.com/onsen-ai/markdown-pdf-skill.git .cursor/skills/markdown-to-pdf
```

Most agents discover skills automatically from their skills directory — no extra configuration needed.

> Prefer to run it as a plain CLI instead? Skip this and see [Quick Start](#-quick-start).

## 🚀 Quick Start

### Run it with `npx` (no clone, no install)

```bash
# render one file  ->  report.pdf next to it
npx github:onsen-ai/markdown-pdf-skill report.md

# a whole folder, recursively, into one output dir
npx github:onsen-ai/markdown-pdf-skill ./docs --recursive --out ./pdfs
```

`npx` fetches the tool and its dependencies into its cache on first use and runs the `md2pdf` command — nothing is added to your project. All the [options](#-usage) below work the same way. (You still need Node and Chrome — see [Prerequisites](#-prerequisites).)

### Or clone it

```bash
git clone https://github.com/onsen-ai/markdown-pdf-skill.git
cd markdown-pdf-skill
npm install                              # one-off
node scripts/md2pdf.mjs examples/sample.md   # → examples/sample.pdf
```

Open [`examples/sample.pdf`](examples/sample.pdf) to see headings, tables, syntax highlighting, a task list, a Mermaid diagram, and an embedded chart — all in the extension's styling.

## 📖 Usage

```bash
# single file  ->  RELEASES.pdf next to it
node scripts/md2pdf.mjs path/to/RELEASES.md

# every .md in a folder  (PDFs written alongside each source)
node scripts/md2pdf.mjs "path/to/docs"

# recurse into subfolders, and collect all PDFs into one output dir
node scripts/md2pdf.mjs "path/to/docs" --recursive --out ~/Desktop/pdfs
```

| Option            | What it does                                                                   |
| ----------------- | ------------------------------------------------------------------------------ |
| `--out <dir>`     | Write PDFs to `<dir>` instead of next to each source.                          |
| `--recursive`, `-r` | Recurse into subfolders when a path is a directory.                          |
| `--css <file>`    | Extra stylesheet applied **last** (overrides the standard look). Repeatable.   |
| `--chrome <path>` | Chrome/Chromium/Edge executable (else auto-detected, then `CHROME_PATH`).      |
| `--quiet`         | Only print errors.                                                             |

The output filename is the source basename with a `.pdf` extension. Existing PDFs are overwritten.

## 🎨 Project overrides

The bundled styling (extension CSS + `assets/styles/overrides.css`) is the shared default. A project can layer its own tweaks with a small CSS file passed via `--css` — because it loads last, it wins the cascade, without touching the skill:

```bash
node scripts/md2pdf.mjs docs/ --css my-tweaks.css
```

```css
/* my-tweaks.css — e.g. let long paths in tables wrap instead of widening the column */
table code { font-size: 10px; white-space: normal; word-break: break-word; }
```

## 🔧 What it reproduces

The extension's defaults, all editable in [`scripts/md2pdf.mjs`](scripts/md2pdf.mjs) and [`assets/styles/`](assets/styles):

- **Parser:** `markdown-it` with `html: true`, `breaks: false`, `linkify: false`, plus `markdown-it-checkbox` (task lists) and `markdown-it-named-headers` (heading anchors). Code highlighting via `highlight.js`.
- **CSS:** the extension's own `markdown.css`, `markdown-pdf.css`, and `tomorrow.css` (default code theme), inlined at render time. Local tweaks live in `overrides.css`, loaded last.
- **Page:** A4 portrait; margins top 1.5cm, bottom/left/right 1cm; `printBackground: true`.
- **Header:** document title (filename) left, ISO date right, 9px.
- **Footer:** `pageNumber / totalPages` centred, 9px.

## ⚠️ Limitations

- **Math (KaTeX / LaTeX)** is not rendered by default. Add the `markdown-it-katex` plugin plus KaTeX CSS to the script (same pattern as Mermaid) if you need it.
- **Remote images** need network access at render time.
- **Don't install inside a cloud-synced folder** (OneDrive, Dropbox): `node_modules` is thousands of files and will trigger a sync storm. Keep it in a normal git repo and point it at your Markdown wherever it lives.

## 🧰 Prerequisites

- **Node.js** ≥ 18
- **Google Chrome** (or Chromium/Edge). Auto-detected; on macOS it defaults to `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. `puppeteer-core` drives the existing browser, so nothing is downloaded.

## 🙌 Built by

Built by the team at [Onsen](https://www.onsenapp.com) — an AI-powered mental health companion for journaling, emotional wellbeing, and personal growth.

## 📜 License

MIT — see [LICENSE](LICENSE).

The bundled stylesheets in `assets/styles/` (`markdown.css`, `markdown-pdf.css`, `tomorrow.css`) are from the [yzane Markdown-PDF](https://github.com/yzane/vscode-markdown-pdf) VS Code extension (MIT).
