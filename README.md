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
- Express 5, with morgan (request logs) and dotenv (`.env` loading)
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
npm start      # start the API on http://localhost:3000
npm run dev    # same, restarting on file changes (nodemon)
npm run lint   # ESLint
npm test       # node:test + supertest: everything in tests/, including the seed validator
```

Then try `curl http://localhost:3000/api/v1/health`.

Configuration: copy `.env.example` to `.env` if you want to change a default. Every
setting is optional:

| Variable      | Default       | Meaning                                                     |
| ------------- | ------------- | ----------------------------------------------------------- |
| `NODE_ENV`    | `development` | `test` turns off request logging                            |
| `PORT`        | `3000`        | port the server listens on                                  |
| `DATA_SOURCE` | `memory`      | where repositories read from (`memory` = `data/seed/` JSON) |
| `BODY_LIMIT`  | `100kb`       | largest JSON request body accepted                          |

## Project structure

```
src/
  app.js            builds the Express app (no listening; tests use it directly)
  server.js         starts the server on PORT
  config/           settings from environment variables
  routes/           URL + method -> controller; index.js mounts everything under /api/v1
  controllers/      HTTP in and out
  services/         business rules, no HTTP
  repositories/     the only code that touches data; index.js picks one by DATA_SOURCE
    memory/         loads data/seed/ once and indexes it
  middleware/       request id, logging, content negotiation, 404, errors
  serializers/      what clients see of each resource (explicit field lists)
  utils/            AppError, query validation, pagination, conditional GET
tests/              node:test + supertest
scripts/            seed generator and validator
data/seed/          seed JSON, one array per collection
```

## API

Base path: `/api/v1`. The API speaks JSON only.

All endpoints are open for now; authentication arrives in Step 6. Paths below are
relative to `/api/v1`.

| Method | Path                                         | Returns                                                      |
| ------ | -------------------------------------------- | ------------------------------------------------------------ |
| GET    | `/health`                                    | status, version, data source and record count per collection |
| GET    | `/provinces`                                 | all provinces (collection)                                   |
| GET    | `/provinces/{province_id}`                   | one province                                                 |
| GET    | `/provinces/{province_id}/districts`         | the province's districts (collection)                        |
| GET    | `/districts/{district_id}`                   | one district                                                 |
| GET    | `/districts/{district_id}/substations`       | the district's substations (collection)                      |
| GET    | `/substations/{substation_id}`               | one substation                                               |
| GET    | `/substations/{substation_id}/installations` | the substation's installations (collection)                  |
| GET    | `/installations`                             | installations across the estate (collection, filterable)     |
| GET    | `/installations/{installation_id}`           | one installation                                             |

A nested collection returns 404 if its parent does not exist, and 200 with an empty
`data` array if the parent exists but has no children.

### Collections and pagination

Collections share one envelope. A single resource is returned as a bare object.

```json
{
  "data": [{ "id": "INST-0051", "...": "..." }],
  "pagination": { "total": 200, "page": 2, "page_size": 50, "total_pages": 4 },
  "links": {
    "self": "/api/v1/installations?page=2&page_size=50",
    "first": "/api/v1/installations?page=1&page_size=50",
    "last": "/api/v1/installations?page=4&page_size=50",
    "next": "/api/v1/installations?page=3&page_size=50",
    "prev": "/api/v1/installations?page=1&page_size=50"
  }
}
```

- `page` (default 1) and `page_size` (default 50, max 200).
- `next` and `prev` are `null` when there is no such page. Links keep any filters
  the request used.
- The same next/prev links are sent in a `Link` header (`rel="next"`, `rel="prev"`).

`GET /installations` filters (combine freely): `province_id`, `district_id`,
`substation_id`, `status` (`active`, `inactive`, `maintenance`). A well-formed id
that matches nothing returns an empty page.

An unknown query parameter, a repeated parameter, an invalid filter value, or an
invalid `page`/`page_size` returns 400. `details` names each bad parameter:

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid query parameters",
    "details": [{ "parameter": "page_size", "message": "must be a whole number from 1 to 200" }]
  }
}
```

### Conditional GET and caching

Every GET response has:

- `ETag`: a strong validator, a SHA-256 hash of the exact response body.
- `Last-Modified`: the resource's `updated_at`, or the newest `updated_at` in the
  collection. Only installations have `updated_at`, so provinces, districts and
  substations rely on the ETag alone.
- `Cache-Control: private, no-cache`: clients may keep a copy but must revalidate
  it each time.

Send the ETag back in `If-None-Match` (or the date in `If-Modified-Since`). If your
copy is still current, the response is `304 Not Modified` with an empty body. If
both headers are sent, `If-None-Match` decides.

```sh
curl -i http://localhost:3000/api/v1/provinces/WP                                # note the ETag
curl -i -H 'If-None-Match: "<etag>"' http://localhost:3000/api/v1/provinces/WP   # 304
```

Every response has an `X-Request-Id` header (a caller's own id is reused if it is
safe), which also appears in the server log line for that request.

### Errors

Every error uses the same body:

```json
{ "error": { "code": "NOT_FOUND", "message": "No resource at GET /api/v1/nope", "details": [] } }
```

`code` is stable, so programs can check it. `message` is for people. `details` lists
specifics (for example, one entry per invalid field) and is otherwise empty.

| Status | Code                     | When                                                                  |
| ------ | ------------------------ | --------------------------------------------------------------------- |
| 400    | `BAD_REQUEST`            | invalid query parameter, or a body that is not valid JSON             |
| 404    | `NOT_FOUND`              | no route at that path, or the resource (or its parent) does not exist |
| 405    | `METHOD_NOT_ALLOWED`     | path exists but not for this method; `Allow` header lists methods     |
| 406    | `NOT_ACCEPTABLE`         | `Accept` header rules out `application/json`                          |
| 413    | `PAYLOAD_TOO_LARGE`      | body bigger than `BODY_LIMIT`                                         |
| 415    | `UNSUPPORTED_MEDIA_TYPE` | POST/PUT/PATCH body that is not `application/json`                    |
| 500    | `INTERNAL_ERROR`         | unexpected error; details are logged, never returned                  |

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

| Step | Title                                   | Status |
| ---- | --------------------------------------- | ------ |
| 1    | Project bootstrap                       | Done   |
| 2    | Data model and seed data                | Done   |
| 3    | Express skeleton and error contract     | Done   |
| 4    | Hierarchy read path and conditional GET | Done   |

## AI disclosure

This project was built with Claude Code. Every prompt is logged in
[docs/ai-prompts.md](docs/ai-prompts.md).
