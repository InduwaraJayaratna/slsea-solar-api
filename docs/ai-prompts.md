# AI disclosure - prompt log

Tool: Claude Code

Each step's prompt is recorded verbatim below, with the date and a short summary of
what was generated.

## Step 1 - Project bootstrap

Date: 2026-10-06

Prompt:

```text
You are helping me build my NB6007CEM Web API Development coursework: a REST API called slsea-solar-api for the Sri Lanka Sustainable Energy Authority (real-time and historical solar generation data from rooftop installations). Read everything in docs/reference/ first: the coursework brief, and the REST API Design Guidelines white paper if it is there. The white paper is the design authority. Where it conflicts with anything I ask in this or later prompts, tell me and follow the white paper.

In this step do project setup only. Do not write any API code yet.

1. Repository and branches:
   - Initialise git with a main branch. Add .gitignore (node_modules, .env, .aws-sam, coverage, *.local.json, docs/reference/, OS and IDE files) and a one-line README.md, and make one initial commit on main.
   - Using the gh CLI, create a private GitHub repository named exactly slsea-solar-api under my account, set it as origin, and push main. If gh is not authenticated, stop and tell me the command to run.
   - Create a development branch from main, push it with upstream tracking, and stay on it. Everything else in this step, and all work in later steps, happens on development.

2. Create an npm project named slsea-solar-api: Node.js 22, CommonJS (require). Add placeholder npm scripts: start, dev, test, lint. Add .editorconfig, .nvmrc, a minimal ESLint + Prettier config, and an empty .env.example.

3. Create CLAUDE.md with these standing rules for every later step:
   - Stack: Node 22, Express 5, CommonJS, JSON only. Field names and query parameters are snake_case. Timestamps are ISO 8601 UTC.
   - Layering: routes -> controllers -> services -> repositories. Only repositories touch the data source, so the data source can be swapped later without changing the layers above.
   - Target: Richardson Maturity Level 2. No hypermedia controls beyond pagination links.
   - Keep code simple, and comment the reasoning where it is not obvious. I must be able to explain every file at a viva. Prefer few dependencies. No dead code.
   - Tests: node:test + supertest in tests/. Every new endpoint gets at least one success test and one failure test.
   - Never commit secrets. Never print secret values.
   - Branching: all development happens on the development branch. Never commit directly to main. main only changes when development is merged into it at the end of a step, so main always holds the last completed, tested step. Before starting any step, check that the current branch is development and that it is up to date with origin.
   - Step wrap-up, done at the end of every step:
     a. Run npm run lint and npm test and fix any failures.
     b. Append the prompt I gave you, verbatim, to docs/ai-prompts.md under a heading "Step N - <title>" with today's date and a 3-line summary of what was generated.
     c. Update README.md.
     d. Make small logical commits on development using Conventional Commits (feat:, fix:, docs:, chore:, test:) - several per step, not one.
     e. Push development to origin.
     f. Merge development into main with a merge commit: git checkout main, git pull, git merge --no-ff development -m "merge: step N - <title>", git push origin main, git checkout development. Never squash, rebase or force push; the individual commits must stay visible in main's history.
     g. Give me a short plain-English explanation of what you built, the design decisions and which guideline each one follows, and 3 viva questions I should be able to answer about it.

4. Expand README.md (purpose, stack, branching workflow, how to run - filled in as we go) and create docs/ai-prompts.md (title "AI disclosure - prompt log", tool: Claude Code).

Then do the step wrap-up as Step 1 - Project bootstrap.
```

Summary of what was generated:

- Git repo with `main` and `development` branches, pushed to a private GitHub repo.
- npm project (Node 22, CommonJS) with ESLint + Prettier, `.editorconfig`, `.nvmrc`, `.env.example`.
- `CLAUDE.md` standing rules, expanded `README.md`, and this prompt log.

## Step 2 - Data model and seed data

Date: 2026-10-06

Prompt:

