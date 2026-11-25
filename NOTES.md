# NOTES

Public record for the case study. Append only. Dated. AI tools were used to write the pipeline code. A human fills the ground-truth labels and must approve any paid run of more than 5 apps. Phase 0 did not call an extraction model.

## Decision log

- 2026-11-25: Phase 0 locks the schema, the wave order, the 26-app sample, and a blank worksheet. Research answers are not in this repo. The binding plan is private and is not copied here.
- 2026-11-25: Phase 1 adds an env-switched LLM client. `LLM_PROVIDER=stub` returns a schema-valid unknown record and does not call a provider. anthropic, openai, google, and openai-compatible are recognized and refused until that provider's SDK is installed. The cache key is provider, model, prompt version, pass id, and evidence hash.
- 2026-11-25: typescript-eslint 8.74.0 refuses TypeScript 7.0 because 7.0 has no compiler API. Following the TypeScript 7.0 side-by-side note, `typescript` is installed as `@typescript/typescript6` (the `tsc6` API eslint imports) and TypeScript 7.0.2 stays available as `@typescript/native`, which provides the `tsc` used by `npm run typecheck`.
- 2026-11-25: The hand-check sample adds Otter AI (92) and Devin (96) before any extraction. The brief names both as MCP apps, and the position rule misses them. The sample is 28. Accuracy is exact-match divided by 28.
- 2026-11-25: Phase 2 installs `@composio/core` 0.31.0. The installed types name `composio.toolkits.get` and `session.execute`, matching the plan. No Composio key was set, so the live catalog call was skipped and a fictional fixture was used. A saved page under 400 characters, or any non-2xx page, is too thin to support `no_public_api` or an API surface. The doc finder follows at most 8 same-site doc links. `retrievalMode` is printed beside the record. It is not a schema field, because the locked field list does not include it.
- 2026-11-25: The blank worksheet is removed. The 28-app sample draft is `data/clay_sample.csv`. The loader does not write `data/ground-truth/labels.json` or `data/runs/`. The export has no auth column, so loaded auth is `unknown` and confidence is `low`.
- 2026-11-25: The replacement `data/clay_sample.csv` stores auth in a column named `Authentication Method`. The loader accepts that name and `Use AI Auth`. A missing auth column still loads as `unknown` with confidence `low`.
- 2026-11-25: `openai` 7.64.0 is installed for `LLM_PROVIDER=openai-compatible`. Calls use `chat.completions.create` with a draft-07 JSON schema, `strict` false, then the Zod schema. The model slug is `google/gemini-2.5-flash-lite`. The base URL is `https://openrouter.ai/api/v1`. The research command reads `.env`. A variable already set in the shell wins. anthropic, openai, and google are still not installed.
- 2026-11-25: The five-app smoke left auth unknown because the doc finder skipped developer subdomains and paths such as api-keys and api-reference, and the prompt did not tell the model to treat an OAuth or API key label as auth. The finder now keeps same-site links, including a developer subdomain, when the host or path contains docs, developer, api, auth, or oauth, skips image and stylesheet links, prefers auth-looking links, and follows one further hop only for those links. The cap stays 8. Long pages keep windows around those words. Prompt version is smoke-v3. The model stays `google/gemini-2.5-flash-lite` because four of the five apps were never shown an auth page. A stronger model would still have had nothing to quote. The rerun measured 54,909 input tokens and 2,926 output tokens. Discord, Pumble, and Ecwid then named a login method. Pipedrive's developer page is a script shell and still does not say OAuth or API key, so its auth stays unknown.

## Rubric

A scored field is correct only on an exact match. Auth is an exact set. There is no partial credit. The default error type is mismatch. Scored fields are auth, access, apiSurface, mcp, and buildability. Breadth is not scored. The wave headline is computed by code and is not one of the scored fields.

