# Contribution Manager (web)

A single-page browser version of the Processing Contribution Manager, with direct
download links to each contribution's `.zip`.

## Files

    index.html        markup
    style.css         flat styling, light + dark via prefers-color-scheme
    app.js            fetch, parse, filter, sort, render
    js-yaml.min.js    js-yaml 5.4.1 (MIT), vendored — no CDN dependency

## Data

Fetched live on every page load from

    https://raw.githubusercontent.com/processing/processing-contributions/main/contributions.yaml

`raw.githubusercontent.com` sends `Access-Control-Allow-Origin: *`, so no proxy or
build step is needed. Raw files sit behind a ~5 minute CDN cache. To point at a
fork or a mirror, edit `DATA_URL` at the top of `app.js`.

Only entries with `status: VALID` are shown (BROKEN and DEPRECATED are dropped),
as are entries missing a name or download URL.

## Behaviour

- Four tabs — Libraries, Modes, Tools, Examples — with counts.
- Text filter over name, author, description and categories.
- Category dropdown, rebuilt per tab, with per-category counts.
- Sort by name, author or version; click a header again to reverse.
- Click a row's name to expand the full description, categories, required
  Processing revision range and homepage link.
- State lives in the URL hash (`#type=tool&q=color&c=Data`), so views are
  linkable and back/forward works.

Category spellings in the source data are folded together by a small alias table
in `app.js` (`DATA`/`Data`, `other`/`Other`, `Book`/`Books`, and so on), and
unresolved template placeholders like `${library.categories}` are dropped.

## Hosting

Any static host. For GitHub Pages, drop these files in the repo root (or
`/docs`) and enable Pages. Opening `index.html` from disk also works, since the
only network request is the cross-origin YAML fetch.

## AI Disclosure

This project was generated with the help of Claude Code.