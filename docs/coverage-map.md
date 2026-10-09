# Design-spine coverage map

One row per capability in Appendix A of the coursework brief. For each one: the
endpoint that demonstrates it, the code that implements it, and a curl command
against the **live** deployment that proves it, with the status it actually
returned.

The guideline sections are the ones Appendix A gives for the REST API Design
Guidelines white paper.

All results were recorded against the live API on **2026-10-09 at about 03:16 UTC**,
right after the seed was refreshed. The seed's week of readings then ended at
`2026-10-09T03:00:00Z`.

## Summary

| #   | Capability (guideline)                                               | Demonstrated by                                                                                                                                          | Implemented in                                                                                                                                                                                                                                                           | Recorded                                      |
| --- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| 1   | Data model precedes design (s3)                                      | `GET /installations/INST-0001`, `GET /installations/INST-0001/readings`                                                                                  | [docs/data-model.md](data-model.md), [src/models/](../src/models/)                                                                                                                                                                                                       | 200, 200                                      |
| 2   | Resource taxonomy: atomic / collection / composite / processing (s4) | `/installations/INST-0001`, `/installations`, `/installations/INST-0001/overview`, `/districts/COL/generation-summary`, plus the derived `/last-reading` | [src/services/overview.service.js](../src/services/overview.service.js), [generation-summary.service.js](../src/services/generation-summary.service.js), [reading.service.js](../src/services/reading.service.js)                                                        | 200, 200, 200, 200, 200                       |
| 3   | URI naming and scoped collections (s5.1, s5.6)                       | `/provinces/WP/districts`, `/districts/COL/substations`, `/installations/INST-0001/readings`                                                             | [src/routes/](../src/routes/)                                                                                                                                                                                                                                            | 200, 200; singular `/province/WP` 404         |
| 4   | JSON representation (s6)                                             | `GET /installations/INST-0001/last-reading`                                                                                                              | [src/serializers/index.js](../src/serializers/index.js), [src/utils/respond.js](../src/utils/respond.js)                                                                                                                                                                 | 200, `application/json`                       |
| 5   | HTTP methods and idempotency (s7)                                    | POST / PUT / PATCH / DELETE on installations; POST readings                                                                                              | [src/routes/installations.routes.js](../src/routes/installations.routes.js), [installation.service.js](../src/services/installation.service.js)                                                                                                                          | 201; 200 + 200 (same ETag); 204 then 404; 405 |
| 6   | Headers: Location, ETag, Last-Modified, Content-Type (s8)            | `POST .../readings`, `GET /installations/INST-0001`                                                                                                      | [src/controllers/readings.controller.js](../src/controllers/readings.controller.js), [src/utils/conditional-get.js](../src/utils/conditional-get.js)                                                                                                                     | 201 with Location; 200 with the other three   |
| 7   | Status codes 201, 200, 404, 400, 406, 412 (s9)                       | see below                                                                                                                                                | [src/utils/app-error.js](../src/utils/app-error.js), [src/middleware/](../src/middleware/)                                                                                                                                                                               | 201, 200, 404, 400, 406, 412                  |
| 8   | Pagination, filtering, sorting (s10.2, s10.3)                        | `GET /readings?district_id=COL&from=...&to=...&sort=-timestamp&page=2&page_size=20`                                                                      | [src/utils/pagination.js](../src/utils/pagination.js), [src/utils/query.js](../src/utils/query.js), [src/controllers/query-params.js](../src/controllers/query-params.js)                                                                                                | 200 with `Link`; 400 over the cap             |
| 9   | Conditional GET / not-modified (s10.4)                               | `GET /installations/INST-0001/readings` with `If-None-Match` / `If-Modified-Since`                                                                       | [src/utils/conditional-get.js](../src/utils/conditional-get.js)                                                                                                                                                                                                          | 304 (0 bytes), 304 (0 bytes); 200 if stale    |
| 10  | Consistent error contract (s11)                                      | any error, e.g. `/installations/INST-9999`, `/readings?sort=power&colour=red`                                                                            | [src/utils/app-error.js](../src/utils/app-error.js), [src/middleware/error-handler.js](../src/middleware/error-handler.js)                                                                                                                                               | 404, 400 with the same body shape             |
| 11  | Authentication and scopes (s12)                                      | no token, a district user out of scope, a device key on the wrong installation                                                                           | [src/middleware/authenticate-user.js](../src/middleware/authenticate-user.js), [authenticate-device.js](../src/middleware/authenticate-device.js), [require-role.js](../src/middleware/require-role.js), [src/services/jurisdiction.js](../src/services/jurisdiction.js) | 401, 403, 403, 403, 401, 403                  |
| 12  | Richardson maturity placement (s1)                                   | resources + verbs + status codes; 405 with `Allow`; links only for pagination                                                                            | the whole API; [src/middleware/method-not-allowed.js](../src/middleware/method-not-allowed.js)                                                                                                                                                                           | Level 2                                       |

