# Data sources and attribution

The Red Archive adapts Wikipedia articles by **Wikipedia contributors**, licensed under [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/), subject to source notices. Adaptations: extraction of squad/transfer tables, removal of markup and citation markers, normalisation of fields, filtering, joining and deduplication. The data and derived tables are offered under CC BY-SA 4.0. The separate application source is MIT-licensed.

## Sources

- [Liverpool F.C.](https://en.wikipedia.org/wiki/Liverpool_F.C.): the dated first-team squad section; includes loaned-out players in that section.
- [List of Liverpool F.C. seasons](https://en.wikipedia.org/wiki/List_of_Liverpool_F.C._seasons): discovery of existing season articles.
- Linked Liverpool season articles: incoming/outgoing transfer and loan tables. The exact revision URL and retrieval timestamp for every imported article are recorded in `data/archive.json` under `sources` and linked in the website's Sources section. Each record refers to its source by `sourceId`.
- Public endpoint: `https://en.wikipedia.org/w/api.php` (`action=parse`, `text`, `links`, `revid`). No enterprise endpoint or paid plan.

Article URLs link to histories identifying contributors. For the full attribution history of a specific revision, follow the history link on its source page. Licence: https://creativecommons.org/licenses/by-sa/4.0/legalcode.en

This project does not scrape Transfermarkt or any other proprietary football database. No Wikipedia photos, flags, club crests or other media are copied; their separate licences are not assumed to match the text licence. The geometric pitch illustration is original CSS.

## Interpretation

- Squad membership is taken from an explicit current squad table, never inferred from an absent membership end date.
- `squadAsOf` is the source's stated date. `lastChecked` is when the importer succeeded. Neither claims official verification.
- Article-linked player IDs are used instead of names alone. Unlinked names get source-specific IDs to avoid conflating unrelated people. Article renames/redirects can still split a player's history; source links remain available for inspection.
- Direction is relative to Liverpool. Outgoing loans do not imply a permanent sale. A completed loan is not invented from its expected expiry date.
- A source's academy/first-team grouping is preserved where explicit; otherwise group is `Unspecified`.
- Sporting nation is reproduced as listed, not inferred citizenship.
- Exact dates are ISO-formatted only when fully specified and valid. Month/year-only dates retain their precision. Unparsed date text is displayed verbatim.
- Only simple explicit currency amounts are numerically sortable. Free transfers are zero; undisclosed/complex/unstated fees are null. Source footnotes may qualify fees or dates: consult the linked original table. Different currencies are never silently compared.
- Records with an identical player ID, full date, club, direction and move type are deduplicated across season articles. The earliest listed season is retained. Season-only records remain separate to avoid merging distinct moves.
- Historical gaps and unsupported historical tables are non-blocking. Current/recent-source errors and suspicious large removals fail the update. Imports are automated, not individually fact-checked.

Wikimedia terms: https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use#7._Licensing_of_Content

GitHub scheduling: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule

GitHub token-trigger limitation: https://docs.github.com/en/actions/concepts/security/github_token