```text
Step 2 - Data model and seed data. No Express code yet.

1. Write docs/data-model.md: the implementation-independent domain model from the brief. Entities: Province, District, GridSubstation, SolarInstallation, GenerationReading, User. Show attributes, keys and relationships (Province 1-* District 1-* GridSubstation 1-* SolarInstallation 1-* GenerationReading) with a Mermaid ER diagram. State and justify the two marked modelling decisions: (a) meter_id and inverter_id are attributes of SolarInstallation, there is no Device entity; (b) GenerationReading is its own append-only time series, never last-value fields on the installation.

2. Write scripts/generate-seed.js (plain Node; bcryptjs is the only dependency) that writes one flat JSON array per collection into data/seed/: provinces.json, districts.json, substations.json, installations.json, readings.json, users.json. Flat per-collection arrays, not one nested object. Requirements:
   - Deterministic: use a seeded pseudo-random generator so the same command gives the same data. Accept --end=<ISO date> (default: now, rounded down to 15 minutes) and --days=7.
   - provinces: the 9 real provinces of Sri Lanka. Fields: id (for example "WP"), name.
   - districts: the 25 real districts, each with the correct province_id. Fields: id (for example "COL"), name, province_id.
   - substations: 30, at least one per district, more in populous districts. Fields: id ("SUB-001"), name, district_id, voltage_kv, capacity_mva, latitude, longitude.
   - installations: 200, spread across all substations. Fields: id ("INST-0001"), substation_id, district_id and province_id (denormalised copies used for fast jurisdiction checks - record this decision in data-model.md), meter_id and inverter_id (both unique), site_name, address, capacity_kw (2 to 20), panel_count, status (active | inactive | maintenance, about 95% active), commissioned_at, latitude and longitude plausible for the district, device_key_hash, created_at, updated_at.
   - readings: one every 15 minutes for 7 days per installation (672 each). Fields: id (installation id + compact UTC timestamp, for example "INST-0001-20261005T0615Z"), installation_id, timestamp (UTC), power_kw, energy_kwh (cumulative meter total, never decreases), voltage_v. Realistic diurnal shape in Sri Lanka time (UTC+05:30): zero overnight, rising from about 06:00, peaking around noon near capacity_kw, falling to zero by about 18:30, with per-day cloud variation and small noise. Installations that are not active have a gap in their readings. Write readings.json compactly, one record per line.
   - users: 1 admin, 2 national, 9 provincial (one per province), 25 district (one per district). Fields: id, username, full_name, role (admin | national | provincial | district), province_id and district_id (null where not applicable), password_hash (bcrypt). Use one documented demo password for all seed users.
   - Device keys: generate one random key per installation, store only its SHA-256 hash in installations.json, and write the plaintext keys to data/seed/device-keys.local.json (git-ignored). Also write docs/demo-credentials.md listing the demo user logins and the plaintext device keys for the first 3 installations only, clearly marked as seed/demo data.

3. Write scripts/validate-seed.js that checks: counts meet the brief's scale (9 / 25 / 20+ / 200+ / 1+ week per installation), every foreign key resolves, ids are unique, and energy_kwh never decreases within an installation. Add npm scripts seed:generate and seed:validate, and make npm test run the validator.

4. Run both scripts, show me the record count and file size per collection, and commit the generator, the validator and the generated JSON.

Then do the step wrap-up as Step 2 - Data model and seed data.
```

Summary of what was generated:

- `docs/data-model.md`: domain model with a Mermaid ER diagram and the justified modelling decisions (no Device entity, append-only readings, denormalised jurisdiction ids).
- `scripts/generate-seed.js`: deterministic seed generator writing 9 provinces, 25 districts, 30 substations, 200 installations, 131,027 readings and 37 users to `data/seed/`, plus `docs/demo-credentials.md`.
- `scripts/validate-seed.js` and `tests/seed.test.js`: checks for scale, unique ids, foreign keys and meter totals, run by `npm test`.

## Step 3 - Express skeleton and error contract

Date: 2026-10-06

Prompt:

