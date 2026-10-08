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
- Express 5, with morgan (request logs), dotenv (`.env` loading), helmet (security
  headers) and cors
- Auth: jsonwebtoken (HS256 access tokens), bcryptjs (password hashes)
- Data: MongoDB Atlas through Mongoose, or the seed JSON in memory (`DATA_SOURCE`)
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
npm run seed:mongo                       # load data/seed/ into MongoDB (replaces what is there)
npm run smoke -- http://localhost:3000   # end-to-end checks against a running server
```

Then try `curl http://localhost:3000/api/v1/health`.

Configuration: copy `.env.example` to `.env`. `JWT_SECRET` is required: the server
refuses to start without one (at least 32 characters). Generate one with:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Everything else is optional:

| Variable         | Default                                        | Meaning                                                                                 |
| ---------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| `NODE_ENV`       | `development`                                  | `test` turns off request logging                                                        |
| `PORT`           | `3000`                                         | port the server listens on                                                              |
| `DATA_SOURCE`    | `mongo` if `MONGODB_URI` is set, else `memory` | where repositories read from: `mongo` (MongoDB) or `memory` (`data/seed/` JSON)         |
| `MONGODB_URI`    | none                                           | MongoDB connection string. **Secret** (contains the password): never commit or print it |
| `MONGODB_DB`     | `slsea-solar`                                  | database name inside the cluster                                                        |
| `BODY_LIMIT`     | `100kb`                                        | largest JSON request body accepted                                                      |
| `JWT_SECRET`     | none (required)                                | secret for signing access tokens (HS256)                                                |
| `JWT_EXPIRES_IN` | `1h`                                           | access token lifetime (`3600`, `1h`, `30m`)                                             |
| `CORS_ORIGIN`    | `*`                                            | origin browsers may call the API from                                                   |

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
    mongo/          the same interface over MongoDB (Mongoose queries and aggregations)
  models/           Mongoose schemas and indexes, one per collection
  middleware/       request id, logging, content negotiation, 404, errors
  serializers/      what clients see of each resource (explicit field lists)
  utils/            AppError, query validation, pagination, conditional GET, clock
tests/              node:test + supertest
scripts/            seed generator and validator
data/seed/          seed JSON, one array per collection
```

## API

Base path: `/api/v1`. The API speaks JSON only.

Paths below are relative to `/api/v1`. Every GET except `/health` needs a user
access token (see [Authentication](#authentication)); writes are covered in
[Writes](#writes).

| Method | Path                                                     | Returns                                                                                 |
| ------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| GET    | `/health`                                                | status, version, data source and record count per collection                            |
| GET    | `/provinces`                                             | all provinces (collection)                                                              |
| GET    | `/provinces/{province_id}`                               | one province                                                                            |
| GET    | `/provinces/{province_id}/districts`                     | the province's districts (collection)                                                   |
| GET    | `/districts/{district_id}`                               | one district                                                                            |
| GET    | `/districts/{district_id}/substations`                   | the district's substations (collection)                                                 |
| GET    | `/districts/{district_id}/generation-summary`            | the district's generation today (or on `?date=`), computed on request                   |
| GET    | `/substations/{substation_id}`                           | one substation                                                                          |
| GET    | `/substations/{substation_id}/installations`             | the substation's installations (collection)                                             |
| GET    | `/installations`                                         | installations across the estate (collection, filterable)                                |
| GET    | `/installations/{installation_id}`                       | one installation                                                                        |
| GET    | `/installations/{installation_id}/overview`              | the installation with its substation, district, province, last reading and energy today |
| GET    | `/installations/{installation_id}/last-reading`          | the latest reading, with `age_seconds` and `stale`                                      |
| GET    | `/installations/{installation_id}/readings`              | the installation's reading history (collection)                                         |
| GET    | `/installations/{installation_id}/readings/{reading_id}` | one reading                                                                             |
| GET    | `/readings`                                              | readings across the estate (collection, filterable)                                     |
| POST   | `/auth/tokens`                                           | sign in: an access token (open, no token needed)                                        |
| POST   | `/installations/{installation_id}/readings`              | a device reports a reading (device key)                                                 |
| POST   | `/substations/{substation_id}/installations`             | create an installation (admin)                                                          |
| PUT    | `/installations/{installation_id}`                       | replace an installation's editable fields (admin)                                       |
| PATCH  | `/installations/{installation_id}`                       | change some of its fields (admin)                                                       |
| DELETE | `/installations/{installation_id}`                       | delete an installation that has no readings (admin)                                     |

A nested collection returns 404 if its parent does not exist, and 200 with an empty
`data` array if the parent exists but has no children.

### Authentication

There are two kinds of client, each with its own scheme.

**SLSEA users (read clients)** sign in for a JWT access token, then send it as a
Bearer token:

```sh
curl -X POST http://localhost:3000/api/v1/auth/tokens \
  -H 'Content-Type: application/json' \
  -d '{"username": "dist.col", "password": "SolarDemo#2026"}'