## Setup

Every command below runs as written after this setup. It needs `curl` and `jq`.

```sh
BASE=https://m9ax7pv54m.execute-api.ap-south-1.amazonaws.com/api/v1
login() { curl -s -X POST "$BASE/auth/tokens" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$1\",\"password\":\"SolarDemo#2026\"}" | jq -r .access_token; }
TOKEN=$(login dist.col)   # district user, Colombo (COL) only
ADMIN=$(login admin)      # sees everything, may write installations
DEVICE_KEY=dk_2a936d2d95058ebc31c73b600ae88185b1d447bebc643b8b74d148ab793c63df   # INST-0001's demo key
```

The logins and the key are the published demo credentials in
[demo-credentials.md](demo-credentials.md).

## 1. Data model precedes design

The entity model in [data-model.md](data-model.md) came first: Province, District,
Substation, Installation, Reading and User. The resources were derived from it.
Two decisions from the brief are visible in the API:

- The meter and inverter are **attributes** of an installation (`meter_id`,
  `inverter_id`), not a separate Device resource.
- Readings are a **separate append-only time series**, not last-value fields on
  the installation. One installation has 672 readings, one per 15 minutes for a week.

```sh
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $ADMIN" $BASE/installations/INST-0001
# 200

curl -s -H "Authorization: Bearer $ADMIN" $BASE/installations/INST-0001/readings | jq .pagination.total
# 673   (672 seeded, plus the reading the smoke test sent)
```

## 2. Resource taxonomy

| Kind       | Endpoint                                    | Why it is that kind                                                                     |
| ---------- | ------------------------------------------- | --------------------------------------------------------------------------------------- |
| Atomic     | `GET /installations/INST-0001`              | one entity                                                                              |
| Collection | `GET /installations?district_id=COL`        | many entities, paginated and filterable                                                 |
| Composite  | `GET /installations/INST-0001/overview`     | the installation with its substation, district, province, last reading and energy today |
| Derived    | `GET /installations/INST-0001/last-reading` | the newest reading, plus `age_seconds` and `stale`, which are computed, not stored      |
| Processing | `GET /districts/COL/generation-summary`     | aggregates computed on request across every installation in the district                |

```sh
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $ADMIN" $BASE/installations/INST-0001             # 200
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $ADMIN" "$BASE/installations?district_id=COL"      # 200
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $ADMIN" $BASE/installations/INST-0001/overview     # 200
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $ADMIN" $BASE/installations/INST-0001/last-reading # 200
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $ADMIN" $BASE/districts/COL/generation-summary     # 200
```

## 3. URI naming and scoped collections

URIs use plural nouns and lower-case words joined with hyphens, with no verbs.
A collection that only makes sense under a parent is nested under it: districts
of a province, substations of a district, readings of an installation. Nesting
goes one parent deep: once fetched, a district is addressed as `/districts/COL`,
never `/provinces/WP/districts/COL`. That keeps URIs short and gives each
resource one canonical address.

```sh
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $ADMIN" $BASE/provinces/WP/districts     # 200
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $ADMIN" $BASE/districts/COL/substations  # 200
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $ADMIN" $BASE/province/WP                # 404 (singular is not a resource)
```

## 4. JSON representation

Every response is JSON, with `snake_case` fields and ISO 8601 UTC timestamps.
Each resource is built by an allow-list serializer, so internal fields such as
`device_key_hash` never leak.

```sh
curl -s -D - -o /dev/null -H "Authorization: Bearer $ADMIN" -H 'Accept: application/json' $BASE/installations/INST-0001
# HTTP/2 200
# content-type: application/json; charset=utf-8

curl -s -H "Authorization: Bearer $ADMIN" $BASE/installations/INST-0001/last-reading
# {"id":"INST-0001-20261009T0315Z","installation_id":"INST-0001","timestamp":"2026-10-09T03:15:00Z",
#  "power_kw":1.5,"energy_kwh":15339.545,"voltage_v":230.5,"age_seconds":78,"stale":false}
```

