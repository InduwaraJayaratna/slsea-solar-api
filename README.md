# slsea-solar-api

REST API for the Sri Lanka Sustainable Energy Authority (SLSEA): real-time and
historical solar generation data from rooftop installations.

Coursework for NB6007CEM Web API Development.

## Purpose

SLSEA needs one consistent HTTP interface for the solar generation readings that
rooftop installations report, both as they arrive (real-time) and over time
(historical). This API exposes that data as JSON resources.

## Stack

- Node.js 22 (see `.nvmrc`), CommonJS
- Express 5 (added with the first endpoint)
- JSON only; `snake_case` fields and query parameters; ISO 8601 UTC timestamps
- Layering: routes -> controllers -> services -> repositories
- Tests: `node:test` + `supertest`
- Lint and format: ESLint (flat config) + Prettier

## Branching workflow

| Branch        | Role                                                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `development` | All work happens here, in small Conventional Commits.                                                                       |
| `main`        | Only changes by merging `development` (`--no-ff`) at the end of a step, so it always holds the last completed, tested step. |

No squashing, rebasing or force pushing, so every commit stays visible in `main`'s
history.

## How to run

Requirements: Node.js 22 (`nvm use` picks it up from `.nvmrc`).

```sh
npm install
npm run lint   # ESLint
npm test       # node:test: runs the tests in tests/, including the seed validator
```

`npm start` and `npm run dev` are placeholders until the server is added.

Configuration: copy `.env.example` to `.env` and fill in values (none are needed yet).

## Data model and seed data

The domain model (entities, keys, relationships, ER diagram and modelling decisions)
is in [docs/data-model.md](docs/data-model.md).

Seed data lives in `data/seed/`, as one flat JSON array per collection:

| File                 | Records | Contents                                                            |
| -------------------- | ------- | ------------------------------------------------------------------- |
| `provinces.json`     | 9       | the provinces of Sri Lanka                                          |
| `districts.json`     | 25      | the districts, each with its province                               |
| `substations.json`   | 30      | grid substations, at least one per district                         |
| `installations.json` | 200     | rooftop installations (about 95% active)                            |
| `readings.json`      | 131,027 | 15-minute readings for 7 days (non-active installations stop early) |
| `users.json`         | 37      | 1 admin, 2 national, 9 provincial, 25 district                      |

```sh
npm run seed:generate                                 # window ends now (rounded down to 15 min)
npm run seed:generate -- --end=2026-10-06T00:00:00Z --days=7
npm run seed:validate                                 # scale, unique ids, foreign keys, meter totals
```

The generator is deterministic: the same `--end` and `--days` always give identical
files. The committed seed was generated with `--end=2026-10-06T00:00:00Z --days=7`.
Pass the same values when regenerating, so the files only change when the data
should.

Demo logins and sample device keys are in
[docs/demo-credentials.md](docs/demo-credentials.md) (seed/demo data only). Plaintext
keys for every installation are written to `data/seed/device-keys.local.json`, which
is git-ignored.

## Project status

| Step | Title                    | Status |
| ---- | ------------------------ | ------ |
| 1    | Project bootstrap        | Done   |
| 2    | Data model and seed data | Done   |

## AI disclosure

This project was built with Claude Code. Every prompt is logged in
[docs/ai-prompts.md](docs/ai-prompts.md).