<!-- rubric:start -->
### auth
- `oauth2`: The docs describe OAuth 2.0. A bearer token produced by OAuth is still oauth2.
- `api_key`: A static key or static bearer secret the developer creates or is issued.
- `basic`: HTTP Basic username and password.
- `token`: A personal or long-lived token the docs treat as its own method, distinct from OAuth and from an API key.
- `other`: A documented method that is none of the above, backed by a quote.
- `unknown`: The fetched text does not say. On Pass 0, the model was not shown any text.

### access
- `self_serve_free`: A developer can create working credentials at no charge, with no review and no sales step.
- `self_serve_trial`: A developer can create credentials on a free trial, with no sales step.
- `paid_plan`: A paid plan is required before credentials work. No partnership is required.
- `admin_approval`: The vendor must review or approve the app, developer token, or account before credentials work or go to production. This includes app review, developer-token approval, and admin enablement. No paid contract or partnership is required.
- `partner_or_sales`: A partnership, enterprise agreement, or contact-sales step is required to get credentials.
- `no_public_api`: The product has no public programmatic API to get credentials for.
- `unknown`: The docs that were fetched do not say which access path is true.

### apiSurface
- `rest`: A documented HTTP REST API.
- `graphql`: A documented GraphQL API.
- `both`: Documented REST and GraphQL.
- `sdk_only`: A documented SDK or client library without a public HTTP reference the page treats as the API.
- `cli_only`: A command-line tool, with no documented HTTP API.
- `mcp_only`: An MCP server is the documented programmatic surface, with no REST or GraphQL reference.
- `none`: The docs say there is no programmatic API.
- `unknown`: The fetch did not produce enough text to choose. Missing docs stay unknown, not none.

### apiBreadth
- `narrow`: One small product area. Not scored.
- `moderate`: Several resource groups, not a whole platform. Not scored.
- `broad`: A large platform API. Not scored.
- `unknown`: The page does not support a band. Do not invent an endpoint count. Not scored.

### mcp
- `official`: The vendor’s own docs describe an MCP server.
- `community`: The fetched pages describe a third-party MCP server.
- `none_found`: Usable docs were fetched and they do not mention MCP.
- `unknown`: There were no usable docs, so none_found would be a guess.

### webhooks
- `yes`: The page says the product sends outbound events. Not scored.
- `no`: The docs discuss the API and do not describe webhooks. Not scored.
- `unknown`: The docs are too thin to say. Not scored.

### sandbox
- `yes`: The page describes a test mode or sandbox credentials. Not scored.
- `no`: The docs discuss the API and do not describe a sandbox. Not scored.
- `unknown`: The docs are too thin to say. Not scored.

### pricingForApi
- `free`: The page says API access is free. Not scored. This can differ from access.
- `trial`: The page says API access starts on a trial. Not scored.
- `paid`: The page says API access requires payment. Not scored.
- `enterprise`: The page says API access is an enterprise offer. Not scored.
- `unknown`: The page does not state a price for API access. Not scored.

### buildability
- `build_now`: Public API, and a developer can get credentials without review or a sales step.
- `needs_app_review`: An API exists, and admin approval or app review blocks production use.
- `needs_outreach`: A paid plan, partnership, or sales step blocks credentials.
- `cli_or_skill_only`: A CLI or local skill, not an HTTP API toolkit.
- `no_public_api`: No public programmatic surface.
- `unknown`: The evidence does not support a verdict.

### confidence
- `high`: At least one evidence item has a URL and a quote. The verifier has not lowered it.
- `medium`: A real quote exists, and an optional field is unknown or a check was only partly satisfied.
- `low`: Thin evidence, or the verifier forced a scored field to unknown. Pass 0 cannot be high.
<!-- rubric:end -->

## Sample

Selection rule: app 1 and app 10 in each of the 10 categories, plus Sherlock, Waterfall.io, Paygent Connect, iPayX, Otter AI, Devin, higgsfield, and Mermaid CLI.

The 28 names: Salesforce, DealCloud, Zendesk, Gladly, Slack, Vonage, Google Ads, SendGrid, Shopify, fanbasis, DataForSEO, Clay, GitHub, Sentry, Notion, Harvest, Stripe, PitchBook, NotebookLM, Grain, Sherlock, Waterfall.io, Paygent Connect, iPayX, Otter AI, Devin, higgsfield, Mermaid CLI.