## 5. HTTP methods and idempotency

| Method | Used for                                 | Safe | Idempotent | Proof                                                      |
| ------ | ---------------------------------------- | ---- | ---------- | ---------------------------------------------------------- |
| GET    | every read                               | yes  | yes        | everything above                                           |
| POST   | create an installation; ingest a reading | no   | no         | 201 + Location; sending the same reading again is 409      |
| PUT    | replace an installation's fields         | no   | yes        | two identical PUTs: 200 and 200, identical ETag            |
| PATCH  | change some fields                       | no   | no*        | 200 (412 with a stale `If-Match`)                          |
| DELETE | delete an installation                   | no   | yes        | 204, then 404: the state is the same after the second call |

\* PATCH is not idempotent in general. With `If-Match` it becomes safe to retry,
because a retry with the old ETag gets 412 instead of applying twice.

Readings are append-only, and provinces, districts and substations are read-only
reference data. Methods they don't support give 405 with an `Allow` header.

These commands create a throwaway installation (it became `INST-0201`) and then
delete it:

```sh
BODY='{"meter_id":"MTR-COVERAGE-1","inverter_id":"INV-COVERAGE-1","site_name":"Coverage check","address":"1 Test Lane, Colombo","capacity_kw":5,"panel_count":12,"status":"active","commissioned_at":"2026-10-01T00:00:00Z","latitude":6.9,"longitude":79.86}'
curl -s -D - -o /dev/null -X POST $BASE/substations/SUB-001/installations \
  -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d "$BODY"
# HTTP/2 201
# location: /api/v1/installations/INST-0201
NEW=INST-0201   # the id from Location

PUT_BODY=$(echo "$BODY" | jq -c '.site_name = "Coverage check (renamed)"')
for i in 1 2; do curl -s -D - -o /dev/null -X PUT $BASE/installations/$NEW \
  -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d "$PUT_BODY" | grep -i -E '^HTTP|^etag'; done
# HTTP/2 200   etag: "z8GVaIIJp7LXwUQ4_Lqfme_RfaZHfUPE5Q0RtnnjFJ0"
# HTTP/2 200   etag: "z8GVaIIJp7LXwUQ4_Lqfme_RfaZHfUPE5Q0RtnnjFJ0"   (same result: idempotent)

curl -s -o /dev/null -w '%{http_code}\n' -X DELETE -H "Authorization: Bearer $ADMIN" $BASE/installations/$NEW   # 204
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE -H "Authorization: Bearer $ADMIN" $BASE/installations/$NEW   # 404

curl -s -D - -o /dev/null -X DELETE -H "Authorization: Bearer $ADMIN" $BASE/installations/INST-0001/readings
# HTTP/2 405
# allow: GET, HEAD, POST   (readings are append-only)
```

Ingestion (POST) is not idempotent. Each reading has its own URI, built from the
installation and the minute of its timestamp. So sending the same reading again
is refused with 409 instead of creating a duplicate:

```sh
LAST=$(curl -s -H "Authorization: Bearer $TOKEN" $BASE/installations/INST-0001/last-reading | jq .energy_kwh)
READING="{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:00Z)\",\"power_kw\":1.8,\"energy_kwh\":$(jq -n "$LAST + 0.5"),\"voltage_v\":231.2}"

curl -s -D - -o /dev/null -X POST $BASE/installations/INST-0001/readings \
  -H "X-Device-Key: $DEVICE_KEY" -H 'Content-Type: application/json' -d "$READING"
# HTTP/2 201
# location: /api/v1/installations/INST-0001/readings/INST-0001-20261009T0316Z

curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/installations/INST-0001/readings \
  -H "X-Device-Key: $DEVICE_KEY" -H 'Content-Type: application/json' -d "$READING"
# 409 (DUPLICATE_READING)
```

## 6. Headers

