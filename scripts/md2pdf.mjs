#!/usr/bin/env node
// md2pdf — render Markdown to PDF matching the yzane "Markdown-PDF" VS Code extension.
//
// It reproduces the extension's pipeline: markdown-it (same options + plugins) -> HTML with
// the extension's own CSS (markdown.css, markdown-pdf.css, tomorrow.css) plus our overrides,
// printed by your installed Google Chrome via puppeteer-core using the extension's default
// page options. It also renders Mermaid diagrams and embeds images/charts referenced relative
// to the Markdown file.
//
// First run auto-installs its npm dependencies, so `node scripts/md2pdf.mjs <file>` just works.
//
// Usage:
//   node md2pdf.mjs <file.md | dir> [more paths...] [options]
// Options:
//   --out <dir>       write PDFs to <dir> (mirrors folder structure; default: alongside source)
//   --recursive, -r   when a path is a directory, recurse into subfolders
//   --chrome <path>   Chrome/Chromium executable (default: auto-detect, then CHROME_PATH)
//   --quiet           only print errors

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..'); // skill root, where package.json + node_modules live
const STYLES_DIR = path.join(ROOT, 'assets', 'styles');
const MERMAID_JS = path.join(ROOT, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');
// keep rendered diagrams inside the page width and centred
const MERMAID_CSS = '.mermaid{text-align:center;margin:1em 0;}.mermaid svg{max-width:100%;height:auto;}';

// ---- self-install deps on first run ------------------------------------------
function ensureDeps() {
  // a representative dependency; if present, assume the install is good
  if (fs.existsSync(path.join(ROOT, 'node_modules', 'puppeteer-core', 'package.json'))) return;
  console.error('md2pdf: installing dependencies (first run, one-off)…');
  try {
    execSync('npm install --no-audit --no-fund --loglevel=error', { cwd: ROOT, stdio: 'inherit' });
  } catch (e) {
    console.error('md2pdf: automatic `npm install` failed. Run it manually in ' + ROOT);
    throw e;
  }
}

async function loadDeps() {
  const [mdit, checkbox, named, hl, pptr] = await Promise.all([
    import('markdown-it'),
    import('markdown-it-checkbox'),
    import('markdown-it-named-headers'),
    import('highlight.js'),
    import('puppeteer-core'),
  ]);
  return {
    MarkdownIt: mdit.default,
    mdCheckbox: checkbox.default,
    mdNamedHeaders: named.default,
    hljs: hl.default,
    puppeteer: pptr.default,
  };
}

// ---- the extension's default page options (yzane markdown-pdf 2.1.0) ----------
const PAGE = {
  format: 'A4',
  landscape: false, // portrait
  margin: { top: '1.5cm', bottom: '1cm', left: '1cm', right: '1cm' },
  printBackground: true,
  displayHeaderFooter: true,
};
const FOOTER =
  `<div style="font-size: 9px; margin: 0 auto;"> <span class='pageNumber'></span> / <span class='totalPages'></span></div>`;
// header = document title on the left, ISO date on the right (matches the extension default)
function headerFor(isoDate) {
  return `<div style="font-size: 9px; margin-left: 1cm;"> <span class='title'></span></div>` +
         `<div style="font-size: 9px; margin-left: auto; margin-right: 1cm; ">${isoDate}</div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// extension CSS first, then our overrides.css so local tweaks win the cascade
const BUNDLED_CSS = ['markdown.css', 'markdown-pdf.css', 'tomorrow.css', 'overrides.css']
  .map((f) => fs.readFileSync(path.join(STYLES_DIR, f), 'utf8'))
  .join('\n') + '\n' + MERMAID_CSS;

// ---- markdown-it configured like the extension --------------------------------
function buildMarkdown({ MarkdownIt, mdCheckbox, mdNamedHeaders, hljs }) {
  return new MarkdownIt({
    html: true,
    breaks: false,
    linkify: false,
    highlight(str, lang) {
      // Mermaid: emit a container mermaid.js can find. Escape the source so the element's
      // textContent returns the exact diagram text (including <b>/<br/> labels).
      if (lang === 'mermaid') return `<div class="mermaid">${escapeHtml(str)}</div>`;
      if (lang && hljs.getLanguage(lang)) {
        try {
          return '<pre class="hljs"><code>' +
            hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
            '</code></pre>';
        } catch (_) { /* fall through */ }
      }
      return '<pre class="hljs"><code>' + escapeHtml(str) + '</code></pre>';
    },
  })
    .use(mdCheckbox)
    .use(mdNamedHeaders);
}

function htmlFor(md, markdown, title, fileDir, css) {
  const body = md.render(markdown);
  // base URL = the markdown file's folder, so relative images/assets (charts, etc.) resolve
  const base = pathToFileURL(fileDir.endsWith(path.sep) ? fileDir : fileDir + path.sep).href;
  return `<!DOCTYPE html><html><head><meta charset="utf-8">` +
    `<base href="${base}">` +
    `<title>${escapeHtml(title)}</title><style>${css}</style></head>` +
    `<body>${body}</body></html>`;
}

// Render Mermaid diagrams in the page. Fail-soft: if a diagram is invalid, leave its source
// text rather than aborting the whole document.
async function renderMermaid(page) {
  try {
    await page.addScriptTag({ path: MERMAID_JS });
    await page.evaluate(async () => {
      window.mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });
      await window.mermaid.run({ querySelector: '.mermaid' });
    });
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
  } catch (e) {
    console.error('  (mermaid rendering failed, left diagram source as-is):', e.message);
  }
}

// ---- Chrome discovery ---------------------------------------------------------
function findChrome(explicit) {
  const candidates = [
    explicit,
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error(
    'Could not find Chrome. Pass --chrome <path> or set CHROME_PATH.\nTried:\n  ' +
    candidates.join('\n  '));
}

// ---- collect input files ------------------------------------------------------
// Returns { file, base } where base is the input root the file was found under, so --out can
// mirror the folder structure and same-named files (e.g. per-folder README.md) do not collide.
function collect(inputs, recursive) {
  const out = [];
  const seen = new Set();
  const add = (file, base) => {
    const k = path.resolve(file);
    if (!seen.has(k)) { seen.add(k); out.push({ file, base }); }
  };
  const isMd = (name) => /\.m?(md|markdown)$/i.test(name);
  for (const input of inputs) {
    const st = fs.statSync(input); // throws with a clear message if missing
    if (st.isDirectory()) {
      const walk = (dir) => {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, ent.name);
          if (ent.isDirectory()) { if (recursive) walk(p); }
          else if (ent.isFile() && isMd(ent.name)) add(p, input);
        }
      };
      walk(input);
    } else if (st.isFile()) {
      add(input, path.dirname(input));
    }
  }
  return out;
}

// ---- args ---------------------------------------------------------------------
function parseArgs(argv) {
  const o = { paths: [], out: null, recursive: false, chrome: null, quiet: false, css: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') o.out = argv[++i];
    else if (a === '--recursive' || a === '-r') o.recursive = true;
    else if (a === '--chrome') o.chrome = argv[++i];
    else if (a === '--css') o.css.push(argv[++i]); // extra stylesheet(s), applied last
    else if (a === '--quiet') o.quiet = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else o.paths.push(a);
  }
  return o;
}

const HELP = `md2pdf — Markdown to PDF, styled like the yzane Markdown-PDF VS Code extension.

  node md2pdf.mjs <file.md | dir> [more...] [options]

Options:
  --out <dir>      write PDFs to <dir> (mirrors folder structure; default: next to each source)
  --recursive, -r  recurse into subfolders when a path is a directory
  --css <file>     extra stylesheet, applied last so it overrides (repeatable) — for
                   project-specific formatting on top of the extension look
  --chrome <path>  Chrome/Chromium executable (default: auto-detect, then CHROME_PATH)
  --quiet          only print errors

First run installs dependencies automatically. Renders Mermaid diagrams and embeds
images/charts referenced relative to the Markdown file.
`;

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help || o.paths.length === 0) { process.stdout.write(HELP); return; }

  const files = collect(o.paths, o.recursive);
  if (files.length === 0) { console.error('No .md files found in the given path(s).'); process.exit(1); }

  ensureDeps();
  const deps = await loadDeps();
  const md = buildMarkdown(deps);

  // project overrides (--css) are appended last so they win the cascade
  const extraCss = o.css.map((p) => fs.readFileSync(p, 'utf8')).join('\n');
  const css = extraCss ? BUNDLED_CSS + '\n' + extraCss : BUNDLED_CSS;

  const executablePath = findChrome(o.chrome);
  const isoDate = new Date().toISOString().slice(0, 10);

  const browser = await deps.puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--no-sandbox', '--allow-file-access-from-files'],
  });
  try {
    for (const { file, base } of files) {
      const title = path.basename(file).replace(/\.m?(md|markdown)$/i, '');
      let outPath;
      if (o.out) {
        // mirror the source's structure under --out so same-named files don't collide
        outPath = path.join(o.out, path.relative(base, file)).replace(/\.m?(md|markdown)$/i, '.pdf');
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
      } else {
        outPath = file.replace(/\.m?(md|markdown)$/i, '.pdf');
      }
      const page = await browser.newPage();
      // Render via a real file:// page (not setContent) so local images/charts referenced
      // relative to the Markdown file load — Chrome blocks file:// assets from an about:blank
      // origin. The <base href> points relative paths back at the source folder.
      const tmpHtml = path.join(os.tmpdir(), `md2pdf-${process.pid}-${Math.random().toString(36).slice(2)}.html`);
      try {
        const html = htmlFor(md, fs.readFileSync(file, 'utf8'), title, path.dirname(file), css);
        fs.writeFileSync(tmpHtml, html, 'utf8');
        await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: 'networkidle0' });
        if (html.includes('class="mermaid"')) await renderMermaid(page);
        await page.pdf({ ...PAGE, path: outPath, headerTemplate: headerFor(isoDate), footerTemplate: FOOTER });
        if (!o.quiet) console.log(`✓ ${outPath}`);
      } finally {
        fs.rmSync(tmpHtml, { force: true });
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error('md2pdf error:', e.message); process.exit(1); });