Smoke apps are outside this list: Pipedrive, Discord, Telegram, Pumble, Ecwid. data/sample.json stores ids and names only.

## Passes

No passes have been run.

- 2026-11-25: Pass 1 wrote `data/runs/pass1/records.json` for all 100 apps. The owner ordered that write before any git commit. Discovery was HTTP only. The catalog was the saved copy. Composio search was not called. Measured tokens were 898,566 input and 56,180 output. The provider did not return a dollar cost. Applying the listed $0.10 and $0.40 rates to those tokens is $0.1123. That is not a measured charge. 55 records have auth unknown. 18 had no usable page. Google Ads failed during fetch. No model call failed.
- 2026-11-25: Pass 1 underperformed. Login is unknown on 55 apps and access is unknown on 84. Work is ongoing to improve retrieval and the checks before another full run. No files were changed for that improvement in this step.
- 2026-11-25: Retrieval now strips a parenthetical note from the hint, skips a doc link that fails or is not HTTP 2xx without using one of the 8 slots, and does not treat a bare authentication path as an API doc. The prompt is smoke-v4. build_now is kept only when access is self-serve and auth is known. No new research pass was run.
- 2026-11-25: Exa Instant is the fallback after HTTP leaves an app thin. The session enables the exa toolkit. The tools are EXA_SEARCH and EXA_GET_CONTENTS_ACTION. No separate Exa key is used. The call budget is EXA_MAX_APPS. A 3-app probe then a 10-app probe were run. The only live Exa calls were one search and one contents call for Otter AI. Composio reported a charge of $0.000000 for each. Listed prices were $0.007 per search and $0.001 per page, with a 100 percent Instant discount. The 10-app file is data/smoke/probe10.json. No row was build_now with unknown access. Google Ads auth is oauth2. Login stayed unknown for HubSpot, Salesforce, Zendesk, SendGrid, Pipedrive, Otter AI, and Clay.
- 2026-11-25: Backup search runs when the fetched text has no login phrase, not when the page is merely short. Docs indexes under /docs and /documentation are followed. Locale copies and duplicate page text do not take a slot. A non-vendor page is labeled and cannot be the only basis for a gate or wave. Motivating case: HubSpot and Pipedrive.
- 2026-11-25: Each scored login, access, and surface value must appear in its own quote. A quote that says API key is stored as api_key. Motivating case: Otter, where that quote had been dropped.
- 2026-11-25: Code sets buildability and confidence from the quoted facts. An MCP miss does not lower the row. Motivating case: Pumble.
- 2026-11-25: A wave is unknown unless the deciding fact is in a vendor quote. The two unknown labels are "No usable docs found" and "Docs found, don't state it". Pass 1 at data/runs/pass1 is frozen. The next full run is Pass 2.
- 2026-11-25: `data/ground-truth/labels.json` is a faithful export of `data/clay_sample.csv` with per-field Clay column provenance. Regenerate with `npm run clay-labels` only when labels.json is absent. A quick human check was done on the Clay sample before scoring.
- 2026-11-25: `npm run score -- --pass pass1|pass2` compares the 28-app sample to Clay labels and writes `data/runs/<pass>/metrics.json` and `errors.json`. Output is agreement_with_clay, not factual accuracy. `SCORE_ALLOW_UNCOMMITTED=yes` bypasses the commit gate until labels are committed.
- 2026-11-25: Phase 4 scored Pass 1 and Pass 2 against Clay labels. Five-field agreement among answered rows moved 34/48 to 38/49. Pass 2 raised access coverage on the sample from 1/24 to 5/24 but increased buildability abstentions. Pass 2 full-set scored-field unknown rates remain high (access 83/100, buildability 87/100).
- 2026-11-25: `npm run report` writes `site/index.html`, `site/data.json`, and `site/data.csv` from Pass 2 records and frozen Pass 1 and Pass 2 metrics. Numbers are agreement_with_clay, not factual accuracy.
- 2026-11-26: README documents setup, env var names, `npm run pass2` as the full research command, scoring, and local case study preview.
- 2026-11-26: Case study published at https://coder-vis13.github.io/integration-research-agent/ from GitHub Pages (branch main, folder docs).
- 2026-11-25: The full current pipeline is `COST_OK=yes npm run pass2` (`src/cli/pass1.ts --pass2`), not `npm run research`. Research still uses stub prompt `phase1-stub-v1` with no page fetch. Pass 2 wrote `data/runs/pass2/records.json` for all 100 apps with prompt `smoke-v4`. Pass 1 at `data/runs/pass1` was not overwritten. Measured tokens were 1,251,271 input and 62,108 output. Listed estimate before the run was $0.1698. The provider returned no dollar cost. Twenty apps used Composio Exa backup search. DealCloud failed one model call with HTTP 503 and kept an unknown record. Six apps had no usable page. Fetch failed for Paygent Connect. No duplicate app IDs. `data/runs/pass2/run-meta.json` records command, revision, cache policy, and failures without secrets.

