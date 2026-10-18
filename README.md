# The Red Archive

A free, static Liverpool squad and transfer browser. **Open `index.html` directly**: its styles, JavaScript and data are embedded. No backend, API key, runtime network request, framework, or paid service. All application and data-processing code is JavaScript; GitHub Actions configuration is YAML.

## Put it on your GitHub Pages

1. Put the **contents of this folder**, including `.github`, in the root of a **public** GitHub repository. Keep `package-lock.json`.
2. You configure **Settings → Pages → Build and deployment → Source → GitHub Actions**.
3. In **Actions**, enable workflows if prompted, then run **Refresh data and publish static site** once. The workflow is already scheduled daily at **03:17 UTC / 11:17 Singapore**.

No account settings have been changed and nothing has been uploaded or deployed for you. The workflow only deploys once you have enabled Pages. If publication fails before Pages is configured, the refresh job can still have committed the updated data; rerun after configuring Pages.

The repository must allow its `GITHUB_TOKEN` to push updates. The refresh job requests `contents: write`; organisation policy or branch protections may still block it. In that case adapt your repository policy or commit locally—this project never force-pushes or bypasses protections. The publish job separately uses `pages: write` and `id-token: write`. It uses no personal access token.

**Why Actions as the Pages source?** Commits made with `GITHUB_TOKEN` do not trigger a branch-based Pages build. This workflow explicitly publishes the verified HTML after refreshing it, avoiding a silently stale website. You can manually serve the HTML from a branch, but branch mode alone does not provide this automatic daily publication.

## Local commands (Node.js 22 or newer)

```sh
npm ci --ignore-scripts
npm test
npm run refresh
npm run build
npm run check
npm run preview
```

Open http://127.0.0.1:4173 for preview, or simply double-click `index.html`.

`npm run refresh -- --full` reimports every discovered season. The initial snapshot is included, so building and browsing require no source access. `.cache` is a local, ignored copy of API responses; `npm run refresh -- --full --offline` is useful for testing the importer against responses already fetched on that machine. Cache files are not shipped or published.

Edit `src/index.template.html`, `src/styles.css`, `src/core.js` and `src/app.js`, then run `npm run build`. **`index.html` is generated**; direct changes will be overwritten. There is no bundler. A small Node script inlines the source files and the JSON snapshot.

## What the daily workflow does

Squad ages are current completed years; transfer ages are completed years on the recorded move date. Unknown birth dates or imprecise transfer dates display “—”. Birth dates come from Wikipedia player infoboxes with revision attribution. Daily runs check up to 40 player biographies, reusing dates across records and refreshing them after 30 days. Full refreshes backfill every eligible player. Optional biography failures retain previously sourced dates.

1. Installs the locked, MIT-licensed HTML parser and runs offline regression tests.
2. Fetches Wikipedia's current club squad, discovers linked season articles, and imports transfer tables. Each day checks the latest two seasons, newly discovered/missing seasons, and three rotating older seasons. Use the manual full-refresh option to revisit everything.
3. Normalises identities, dates, positions and fees. Handles table rowspans, common heading variations, loans, releases, and repeat listings of the same dated move.
4. Validates the snapshot, generates the standalone HTML, verifies its embedded data and scripts, then commits only `data/archive.json` and `index.html`.
5. Publishes **only `index.html`** to your configured Pages site. The Actions artifact expires after one day; no dependency cache is created.

Pushes to the default branch also test/build/publish local edits, without an unnecessary upstream pull. Publishing and committing are restricted to the repository's default branch. A competing push causes a safe failure, not an overwrite; rerun the workflow. Automatic commits do not recurse into another workflow.

Critical failures (current squad, recent seasons, bad data or build checks) stop before publishing. Historical failures preserve previous records and are logged as non-blocking warnings in `data/archive.json`; unavailable historical data does not block release. Unexpected mass deletions are rejected. Correct large removals require deliberate review of the snapshot/guard before retrying.

Schedules are best effort and can be delayed, or disabled by GitHub after 60 days of repository inactivity. Manual runs remain available. Enable GitHub workflow-failure email notifications. The page displays the last successful pull and flags data more than three days old even if future workflows stop running.

## Data scope and licence

Data comes from **Wikipedia**, using the public MediaWiki API. See [DATA_SOURCES.md](DATA_SOURCES.md). The imported snapshot and derived tables are published under **CC BY-SA 4.0**; website code is **MIT**. Reuse the data with attribution, the licence link, an indication of changes, and the applicable share-alike terms. The page and every JSON export include attribution and revision URLs linking to article histories.

The current squad comes from the men's first-team section of the main club article, including separately labelled loaned-out players. Retired-number and academy-only squad sections are excluded. Historical tables can contain first-team and academy moves; filter by team where the source explicitly distinguishes them. Unspecified rows are not guessed to be first team. Missing fields remain unknown. Fees shown are source-reported, can be estimates, and may have extra qualifications in the linked table. No currency conversions or net-spend claims are made. No claim of complete historical coverage or official/live verification is made.

## Keeping it free

Use a public repository, the included `github.io` address, and the standard Ubuntu runner already configured. No paid APIs, larger runners, Git LFS, external images, custom domain, subscriptions or external frontend services are used. Free GitHub allowances and policies can change: keep paid usage disabled and check account-level artifact storage, which is shared with other repositories/packages. A compact one-day Pages artifact is the only workflow artifact. No infrastructure is provisioned by the code.

## Files

- `index.html`: the complete deployable site, usable on disk or at any repository subpath.
- `src/`: editable HTML, CSS and browser JavaScript.
- `scripts/`: JavaScript importer, parser, generator, checker and local preview server.
- `data/archive.json`: committed, attributed data snapshot.
- `test/`: offline regression tests for parsing, identity, search, sorting and safety.
- `.github/workflows/daily-data.yml`: daily refresh and explicit Pages publication.

To roll back, restore `data/archive.json` and the matching generated `index.html` from a known-good commit, then push. Restore source changes as well if rolling back a parser or UI bug. Independent fan project; no affiliation with Liverpool FC.