# {"access_token": "eyJ...", "token_type": "Bearer", "expires_in": 3600}

curl http://localhost:3000/api/v1/installations -H 'Authorization: Bearer eyJ...'
```

- The token (HS256, 1 hour) carries the user's id (`sub`), `role`, `province_id` and
  `district_id`, so access checks need no database lookup.
- A wrong username and a wrong password get the same 401, so logins do not reveal
  which usernames exist.
- A missing, malformed or expired token gets 401 with `WWW-Authenticate: Bearer`.
- Demo logins are in [docs/demo-credentials.md](docs/demo-credentials.md).

**Metering devices (write clients)** send their device key in `X-Device-Key`. The key
is hashed with SHA-256 and compared, in constant time, with the stored hash of the
installation in the URL. A missing or unknown key gets 401; a valid key for a
different installation gets 403. Device keys do not work on read endpoints, and user
tokens do not work on device endpoints.

### District generation summary

`GET /districts/{district_id}/generation-summary` is a processing resource: it is
computed on request from every installation in the district, and nothing is stored.
It follows the same jurisdiction rules as the district itself (403 outside your
scope).

```json
{
  "district": { "id": "COL", "name": "Colombo", "province_id": "WP" },
  "date": "2026-10-05",
  "generated_at": "2026-10-06T00:10:00Z",
  "installation_count": 21,
  "reporting_count": 19,
  "offline_count": 2,
  "current_power_kw": 0,
  "energy_today_kwh": 1172.483,
  "installed_capacity_kw": 236,
  "utilisation_pct": 0,
  "peak_power_kw": 150.376,
  "peak_at": "2026-10-05T06:00:00Z",
  "by_substation": [
    {
      "substation_id": "SUB-001",
      "name": "Kolonnawa Grid Substation",
      "installation_count": 7,
      "current_power_kw": 0,
      "energy_today_kwh": 288.046
    }
  ]
}
```

- `date` (`?date=YYYY-MM-DD`, default today) is a Sri Lanka calendar day. It decides
  `energy_today_kwh` and the peak. An invalid or future date returns 400.
- `reporting_count`, `current_power_kw` and `utilisation_pct` always describe _now_.
  An installation is reporting if its latest reading is at most 30 minutes old (the
  same rule as `last-reading`'s `stale`). Only reporting installations count towards
  current power.
- `energy_today_kwh`: for each installation, its last meter total in the day minus
  its last total before the day started, summed (the same formula as the overview's
  `today`).
- `utilisation_pct` is current power as a percentage of `installed_capacity_kw` (the
  capacity of every installation in the district).
- `peak_power_kw` / `peak_at`: the moment in the day when the district's summed power
  was highest.

### Writes

**Ingestion.** A device posts one reading at a time:

```sh
curl -X POST http://localhost:3000/api/v1/installations/INST-0001/readings \
  -H 'X-Device-Key: dk_...' -H 'Content-Type: application/json' \
  -d '{"timestamp": "2026-10-06T06:15:00Z", "power_kw": 3.2, "energy_kwh": 15340.5, "voltage_v": 231.0}'
```

- 201 with the reading as the body, and `Location` pointing at it.
- `timestamp`: an ISO 8601 UTC date-time on a whole minute, at most 5 minutes in the
  future. `power_kw` and `energy_kwh` must be at least 0; `voltage_v` must be above 0.
- The reading id is the installation id plus the timestamp (`INST-0001-20261006T0615Z`),
  so a device retrying a reading gets 409 `DUPLICATE_READING` instead of a duplicate.
- 409 `ENERGY_DECREASED` if `energy_kwh` would make the meter total go backwards;
  409 `INSTALLATION_NOT_ACTIVE` if the installation is inactive or under maintenance.
- Readings are append-only: PUT, PATCH and DELETE on readings return 405.

**Installation management (admin only).** Other roles get 403; a device key gets 401.

- `POST /substations/{substation_id}/installations` creates one: 201 with `Location`.
  The server sets the id, the substation/district/province, and a new device key.
  **The plaintext `device_key` is in this response only** (it is stored only as a
  hash and can never be fetched again). A `meter_id` or `inverter_id` already in
  use gets 409.
- `PUT /installations/{installation_id}` replaces all editable fields (every field is
  required). Sending the same PUT twice gives the same result.
- `PATCH /installations/{installation_id}` changes only the fields sent, e.g.
  `{"status": "inactive"}`. Read-only fields (`id`, `substation_id`, `district_id`,
  `province_id`, `created_at`, `updated_at`) and unknown fields get 400.
- `DELETE /installations/{installation_id}` gets 204, and 404 if repeated. An
  installation with readings cannot be deleted (409 `INSTALLATION_HAS_READINGS`): set
  its status to `inactive` instead, so its history is kept.

Editable fields: `meter_id`, `inverter_id`, `site_name`, `address`, `capacity_kw`
(above 0, at most 100), `panel_count` (whole number, at least 1), `status`,
`commissioned_at` (UTC date-time), `latitude` and `longitude` (within Sri Lanka).

**Optimistic concurrency.** PUT, PATCH and DELETE honour `If-Match`. Send the ETag
from your last GET; if someone else has changed the installation since, you get
**412 Precondition Failed** instead of overwriting their change. Successful writes
return the new `ETag` and `Last-Modified`.

Invalid bodies get 400 with one `details` entry per bad field:

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid request body",
    "details": [
      { "field": "power_kw", "message": "must be at least 0" },
      { "field": "voltage_v", "message": "is required" }
    ]
  }
}
```