| Header          | Where                                                              | Recorded                                                            |
| --------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `Location`      | every 201: the new reading or installation                         | `/api/v1/installations/INST-0001/readings/INST-0001-20261009T0316Z` |
| `ETag`          | every GET: SHA-256 of the body (weak for clock-dependent bodies)   | `"8lRR1x3x…"`                                                       |
| `Last-Modified` | GETs of data that has a time (`updated_at`, a reading's timestamp) | `Wed, 10 Dec 2025 13:02:00 GMT`                                     |
| `Content-Type`  | every response with a body                                         | `application/json; charset=utf-8`                                   |

Also sent: `Cache-Control: private, no-cache`, `Link` (pagination), `Allow` (405),
`WWW-Authenticate` (401) and `X-Request-Id`.

```sh
curl -s -D - -o /dev/null -H "Authorization: Bearer $ADMIN" $BASE/installations/INST-0001
# HTTP/2 200
# content-type: application/json; charset=utf-8
# etag: "8lRR1x3xD5i5jDjvyA5Gj3z8Z1qEzIKxY2VwQE40HTs"
# last-modified: Wed, 10 Dec 2025 13:02:00 GMT
# cache-control: private, no-cache
```

`Location` is shown under section 5.

## 7. Status codes

| Code | When                                     | Command                                                                                                                                                                                                                                           | Recorded |
| ---- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 201  | a reading or installation was created    | the POSTs in section 5                                                                                                                                                                                                                            | 201      |
| 200  | a successful read or update              | `curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $ADMIN" $BASE/installations/INST-0001`                                                                                                                                        | 200      |
| 404  | the resource does not exist              | `curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $ADMIN" $BASE/installations/INST-9999`                                                                                                                                        | 404      |
| 400  | invalid input (here: page_size over 200) | `curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $ADMIN" "$BASE/readings?page_size=500"`                                                                                                                                       | 400      |
| 406  | the client will not accept JSON          | `curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $ADMIN" -H 'Accept: text/html' $BASE/installations/INST-0001`                                                                                                                 | 406      |
| 412  | `If-Match` holds a stale ETag            | `curl -s -o /dev/null -w '%{http_code}\n' -X PATCH $BASE/installations/$NEW -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -H 'If-Match: "stale-etag"' -d '{"status":"maintenance"}'` (run before the DELETE in section 5) | 412      |

The same PATCH with the current ETag in `If-Match` returned 200. The API also uses
204, 304, 401, 403, 405, 409, 413, 415 (a POST with `Content-Type: text/plain`
returned 415) and 503. They are described in the OpenAPI spec.

## 8. Pagination, filtering and sorting

Readings for the Colombo district on 8 October, newest first, page 2 of 20:

```sh
curl -s -D - -o /dev/null -H "Authorization: Bearer $ADMIN" \
  "$BASE/readings?district_id=COL&from=2026-10-08T00:00:00Z&to=2026-10-09T00:00:00Z&sort=-timestamp&page=2&page_size=20"
# HTTP/2 200
# link: </api/v1/readings?district_id=COL&from=...&sort=-timestamp&page=3&page_size=20>; rel="next",
#       </api/v1/readings?district_id=COL&from=...&sort=-timestamp&page=1&page_size=20>; rel="prev"

curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/readings?district_id=COL&from=2026-10-08T00:00:00Z&to=2026-10-09T00:00:00Z&sort=-timestamp&page=2&page_size=20" \
  | jq -c '{pagination, first: .data[0].timestamp, last: .data[-1].timestamp}'
# {"pagination":{"total":1824,"page":2,"page_size":20,"total_pages":92},
#  "first":"2026-10-08T23:30:00Z","last":"2026-10-08T23:15:00Z"}

curl -s -H "Authorization: Bearer $ADMIN" "$BASE/installations/INST-0001/readings?sort=timestamp&page_size=2" | jq -c '[.data[].timestamp]'
# ["2026-10-02T03:15:00Z","2026-10-02T03:30:00Z"]   (oldest first)
```

- **Filters:** `province_id`, `district_id`, `substation_id` and `installation_id`
  narrow by jurisdiction. `from` (inclusive) and `to` (exclusive) set a time window.
- **Sort:** `timestamp` or `-timestamp`.
- **Pagination:** `page` and `page_size`, at most 200 (above that the request gives
  400). The response carries `total`, `total_pages`, `links.next` and `links.prev`,
  plus the same links in the `Link` header.
- **Unknown parameters:** 400, so a mistyped filter never silently returns
  everything.

## 9. Conditional GET

```sh
URL="$BASE/installations/INST-0001/readings?page_size=20"
ETAG=$(curl -s -D - -o /dev/null -H "Authorization: Bearer $ADMIN" "$URL" | tr -d '\r' | grep -i '^etag' | cut -d' ' -f2)
LM=$(curl -s -D - -o /dev/null -H "Authorization: Bearer $ADMIN" "$URL" | tr -d '\r' | grep -i '^last-modified' | cut -d' ' -f2-)

curl -s -o /dev/null -w '%{http_code} bytes=%{size_download}\n' -H "Authorization: Bearer $ADMIN" -H "If-None-Match: $ETAG" "$URL"
# 304 bytes=0
curl -s -o /dev/null -w '%{http_code} bytes=%{size_download}\n' -H "Authorization: Bearer $ADMIN" -H "If-Modified-Since: $LM" "$URL"
# 304 bytes=0
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $ADMIN" -H 'If-None-Match: "old"' "$URL"
# 200 (the client's copy is out of date, so the full body is sent)
```

## 10. Consistent error contract

Every error, from any layer, has the same body: `{"error": {code, message, details[]}}`.

```sh
curl -s -H "Authorization: Bearer $ADMIN" $BASE/installations/INST-9999
# {"error":{"code":"NOT_FOUND","message":"Installation \"INST-9999\" not found","details":[]}}

curl -s -H "Authorization: Bearer $ADMIN" "$BASE/readings?sort=power&colour=red"
# {"error":{"code":"BAD_REQUEST","message":"Invalid query parameters","details":[
#   {"parameter":"colour","message":"is not a supported query parameter"},
#   {"parameter":"sort","message":"must be one of timestamp, -timestamp"}]}}
```

`details` lists every problem at once, so a client can fix them all in one go.

## 11. Authentication and scopes

The write path and the read path use different credentials:

- **Devices:** `X-Device-Key`, which works only on their own installation's
  `POST .../readings`.
- **SLSEA users:** a JWT bearer token, scoped by role and jurisdiction.

| Check                                       | Command                                                                                                                                                                       | Recorded                                                     |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| no token                                    | `curl -s -o /dev/null -w '%{http_code}\n' $BASE/installations`                                                                                                                | 401, with `www-authenticate: Bearer realm="slsea-solar-api"` |
| collections narrowed to the user's district | `curl -s -H "Authorization: Bearer $TOKEN" "$BASE/installations?page_size=200" \| jq -c '{total: .pagination.total, districts: ([.data[].district_id] \| unique)}'`           | 200, `{"total":21,"districts":["COL"]}`                      |
| another district                            | `curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" $BASE/districts/GAM`                                                                              | 403                                                          |
| a filter outside the jurisdiction           | `curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" "$BASE/readings?district_id=GAM"`                                                                 | 403                                                          |
| a write that needs the admin role           | `curl -s -o /dev/null -w '%{http_code}\n' -X DELETE -H "Authorization: Bearer $TOKEN" $BASE/installations/INST-0001`                                                          | 403                                                          |
| a user token on the device endpoint         | `curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/installations/INST-0001/readings -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$READING"` | 401                                                          |
| a device key on another installation        | `curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/installations/INST-0002/readings -H "X-Device-Key: $DEVICE_KEY" -H 'Content-Type: application/json' -d "$READING"`    | 403                                                          |

A resource that does not exist is 404 before the scope is checked. A district
user asking for `/districts/XYZ` learns it does not exist, and `/districts/GAM`
gives 403.

## 12. Richardson maturity placement: Level 2

| Level | Requirement                                 | Evidence                                                                                                                                                    |
| ----- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | individual resources with their own URIs    | every entity has one: `/installations/INST-0001`, `/installations/INST-0001/readings/INST-0001-20261009T0316Z`                                              |
| 2     | HTTP verbs and status codes used as defined | sections 5 and 7: GET, POST, PUT, PATCH and DELETE with their proper meaning, and 201/204/304/404/405/409/412 used precisely                                |
| 3     | hypermedia (HATEOAS)                        | **not met, on purpose.** The only links are pagination links (`links` and `Link`). Responses carry ids, not links to related resources or available actions |

```sh
curl -s -D - -o /dev/null -X DELETE -H "Authorization: Bearer $ADMIN" $BASE/provinces/WP
# HTTP/2 405
# allow: GET, HEAD   (the verb is understood but not allowed on read-only reference data)
```

The brief sets Level 2 as the target and puts Level 3 out of scope. Clients rely
on the documented URI structure (the OpenAPI spec), not on links discovered at
run time.
