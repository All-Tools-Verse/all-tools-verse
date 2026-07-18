# Contributing to the All Tools Verse directory

Thanks for helping keep the public directory accurate and useful.

## Good contributions

- Report a broken or redirected All Tools Verse tool link.
- Correct a title or category mismatch.
- Suggest a practical tool that would be useful in the All Tools Verse library.
- Improve documentation, accessibility or the catalog-generation workflow.

This repository catalogs tools published at [All Tools Verse](https://alltoolsverse.com/tools/). It is not a general-purpose directory for unrelated third-party products and does not accept paid placement or backlink exchanges.

## Before opening an issue

1. Search existing issues to avoid duplicates.
2. Include the exact affected URL.
3. Explain the expected behavior or why the proposed tool would be useful.
4. Do not include passwords, private files, personal data or security details in a public issue.

Use the supplied issue forms whenever possible.

## Pull requests

Generated catalog files should not be edited by hand. If your change affects catalog generation:

1. Edit the appropriate script or documentation source.
2. Run `npm run sync` if the catalog should change.
3. Run `npm run validate`.
4. Commit both the source change and regenerated outputs.

Keep pull requests focused and explain:

- what changed;
- why it improves the directory;
- how you verified it.

## Content quality

Keep titles, descriptions and documentation clear, factual and directly relevant to the directory. When correcting a catalog entry, link to the affected All Tools Verse page and explain the source of the correction.

Do not add keyword stuffing, unrelated product links or promotional copy to catalog entries.

## Conduct and security

Participation is covered by the [Code of Conduct](CODE_OF_CONDUCT.md). Report sensitive security issues through the process in [SECURITY.md](SECURITY.md), not through a public issue.
