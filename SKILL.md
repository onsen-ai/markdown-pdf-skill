---
name: markdown-to-pdf
description: >
  Convert Markdown (.md) files to PDF from the command line, reproducing the exact styling
  of the yzane "Markdown-PDF" VS Code extension. Use this whenever the user wants to export,
  render, convert, or "PDF" one or more Markdown files, batch-render a whole folder of docs,
  automate Markdown-to-PDF instead of right-clicking in VS Code, or produce PDFs that match
  what the Markdown-PDF extension generates. Also use when a workflow needs .md deliverables
  (briefs, trackers, notes, READMEs) turned into shareable PDFs. Self-contained: bundles the
  extension's CSS and prints via the user's installed Google Chrome. Always use this skill for
  Markdown-to-PDF conversion rather than reaching for pandoc or md-to-pdf, which do not match
  the extension's look.
---

# Markdown to PDF (yzane Markdown-PDF parity)

Render Markdown to PDF from the CLI with output matching the VS Code **Markdown-PDF** extension (yzane, v2.1.0). It reproduces the extension's full pipeline: `markdown-it` (same options and plugins) → HTML with the extension's own CSS → printed by the user's Google Chrome via `puppeteer-core`, using the extension's default page options. It additionally **renders Mermaid diagrams** and **embeds images/charts** referenced relative to the Markdown file, so documents with flowcharts and embedded chart SVGs come out complete.

Prefer this over `pandoc` (LaTeX look) or `md-to-pdf` (different parser and baked-in CSS): only this reproduces the extension's exact styling.

## Setup

Nothing to run first: the initial invocation installs the skill's npm dependencies automatically (a one-off, into the skill's own `node_modules`). To pre-warm it you can run `npm install` in the skill folder, but it is not required.

Requirements: Node.js and Google Chrome (or Chromium/Edge). Chrome is auto-detected; on macOS it defaults to `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. `puppeteer-core` drives the existing browser, so nothing is downloaded.

**Do not install this inside a cloud-synced folder** (OneDrive, Dropbox): `node_modules` is thousands of files and will cause a sync storm. Keep the skill in a normal git repo and point it at the Markdown files wherever they live.

## Usage

Run the script with a file, several files, or a folder:

```bash
# single file -> RELEASES.pdf next to it
node scripts/md2pdf.mjs path/to/RELEASES.md

# every .md in a folder (PDFs written alongside each source)
node scripts/md2pdf.mjs "path/to/data room"

# recurse into subfolders, and collect all PDFs into one output dir
node scripts/md2pdf.mjs "path/to/data room" --recursive --out ~/Desktop/pdfs
```

Options:

- `--out <dir>` — write PDFs to `<dir>` instead of next to each source.
- `--recursive`, `-r` — recurse into subfolders when a path is a directory.
- `--css <file>` — an extra stylesheet applied **last** so it overrides the standard look. Repeatable. Use it for per-project formatting (see below).
- `--chrome <path>` — Chrome/Chromium/Edge executable (else auto-detect, then `CHROME_PATH`).
- `--quiet` — only print errors.

The output filename is the source basename with a `.pdf` extension. Existing PDFs are overwritten.

### Project overrides (`--css`)

The bundled styling (extension CSS + `overrides.css`) is the shared default. A project can layer its own tweaks by keeping a small CSS file and passing it with `--css`, without touching the skill. Because it loads after everything else, it wins the cascade. For example, a project whose docs use long file paths as inline code in tables might add:

```css
table code { font-size: 10px; white-space: normal; word-break: break-word; }
```

so paths sit at table size and wrap instead of widening the column.

## What it reproduces (the extension's defaults)

If asked to change the look, these are the knobs, edit `scripts/md2pdf.mjs`:

- **Parser:** `markdown-it` with `html: true`, `breaks: false`, `linkify: false`, plus `markdown-it-checkbox` (task lists) and `markdown-it-named-headers` (heading anchors). Code highlighting via `highlight.js`.
- **CSS:** the extension's own `markdown.css`, `markdown-pdf.css`, and `tomorrow.css` (the default code-highlight theme), bundled in `assets/styles/` and inlined at render time so the skill is self-contained. The bundled tweaks (smaller table font, grey table headers with a black bottom rule, mid-grey row separators) live in `assets/styles/overrides.css`, loaded last so it wins the cascade — edit it to adjust styling without touching the extension CSS.
- **Page:** A4 portrait; margins top 1.5cm, bottom/left/right 1cm; `printBackground: true`.
- **Header:** document title (source filename, without extension) on the left, ISO date on the right, 9px.
- **Footer:** `pageNumber / totalPages` centred, 9px.
- **Mermaid:** ```` ```mermaid ```` fences are rendered to SVG via the bundled `mermaid` (fail-soft: an invalid diagram is left as source rather than aborting the document).
- **Images:** the page loads from a `file://` URL so images/charts referenced relative to the Markdown file resolve and embed. Keep assets alongside the file (e.g. a `content/` folder next to it).

## Limitations

- Math (KaTeX / LaTeX) is not rendered by default. If a document needs it, add the `markdown-it-katex` plugin plus the KaTeX CSS to the script (same pattern as Mermaid).
- Remote images need network access at render time.
