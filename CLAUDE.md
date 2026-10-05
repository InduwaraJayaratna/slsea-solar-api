# CLAUDE.md - standing rules for slsea-solar-api

NB6007CEM Web API Development coursework: a REST API for the Sri Lanka Sustainable
Energy Authority (SLSEA) serving real-time and historical solar generation data from
rooftop installations.

## Design authority

- The coursework brief and the REST API Design Guidelines white paper live in
  `docs/reference/` (git-ignored, local only). Read them before designing anything.
- The white paper is the design authority. If a request conflicts with it, say so
  and follow the white paper.

## Stack and conventions

- Node 22, Express 5, CommonJS (`require`), JSON only.
- Field names and query parameters are `snake_case`.
- Timestamps are ISO 8601 in UTC (e.g. `2026-10-06T08:30:00Z`).
- Target Richardson Maturity Level 2: resources, HTTP verbs and status codes.
  No hypermedia controls beyond pagination links.

## Layering

`routes -> controllers -> services -> repositories`

- Routes map URLs and verbs to controllers.
- Controllers handle HTTP: read the request, call a service, shape the response.
- Services hold business rules and know nothing about HTTP.
- Only repositories touch the data source, so the data source can be swapped later
  without changing the layers above.

## Code style

- Keep code simple. Where the reasoning is not obvious, explain it in a comment.
  The author must be able to explain every file at a viva.
- Prefer few dependencies. No dead code.

## Tests

- `node:test` + `supertest`, in `tests/`.
- Every new endpoint gets at least one success test and one failure test.

## Secrets

- Never commit secrets. Never print secret values.
- Add every new config key to `.env.example`, with no value.

## Branching

- All development happens on `development`. Never commit directly to `main`.
- `main` changes only when `development` is merged into it at the end of a step,
  so `main` always holds the last completed, tested step.
- Before starting any step, check that the current branch is `development` and that
  it is up to date with `origin`.

## Step wrap-up (end of every step)

1. Run `npm run lint` and `npm test` and fix any failures.
2. Append the user's prompt, verbatim, to `docs/ai-prompts.md` under a heading
   "Step N - <title>", with today's date and a 3-line summary of what was generated.
3. Update `README.md`.
4. Make small logical commits on `development` using Conventional Commits
   (`feat:`, `fix:`, `docs:`, `chore:`, `test:`). Several per step, not one.
5. Push `development` to `origin`.
6. Merge into `main` with a merge commit:
   ```
   git checkout main
   git pull
   git merge --no-ff development -m "merge: step N - <title>"
   git push origin main
   git checkout development
   ```
   Never squash, rebase or force push. The individual commits must stay visible in
   main's history.
7. Give the user a short plain-English explanation of what was built, the design
   decisions and which guideline each one follows, and 3 viva questions they
   should be able to answer about it.
