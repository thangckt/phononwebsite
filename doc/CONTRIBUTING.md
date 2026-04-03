# Contributing Guide

This guide focuses on practical repository organization for day-to-day work.

## Project Areas

- `src/`: Frontend source code (rendering, UI, parsers, utilities).
- `src/static_libs/`: Vendored browser-side static libraries.
- `css/`: Styles for website pages.
- `test/`: JavaScript tests (`*.test.cjs`) and fixtures.
- `python/phononweb/`: Python package and CLI scripts.
- `python/phononweb/tests/`: Python test suite.
- `build/`: Generated deploy output.
- `data/localdb/`, `data/contribdb/`, `data/mpdb/`: Runtime material databases.

## Placement Rules

- Add new frontend logic in `src/` (not in HTML inline scripts).
- Add new JS tests in `test/` and fixtures in `test/fixtures/`.
- Add Python features in `python/phononweb/` and tests in `python/phononweb/tests/`.
- Keep generated files out of source folders.

## Naming Rules

- JavaScript tests: `name.test.mjs`
- Python tests: `test_*.py`
- Keep file names lowercase and descriptive.

## Build and Test

- Install deps: `npm install`
- Build local site bundle: `npm run build`
- Build deploy site: `npm run build:site`
- JS tests: `npm test`
- Python tests: `npm run test:py`

## CI Notes

- Workflows live in `.github/workflows/`.
- Keep paths in scripts/workflows aligned when moving files.
- If you reorganize folders, update `package.json` scripts and workflow steps in the same PR.