```text
Step 3 - Express application skeleton on top of the seed JSON. No domain endpoints yet except /health.

1. Install express (v5), morgan and dotenv, plus dev tools supertest and nodemon. Structure:
   src/app.js (builds and exports the Express app, does not listen), src/server.js (listens on PORT), src/config/, src/routes/, src/controllers/, src/services/, src/repositories/, src/middleware/, src/utils/.

2. Data layer: src/repositories/memory/ loads the six files in data/seed/ once at startup, using path.join(__dirname, ...) so it never depends on the working directory, and builds in-memory indexes (by id; readings grouped by installation_id and sorted by timestamp). Expose one repository per entity, selected through src/repositories/index.js from a DATA_SOURCE env var (memory for now). Every repository method must return a Promise even in memory mode, because a MongoDB implementation with the same interface replaces it in a later step.

3. Mount all routes under /api/v1 from a single src/routes/index.js that app.js requires and mounts explicitly.

4. Cross-cutting middleware, in this order: request id, request logging, JSON body parser with a size limit, content negotiation, routes, 404 handler, central error handler.
   - Content negotiation: a request whose Accept header excludes application/json gets 406; a POST/PUT/PATCH whose Content-Type is not application/json gets 415; malformed JSON gets 400.
   - One error contract for the whole API: {"error": {"code": "<MACHINE_CODE>", "message": "<human text>", "details": [...]}}. Implement an AppError class with helper constructors (badRequest, unauthorized, forbidden, notFound, methodNotAllowed, notAcceptable, conflict, preconditionFailed, unsupportedMediaType). Unknown routes return 404 in this schema. A known path with an unsupported method returns 405 with an Allow header. Unexpected errors return 500 without leaking a stack trace.
   - Turn off Express's automatic ETag (app.set('etag', false)); we implement our own in the next step.

5. GET /api/v1/health returns 200 with status, version, data_source and the record count per collection.

6. Tests for health, 404, 405, 406, 415 and malformed JSON, all asserting the error schema.

Then do the step wrap-up as Step 3 - Express skeleton and error contract.
```

Summary of what was generated:

- Express 5 app (`src/app.js`, `src/server.js`) with config, routes, controllers, services, middleware and utils folders; `GET /api/v1/health` reports status, version, data source and record counts.
- Memory repositories that load `data/seed/` once, index by id and group readings by installation; all methods async, selected by `DATA_SOURCE`.
- Middleware for request id, logging, body limit, content negotiation (406/415/400), 404, 405 with Allow, and one error contract via `AppError`; 22 tests.

## Step 4 - Hierarchy read path and conditional GET

Date: 2026-10-06

Prompt:

```text
Step 4 - Read path for the hierarchy, with conditional GET. All endpoints are open for now; authentication comes in Step 6.

Implement these GET endpoints (routes -> controllers -> services -> repositories):
- /provinces and /provinces/{province_id}
- /provinces/{province_id}/districts (scoped collection) and /districts/{district_id}
- /districts/{district_id}/substations (scoped collection) and /substations/{substation_id}
- /substations/{substation_id}/installations (scoped collection), /installations (whole-estate collection with filters province_id, district_id, substation_id, status) and /installations/{installation_id}

Rules:
- Plural lowercase nouns, no verbs in URIs. A scoped collection returns 404 if the parent does not exist, and 200 with an empty array if the parent exists but has no children.
- Never return device_key_hash or any internal field. Use an explicit serializer per resource.
- Collections return {"data": [...], "pagination": {...}, "links": {...}} through one shared pagination helper: page (default 1) and page_size (default 50, max 200). pagination has total, page, page_size, total_pages. links has self, first, last, next, prev (null when absent) and must preserve the other query parameters. Also send a Link header with rel="next" and rel="prev". An invalid page or page_size returns 400 with details naming the parameter.
- Atomic resources return the bare JSON object.
- Conditional GET on every retrievable resource and collection: send a strong ETag (hash of the response body) and Last-Modified (the resource's updated_at, or the newest updated_at in the collection). Honour If-None-Match and If-Modified-Since and return 304 with an empty body when the client's copy is current. Implement this once as a reusable helper, not per route. Send Cache-Control: private, no-cache so clients always revalidate.
- Unknown query parameters and invalid filter values return 400.

Tests: each collection and atomic resource; parent not found; pagination links and totals matching the seed (9 provinces, 25 districts, 200 installations); and a 304 round trip using the ETag from a first response.

Then do the step wrap-up as Step 4 - Hierarchy read path and conditional GET.
```

Summary of what was generated:

- GET endpoints for provinces, districts, substations and installations (atomic, scoped and estate-wide with filters), each through routes, controllers, services and repositories, with explicit allow-list serializers.
- Shared helpers: query validation (unknown, repeated and invalid parameters give 400 naming each one), pagination envelope with links and a Link header, and conditional GET (SHA-256 ETag, Last-Modified, 304, `Cache-Control: private, no-cache`).
- 71 tests in total, covering every endpoint, missing parents, empty children, pagination totals and links, query validation and 304 round trips.

## Step 5 - Operational and analytical reads

Date: 2026-10-06

Prompt:

