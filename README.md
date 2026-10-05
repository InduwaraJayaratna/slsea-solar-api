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
npm test       # node:test (no tests yet)
```

`npm start` and `npm run dev` are placeholders until the server is added.

Configuration: copy `.env.example` to `.env` and fill in values (none are needed yet).

## Project status

| Step | Title             | Status |
| ---- | ----------------- | ------ |
| 1    | Project bootstrap | Done   |

## AI disclosure

This project was built with Claude Code. Every prompt is logged in
[docs/ai-prompts.md](docs/ai-prompts.md).