**Provinces, districts and substations are read-only reference data:** POST, PUT,
PATCH and DELETE on them return 405.

With `DATA_SOURCE=mongo`, writes are stored in MongoDB and survive restarts. In
memory mode (`DATA_SOURCE=memory`), writes change only the in-memory data. They are
lost when the server restarts, and the seed files are never modified.

### Jurisdiction

Every read is limited to the caller's jurisdiction:

| Role                | Can read                                                              |
| ------------------- | --------------------------------------------------------------------- |
| `admin`, `national` | everything                                                            |
| `provincial`        | their province and everything in it                                   |
| `district`          | their district and everything in it, plus their province's own record |

- A single resource, or a nested collection's parent, outside the jurisdiction gets
  **403** (it exists, but is not yours). One that does not exist gets **404**.
- Collections (`/provinces`, `/installations`, `/readings`, ...) are narrowed to the
  jurisdiction automatically. For example, a Colombo district user's `/provinces`
  returns only `WP`, and their `/installations` only Colombo's.
- An explicit filter outside the jurisdiction (e.g. `?district_id=GAM` for a Colombo
  user) gets 403.

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

### Readings

Both reading collections (`/installations/{installation_id}/readings` and
`/readings`) accept:

| Parameter           | Meaning                                                                |
| ------------------- | ---------------------------------------------------------------------- |
| `from`              | start of the time window, inclusive (ISO 8601)                         |
| `to`                | end of the time window, exclusive (ISO 8601)                           |
| `sort`              | `-timestamp` (newest first, the default) or `timestamp` (oldest first) |
| `page`, `page_size` | as for every collection                                                |

`from` and `to` take a date (`2026-10-01` = 00:00 UTC) or a date-time with a time
zone (`2026-10-01T00:00:00Z`, or `2026-10-01T00:00:00+05:30` for Sri Lanka time).
Write a `+` as `%2B` in a URL, or it is read as a space. A time without a time zone,
an impossible date, or `from` not before `to` returns 400.

`GET /readings` also filters by jurisdiction: `province_id`, `district_id`,
`substation_id`, `installation_id`. These are first resolved to the matching
installations, then their readings are returned.

```sh
curl 'http://localhost:3000/api/v1/readings?district_id=COL&from=2026-10-01&to=2026-10-02&sort=timestamp'
```

`last-reading` is a derived resource: the newest reading, plus `age_seconds` (how old
it is now) and `stale` (`true` when older than 30 minutes, since installations report
every 15). It returns 404 `NOT_FOUND` for an unknown installation and 404
`NO_READINGS` for one that has not reported yet.

`overview` gives an operations screen everything in one response:

```json
{
  "installation": { "id": "INST-0001", "...": "..." },
  "substation": { "id": "SUB-001", "name": "Kolonnawa Grid Substation" },
  "district": { "id": "COL", "name": "Colombo" },
  "province": { "id": "WP", "name": "Western" },
  "last_reading": {
    "id": "INST-0001-20261006T0000Z",
    "timestamp": "2026-10-06T00:00:00Z",
    "...": "..."
  },
  "today": { "date": "2026-10-06", "energy_kwh": 0 }
}
```

`today` is the current Sri Lanka calendar day (UTC+05:30). `energy_kwh` is the latest
meter total today minus the last total before local midnight.

The committed seed data ends at 2026-10-06 00:00 UTC, so against the real clock
every `last-reading` is stale and today's energy is 0. For a live-looking demo,
regenerate the seed so it ends now (`npm run seed:generate`). Doing so changes the
committed files.

