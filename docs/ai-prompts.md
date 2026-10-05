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