## Error table

No scored comparison yet.

## Human time

## Time Breakdown
* **Phase 0:** 40 minutes
* **Phase 1:** 20 minutes
* **Clay sample check:** 108 minutes (1 hour and 48 minutes)
* **Phase 2:** 120 minutes (2 hours)
* **Phase 3:** 25 minutes
* **Phase 4:** 180 minutes (3 hours)
* **Phase 5:** 30 minutes
* **Phase 6:** 15 minutes

**Total time:** 538 minutes (8 hours and 58 minutes)

## Surprises

- 2026-11-24: `composio.toolkits.get` returns the page of toolkits and drops `next_cursor`. A page of 1000 is rejected instead of being treated as the full catalog. There is no typed cursor loop.

## Keys and provider

The extraction client reads `LLM_PROVIDER` from the environment. No API key is recorded here. Phase 0 used no model.

- 2026-11-25: `LLM_PROVIDER=openai-compatible` is wired. The model slug is `google/gemini-2.5-flash-lite`. The base URL is `https://openrouter.ai/api/v1`. The key stays in `.env` and is not copied here.
- 2026-11-25: One cached connectivity ping returned ok. It used 14 input tokens and 8 output tokens. It was not a research pass.
- 2026-11-25: `composio.toolkits.get` still drops `next_cursor`. The live catalog now walks `getClient().toolkits.list`, which returns `next_cursor`. A repeated cursor or a cursor after 40 pages throws.
- 2026-11-25: Phase 3 smoke wrote `data/smoke/records.json` for Pipedrive, Discord, Telegram, Pumble, and Ecwid. Discovery was HTTP only. Each page sent to the model is capped at 16,000 characters. The kept pass measured 51,263 input tokens and 2,748 output tokens. The provider did not return a dollar cost. A later pass returned HTTP 429 for three apps and was not kept. `data/runs/` was not created.

- 2026-11-24: The research command reads `LLM_PROVIDER` from the environment. Stub mode was run for one app and wrote no research conclusions. `.env` is not loaded automatically and is not recorded here.
- 2026-11-24: `COMPOSIO_API_KEY` was empty. The research command printed that the live catalog call was skipped. No Composio request was made.

## Rule changes

- 2026-11-25: If access or API surface is unknown and the model gives no reason, the client fills unknownReason before schema parsing. Discord and Ecwid motivated it. The schema rejects that shape for every app.
- 2026-11-25: build_now with a blocker is stored as buildability unknown and the blocker is kept. Any other buildability with an empty blocker gets a blocker sentence. Telegram and Ecwid motivated it. The schema cannot store either combination.
- 2026-11-25: build_now is kept only when access is self-serve and auth is known. Otherwise it becomes unknown. HubSpot, Pipedrive, and SendGrid motivated it. An unknown access field does not prove a developer can get credentials.