### Conditional GET and caching

Every GET response has:

- `ETag`: a strong validator, a SHA-256 hash of the exact response body. The one
  exception is `last-reading`: its `age_seconds` changes every second, so it gets a
  weak ETag (`W/"..."`) built from the reading's id and `stale`.
- `Last-Modified`, where the data has a time to give:
  - installations: `updated_at` (or, for a collection, the newest `updated_at`);
  - readings: the reading's `timestamp` (or, for a collection, the newest matching
    reading's);
  - overview: the latest of the installation's `updated_at`, its newest reading and
    local midnight (when `today` restarts);
  - provinces, districts and substations have no timestamp, so they rely on the
    ETag alone.
  - the generation summary has a weak ETag built from everything except
    `generated_at`, and no `Last-Modified`: its figures change with the clock, not
    only when data arrives.
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

| Status | Code                        | When                                                                                                             |
| ------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 400    | `BAD_REQUEST`               | invalid query parameter, invalid body field, or a body that is not valid JSON                                    |
| 401    | `UNAUTHORIZED`              | missing, malformed or expired token, wrong login, or bad device key; `WWW-Authenticate` says how to authenticate |
| 403    | `FORBIDDEN`                 | the resource exists but is outside your jurisdiction (or the device key is for another installation)             |
| 404    | `NOT_FOUND`                 | no route at that path, or the resource (or its parent) does not exist                                            |
| 405    | `METHOD_NOT_ALLOWED`        | path exists but not for this method; `Allow` header lists methods                                                |
| 406    | `NOT_ACCEPTABLE`            | `Accept` header rules out `application/json`                                                                     |
| 409    | `CONFLICT`                  | a `meter_id` or `inverter_id` already in use                                                                     |
| 409    | `DUPLICATE_READING`         | a reading for that installation and time already exists                                                          |
| 409    | `ENERGY_DECREASED`          | `energy_kwh` would make the meter total go backwards                                                             |
| 409    | `INSTALLATION_NOT_ACTIVE`   | readings sent to an installation that is not active                                                              |
| 409    | `INSTALLATION_HAS_READINGS` | deleting an installation that has readings (set it inactive instead)                                             |
| 412    | `PRECONDITION_FAILED`       | `If-Match` does not match the current ETag                                                                       |
| 413    | `PAYLOAD_TOO_LARGE`         | body bigger than `BODY_LIMIT`                                                                                    |
| 415    | `UNSUPPORTED_MEDIA_TYPE`    | POST/PUT/PATCH body that is not `application/json`                                                               |
| 500    | `INTERNAL_ERROR`            | unexpected error; details are logged, never returned                                                             |

## Data sources

The repositories are the only code that touches data, and there are two
implementations with the same interface. Services, controllers and routes do not
know which one is in use.

| `DATA_SOURCE` | Data                                              | Used for                                                          |
| ------------- | ------------------------------------------------- | ----------------------------------------------------------------- |
| `mongo`       | MongoDB Atlas, via Mongoose                       | running the API for real (the default when `MONGODB_URI` is set)  |
| `memory`      | `data/seed/*.json`, loaded into memory at startup | the test suite (fast, no network), and running without a database |

**Setting up MongoDB:**

1. Put `MONGODB_URI` and `MONGODB_DB` in `.env` (see `.env.example`). In Atlas, allow
   your IP under Network Access.
2. `npm run seed:mongo`: deletes each collection, inserts the seed in batches of
   5,000, creates the indexes and prints the document counts. It is safe to re-run,
   and it refuses to run when `NODE_ENV=production` unless given `--force`.
3. `npm start`: connects to MongoDB before accepting requests.
4. `npm run smoke -- http://localhost:3000`: health, login, listings, a 304, a 403,
   one device ingest and the district summary. The ingest stores a real reading for
   `INST-0001`; re-run `seed:mongo` to remove it. It needs that installation's device
   key from `data/seed/device-keys.local.json`, or from `SMOKE_DEVICE_KEY`.

Each index in `src/models/` has a comment naming the endpoint it serves. Timestamps
are stored as BSON dates, and MongoDB's `_id` and `__v` never appear in responses.

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
| 5    | Operational and analytical reads        | Done   |
| 6    | Authentication and jurisdiction scoping | Done   |
| 7    | Write path and CRUD semantics           | Done   |
| 8    | District generation summary             | Done   |
| 9    | MongoDB persistence                     | Done   |

## AI disclosure

This project was built with Claude Code. Every prompt is logged in
[docs/ai-prompts.md](docs/ai-prompts.md).
