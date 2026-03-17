# Bookmarklet Hosting

Inspectra ships as an extension first, but the bookmarklet build can be hosted on GitHub Pages for browsers that do not support extensions.

## GitHub Pages

The repo already includes [.github/workflows/pages-bookmarklet.yml](/Users/jongik/Documents/code/inspectra/.github/workflows/pages-bookmarklet.yml).

What it does:

- installs workspace dependencies
- runs `pnpm run build:bookmarklet`
- publishes `dist/bookmarklet` to GitHub Pages

Expected public file:

- `https://<github-user>.github.io/<repo-name>/inspectra-bookmarklet.js`

For this repo, that will normally be:

- `https://yoon12345678910.github.io/inspectra/inspectra-bookmarklet.js`

## First-time setup

1. Push the repo to GitHub.
2. In GitHub, open `Settings -> Pages`.
3. Set `Source` to `GitHub Actions`.
4. Push to `main` or manually run the `pages-bookmarklet` workflow.

## Result files

The Pages deployment publishes these generated files:

- `inspectra-bookmarklet.js`
- `BOOKMARKLET.template.txt`
- `BOOKMARKLET.txt`
- `README.md`

`BOOKMARKLET.txt` is generated only when `INSPECTRA_BOOKMARKLET_URL` is set during the build. The workflow already sets it for GitHub Pages.

## Using the bookmarklet

After Pages deploys, open:

- `https://<github-user>.github.io/<repo-name>/BOOKMARKLET.txt`

Copy the single-line `javascript:(...)` string and save it as a browser bookmark URL.

Then:

1. Open the target website.
2. Click the `Inspectra` bookmark.
3. Inspectra loads `inspectra-bookmarklet.js` into the current page and opens Eruda with Inspectra plugins.

## Limits

- The page must allow external script loading. Some CSP policies can block bookmarklets.
- This does not remove the need for a user action; the bookmark must still be clicked.
- The extension remains the best option on Chrome/Edge desktop.