```text
Step 5 - Operational and analytical reads on generation data.

1. Composite: GET /installations/{installation_id}/overview returns the installation together with its substation, district and province (id and name each), its last-known reading, and the energy generated so far today in kWh (Sri Lanka local day). One response an operations screen could render without further calls.

2. Operational: GET /installations/{installation_id}/last-reading returns the single most recent reading for the installation as a derived resource, not as a query on the collection. Include age_seconds and a stale flag that is true when the reading is older than 30 minutes. Return 404 if the installation does not exist, and 404 with a distinct error code if it has no readings yet.

3. Analytical, scoped: GET /installations/{installation_id}/readings is the history sub-collection, and GET /installations/{installation_id}/readings/{reading_id} returns one reading.

4. Analytical, cross-estate: GET /readings with jurisdiction filters province_id, district_id, substation_id and installation_id. Resolve the jurisdiction to its installation ids first, then query readings.

5. Both reading collections support:
   - Time window: from and to (ISO 8601; from is inclusive, to is exclusive). Invalid dates, or from >= to, return 400.
   - Sorting: sort=timestamp (ascending) or sort=-timestamp (descending, the default). Any other sort field returns 400.
   - Pagination with the shared helper: total count, and next and prev links that preserve all current query parameters.
   - Conditional GET with ETag and Last-Modified (the timestamp of the newest reading in the result), returning 304 when unchanged.

6. Repository methods take filter, sort, skip and limit arguments and return {items, total}, so the same signature maps directly onto a MongoDB query later. Do not load everything and slice in the controller.

Tests: for an always-active installation, page 1 and page 2 of its history do not overlap and total is 672; ascending and descending order; a one-day window returns 96 readings; the district filter returns only readings from installations in that district; invalid from, sort and page_size each return 400; last-reading equals the first item of the descending history; overview contains all four hierarchy levels.

Then do the step wrap-up as Step 5 - Operational and analytical reads.
```

Summary of what was generated:

- Overview (installation, substation, district, province, last reading, energy today in Sri Lanka time) and last-reading (age_seconds, stale, 404 NO_READINGS, weak ETag) endpoints.
- Reading history, single reading and estate-wide `/readings` (jurisdiction resolved to installation ids), with from/to windows, sort, pagination and conditional GET.
- `readings.findMany(filter, { sort, skip, limit })` returning `{ items, total }` with binary-searched time windows, an injectable clock, and 107 tests in total.

## Step 6 - Authentication and jurisdiction scoping

Date: 2026-10-06

Prompt:

```text
Step 6 - Security: enforce the write-read split. Two kinds of client, two authentication schemes.

1. SLSEA users (read clients). POST /auth/tokens with {"username", "password"} verifies the bcrypt hash and returns 200 with {"access_token", "token_type": "Bearer", "expires_in"}. The JWT (jsonwebtoken, HS256, secret from JWT_SECRET, 1 hour expiry) carries sub, role, province_id and district_id, so scope checks need no database lookup per request. Wrong credentials return 401 with the same message for an unknown user and a wrong password.

2. authenticateUser middleware: a missing, malformed or expired token returns 401 with a WWW-Authenticate: Bearer header. Apply it to every GET endpoint except /health.

3. Jurisdiction-scoped authorization, implemented in one module and reused everywhere:
   - admin and national: all data.
   - provincial: only their province_id. district: only their district_id.
   - An atomic or scoped resource outside the caller's jurisdiction returns 403 (it exists but is not theirs). A resource that does not exist returns 404.
   - Collections (/provinces, /installations, /readings and so on) are narrowed to the caller's jurisdiction automatically. An explicit filter outside it returns 403.
   - A district user can read their own district and its parent province record, but not sibling districts or anything beneath them.

4. Metering devices (write clients). authenticateDevice middleware reads the X-Device-Key header, hashes it with SHA-256, and compares it in constant time (crypto.timingSafeEqual) with the device_key_hash of the installation named in the URL. It sets req.device = {installation_id}. A missing key returns 401. A valid key for a different installation returns 403. A device key must not work on any read endpoint, and a user JWT must not work on the device write path. Do not add the ingestion endpoint yet - only the middleware and its unit tests.

5. Add helmet and cors. Add JWT_SECRET and JWT_EXPIRES_IN to .env.example, and fail fast at startup if JWT_SECRET is missing outside the test environment.

6. Update existing tests to authenticate, and add: login success and failure; 401 without a token; a district user reading their own district (200) and another district (403); a provincial user's /installations list contains only their province; a national user sees all 200 installations; an expired token returns 401.

Then do the step wrap-up as Step 6 - Authentication and jurisdiction scoping.
```

Summary of what was generated:

- `POST /auth/tokens` (bcrypt check, HS256 JWT with role and jurisdiction) and `authenticateUser` on every GET except `/health`; `authenticateDevice` (SHA-256 + `timingSafeEqual`, 401/403) with unit tests; helmet, cors and a fail-fast `JWT_SECRET` check.
- One jurisdiction module used by every service: 403 outside the jurisdiction, 404 when missing, collections narrowed automatically, explicit filters outside it refused.
- Services now throw `AppError` for not-found and forbidden; existing tests authenticate, and new auth, jurisdiction and device tests bring the total to 141.

## Step 7 - Write path and CRUD semantics

Date: 2026-10-06

Prompt:

```text
Step 7 - Write path: device ingestion and CRUD semantics on installations.

1. Ingestion: POST /installations/{installation_id}/readings, authenticated with authenticateDevice only. Body: timestamp (ISO 8601 UTC), power_kw (>= 0), energy_kwh (>= 0), voltage_v (> 0). On success return 201 with the created reading as the body and a Location header pointing to /api/v1/installations/{installation_id}/readings/{reading_id}. The reading id is derived from the installation id and timestamp, so a device retrying the same reading gets 409 Conflict instead of creating a duplicate. Validation failures return 400 with one details entry per bad field. Reject a timestamp more than 5 minutes in the future (400), an energy_kwh lower than the installation's previous cumulative value (409), and a write to an installation whose status is not active (409).

2. Readings are append-only: PUT, PATCH and DELETE on /installations/{id}/readings and /installations/{id}/readings/{reading_id} return 405 with an Allow header. Explain the decision in a code comment.

3. Installation management, admin role only (other user roles get 403; a device key gets 401):
   - POST /substations/{substation_id}/installations creates an installation: 201, Location header, body is the new resource. The server generates the id and a device key, returns the plaintext device key once in this response, and stores only its hash. A duplicate meter_id or inverter_id returns 409.
   - PUT /installations/{installation_id} fully replaces the client-editable fields and is idempotent. Missing required fields return 400. Returns 200 with the updated resource.
   - PATCH /installations/{installation_id} is a partial update (for example status or capacity_kw). Unknown or read-only fields (id, substation_id, district_id, province_id, created_at) return 400.
   - DELETE /installations/{installation_id} returns 204, and repeating it returns 404. Refuse with 409 if the installation has readings, and tell the client to set status to inactive instead, so history is never destroyed.
   - Optimistic concurrency: PUT, PATCH and DELETE honour If-Match. If the supplied ETag does not match the current representation, return 412 Precondition Failed. Successful writes return the new ETag and Last-Modified.

4. Provinces, districts and substations stay read-only reference data: POST, PUT, PATCH and DELETE on them return 405 with an Allow header.

5. Writes go through the repository layer (create, update, remove, appendReading). In memory mode they change the in-memory store only and are lost on restart; that is expected until the MongoDB step.

6. Use one small shared validation helper for all request bodies; no ad-hoc checks inside controllers.

Tests: ingest success (201, Location resolves with GET, last-reading now returns it); duplicate (409); wrong device key (403); user JWT on ingest (401); bad body (400 with details); 405 on PUT and DELETE of a reading; installation create, replace, patch and delete as admin; 403 as a district user; stale If-Match (412); PUT twice gives the same result.

Then do the step wrap-up as Step 7 - Write path and CRUD semantics.
```

Summary of what was generated:

- Device ingestion (`POST /installations/{id}/readings`): 201 with Location, id from installation and timestamp so retries get 409, plus future-timestamp, decreasing-energy and not-active checks; readings append-only (405 on PUT/PATCH/DELETE).
- Admin installation management: create on a substation (server-generated id and one-time device key), PUT, PATCH and DELETE, with If-Match giving 412 on stale ETags and 409 for duplicates or for deleting an installation with readings; reference data stays 405.
- One shared `validateBody` helper with per-field details, repository write methods (create, update, remove, appendReading), and 168 tests in total.

## Step 8 - District generation summary

Date: 2026-10-07

Prompt:

```text
Step 8 - District generation summary (processing resource).

Add GET /districts/{district_id}/generation-summary, jurisdiction-scoped like every other district resource. It is computed on request across all installations in the district; nothing is stored. Response:
- district (id, name, province_id), generated_at, and date: the Sri Lanka local day being summarised (optional query parameter date=YYYY-MM-DD, default today)
- installation_count, reporting_count (installations whose last reading is under 30 minutes old) and offline_count
- current_power_kw: the sum of the last-known power of reporting installations
- energy_today_kwh: for each installation, its last cumulative energy_kwh of the day minus its last value before the day started, summed
- installed_capacity_kw and utilisation_pct (current power / installed capacity)
- peak_power_kw and peak_at for the day
- by_substation: current_power_kw and energy_today_kwh per substation

Put the calculation in a service. The repository does the data access through one aggregate-style method (for example readings.summariseByInstallations(installation_ids, day_start, day_end)), so it can become a single MongoDB aggregation pipeline later. Support conditional GET. An invalid date returns 400; a district outside the caller's scope returns 403.

Tests: the totals equal a brute-force calculation over the seed for one district and day; energy_today_kwh is never negative; a district user gets 403 for another district.

Then do the step wrap-up as Step 8 - District generation summary.
```

Summary of what was generated:

- `GET /districts/{district_id}/generation-summary`: counts, current power, energy for the day, capacity, utilisation, peak and per-substation figures, computed on request, jurisdiction-scoped, with an optional `date` and a weak ETag for conditional GET.
- One aggregate repository method, `readings.summariseByInstallations`, shaped like a MongoDB pipeline; the day-energy formula and staleness rule are now shared with the overview and last-reading.
- 178 tests in total, including a brute-force check against the seed files, non-negative energy for every district and day, and 403 outside scope.

## Step 9 - MongoDB persistence

Date: 2026-10-08

Prompt:

```text
Step 9 - Move the data from seed JSON into MongoDB Atlas and connect the API to it. My .env already contains MONGODB_URI and MONGODB_DB. Never print or commit the URI.

1. Install mongoose. Add src/config/db.js with a connect function that caches the connection promise in module scope (it will be reused across AWS Lambda invocations later) and sets sensible timeouts.

2. Mongoose models in src/models/ for Province, District, Substation, Installation, Reading and User. Keep the same snake_case field names as the seed, and keep our string id as a unique indexed field. Never expose _id or __v; strip them in the serializers. Indexes:
   - readings: unique compound {installation_id: 1, timestamp: -1}, plus {timestamp: -1}
   - installations: unique meter_id, unique inverter_id, and indexes on substation_id, district_id and province_id
   - districts.province_id, substations.district_id, users.username (unique)
   Add a comment on each index saying which endpoint it serves.

3. scripts/seed-mongo.js (npm run seed:mongo): connect, then for each collection delete the existing documents, read the matching file in data/seed/ and insert it with insertMany in batches of 5,000 (ordered: false), converting timestamp strings to Date. Then sync indexes and print the document count per collection. It must be safe to re-run, and must refuse to run when NODE_ENV=production unless --force is passed.

4. src/repositories/mongo/: implement exactly the same repository interface as the memory versions. Use real database queries: find with filter, sort, skip and limit plus countDocuments for pagination; findOne sorted by timestamp descending for last-reading; an aggregation pipeline for the district summary. Use lean() for reads. Map a duplicate-key error (code 11000) to our 409 conflict error.

5. Switch src/repositories/index.js on DATA_SOURCE (memory | mongo), defaulting to mongo when MONGODB_URI is set. server.js connects before listening. /health reports data_source and live document counts. The layers above the repositories must not change. If you find you need to change a controller or service, stop and explain why first.

6. Tests keep running against the memory source (fast, no network). Add scripts/smoke.js (npm run smoke -- <base_url>) that runs a short end-to-end pass against a running server and prints pass or fail per check: health; login as a district user; list installations; readings page 1; a 304 using the returned ETag; 403 on another district; device ingest of one reading (201 with Location); the district summary.

7. Run npm run seed:mongo, start the server with DATA_SOURCE=mongo, run the smoke script against localhost, and show me the results.

Then do the step wrap-up as Step 9 - MongoDB persistence.
```

Summary of what was generated:

- Mongoose connection (cached promise, timeouts), six models plus a counters collection with commented indexes, and MongoDB repositories with the same interface as memory (find/sort/skip/limit with countDocuments, a $facet aggregation for the summary, 11000 mapped to 409).
- `seed:mongo` (delete, batched insertMany, syncIndexes, counts, production guard) and `smoke` scripts; `DATA_SOURCE` switch with mongo as default when a URI is set; tests stay on memory.
- Seeded Atlas (131,027 readings), matched 16/16 endpoints between memory and MongoDB, passed all 8 smoke checks, and fixed 304 for fetch() clients that send Cache-Control: no-cache.
