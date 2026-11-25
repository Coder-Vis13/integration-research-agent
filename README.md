# Composio 100-app research agent

TypeScript pipeline that researches **100 SaaS apps** for Composio-style toolkit buildability: auth, self-serve vs gated access, API surface, MCP, blockers, and quote-backed evidence. Outputs frozen JSON runs, scores **agreement with a fixed Clay sample (28 apps)**, and a static case study.

**Case study (live):** [https://coder-vis13.github.io/integration-research-agent/](https://coder-vis13.github.io/integration-research-agent/)  
**Source repo:** [https://github.com/coder-vis13/integration-research-agent](https://github.com/coder-vis13/integration-research-agent)  
Regenerate locally: `npm run report` → `site/` (copy to `docs/` for GitHub Pages).

Public project notes live in [`NOTES.md`](NOTES.md).

---

## What this does

For each app in [`data/apps.json`](data/apps.json), the agent:

1. Fetches the hint URL and same-site developer docs (HTTP cache under `data/cache/fetch/`).
2. Optionally calls **Composio Exa Instant** (`EXA_SEARCH`, `EXA_GET_CONTENTS_ACTION`) when pages lack login/auth wording.
3. Extracts a structured record with **google/gemini-2.5-flash-lite** via OpenRouter (`LLM_PROVIDER=openai-compatible`).
4. Verifies claims with a **quote-on-page** checker and merges a **Composio catalog** match (when configured).

Human steps: fixed 28-app evaluation sample, Clay-derived reference labels, approval of paid runs (`COST_OK=yes`), and a quick human check on the Clay sample before scoring. See the case study **Human** section for detail.

---

## Architecture (high level)

```
data/apps.json
  → gatherPages (HTTP doc finder)
  → optional Exa backup (pass2 / probe)
  → LLM extract (smoke-v4 prompt)
  → verifyRecord (quotes + derived buildability)
  → data/runs/pass2/records.json
```

- **Pass 1** (`data/runs/pass1/`) — frozen baseline (`smoke-v3`, HTTP-only era).
- **Pass 2** (`data/runs/pass2/`) — current pipeline (`smoke-v4`, Exa fallback, stricter verifier).
- **Evaluation** — `npm run score` compares Pass 1 / Pass 2 to `data/ground-truth/labels.json` (exported from `data/clay_sample.csv`). Metrics are **agreement with Clay**, not independently proven factual accuracy.
- **Report** — `npm run report` → `site/index.html`, `site/data.json`, `site/data.csv`.

---

## Prerequisites

- **Node.js** 20+ (project tested with Node 26).
- **npm** install at repo root.
- API keys in `.env` (copy from [`.env.example`](.env.example); never commit `.env`).

---

## Setup

```bash
cd composio-app-research
npm install
cp .env.example .env
# Edit .env: set keys below. Shell exports override .env values.
```

### Environment variables (names only)

| Variable | Purpose |
|----------|---------|
| `LLM_PROVIDER` | `stub` (no network) or `openai-compatible` (real extraction). |
| `LLM_MODEL` | Model slug on OpenRouter, e.g. `google/gemini-2.5-flash-lite` (used in Pass 2). |
| `LLM_API_KEY` | OpenRouter (or compatible) API key. |
| `LLM_BASE_URL` | e.g. `https://openrouter.ai/api/v1`. |
| `COMPOSIO_API_KEY` | Composio SDK: live catalog + Exa Instant on Pass 2. |
| `COMPOSIO_SEARCH_TOOL_SLUG` | Set to `EXA_SEARCH` for `npm run probe` (preflight with Exa). |
| `COMPOSIO_SCRAPE_TOOL_SLUG` | Optional; unused by default full run. |
| `COST_OK` | Must be `yes` to run a full paid 100-app pass after the printed estimate. |
| `EXA_MAX_APPS` | Cap on thin apps that may call Exa (default `20` on Pass 2). |
| `SCORE_ALLOW_UNCOMMITTED` | Set to `yes` to score when `labels.json` is not git-committed. |

---

## Commands

| Command | What it does |
|---------|----------------|
| `npm run check` | Typecheck, ESLint, tests (includes report reconciliation test). |
| `npm run smoke` | Five non-sample apps → `data/smoke/` (development sanity check). |
| `npm run probe -- --app <Name> [--out path]` | Real pipeline slice + optional Exa; does not write under `data/runs/`. |
| `npm run pass2` | **Full 100-app current pipeline** → `data/runs/pass2/records.json`. Pass 1 is frozen; will not overwrite. |
| `npm run pass1` | Blocked if Pass 1 records already exist. |
| `npm run research -- --app <Name>` | **Stub only** — no page fetch, `phase1-stub-v1` prompt. Not for production research. |
| `npm run clay-labels` | Export `data/ground-truth/labels.json` from Clay CSV only if labels file is absent. |
| `npm run score -- --pass pass1\|pass2` | Write `data/runs/<pass>/metrics.json` and `errors.json`. |
| `npm run report` | Regenerate `site/` from Pass 2 + metrics. |

### Run the research agent (100 apps)

```bash
COST_OK=yes EXA_MAX_APPS=20 npm run pass2
```

Requires `.env` with `LLM_PROVIDER=openai-compatible`, model/base URL/key, and `COMPOSIO_API_KEY`. Reuses disk caches unless evidence or `passId` changes.

### Score against Clay (28-app sample)

```bash
SCORE_ALLOW_UNCOMMITTED=yes npm run score -- --pass pass1
SCORE_ALLOW_UNCOMMITTED=yes npm run score -- --pass pass2
```

Omit `SCORE_ALLOW_UNCOMMITTED` only after `data/ground-truth/labels.json` is committed (scorer gate).

### View the case study locally

```bash
npm run report
open site/index.html
# optional static server:
npx --yes serve site
```

Machine-readable bundle: `site/data.json` (also embedded in the HTML as `#research-data`).

---

## Outputs

| Path | Contents |
|------|----------|
| `data/runs/pass1/records.json` | Frozen first full run (100 apps). |
| `data/runs/pass2/records.json` | Current pipeline run (100 apps). |
| `data/runs/pass2/log.txt` | Per-app log line summary. |
| `data/runs/pass2/run-meta.json` | Run command, model id, cache policy, failures (no secrets). |
| `data/runs/*/metrics.json` | Clay agreement, coverage, abstentions, mismatches (with denominators). |
| `data/runs/*/errors.json` | Sample mismatches only. |
| `data/ground-truth/labels.json` | Clay export for scoring (do not edit for tuning). |
| `data/cache/` | Fetch, LLM, catalog, Exa caches (gitignored). |
| `site/` | Generated case study (safe to publish; no `.env` or `private/`). |

### How to read evaluation

On the **28-app fixed sample**, the scorer reports per field:

- **Agreement among answered** — exact match to Clay when the agent answered and Clay was evaluable (`unknown` agent answers are abstentions, not matches).
- **Coverage** — how often the agent answered vs evaluable Clay cells.
- **Mismatches** — disagree with Clay; **not** automatically factual errors.
- **Unscorable Clay** — blank/unknown/unparseable Clay cells.

Pass 2 five-field answered agreement in the shipped metrics: **38/49** vs Pass 1 **34/48**. Full details are on the case study and in `metrics.json`.

---

## Known limitations

- **Coverage:** Pass 2 still has high `unknown` rates on access and buildability across 100 apps; many rows are thin-docs or marketing pages.
- **Operational:** DealCloud hit an LLM HTTP 503; six apps had no usable page; Paygent Connect fetch failed (`run-meta.json`).
- **Evaluation:** Clay labels are a quick human-checked reference for agreement scoring; they are not a full independent audit of every vendor doc.
- **`npm run research`** is intentionally a stub — use **`npm run pass2`** for the real agent.
- **GitHub Pages** serves from `docs/` on `main`; after `npm run report`, sync: `cp site/* docs/`.

---

## Development

```bash
npm run check
```

Schema: [`src/schema/appRecord.ts`](src/schema/appRecord.ts). Wave rules: [`src/assignWave.ts`](src/assignWave.ts). Rubric definitions: [`src/rubric.ts`](src/rubric.ts).

---

## Submission pointers

- **Case study:** https://coder-vis13.github.io/integration-research-agent/
- **Repo:** https://github.com/coder-vis13/integration-research-agent
- **Honesty:** unknowns, mismatches, and operational failures are on the case study and in `errors.json`.