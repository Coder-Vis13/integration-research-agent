# Composio assignment — final deliverables plan

## How to use this file

Run the two Composer prompts **one at a time**. Start with Phase 5, review its output, then run Phase 6. Do not ask Composer to execute the whole file in one go.

**Scope:** finish the local case-study page and README. Do not deploy, commit, push, stage, or publish anything.

---

# Phase 5 — Build the case-study page

## Goal

Create one polished, self-explanatory HTML case study that a reviewer can understand in about two minutes. Use the actual project outputs and source code; do not invent findings or overstate accuracy.

## Must include

- Headline findings and useful patterns across all 100 apps, calculated from the actual Pass 2 records.
- A searchable/filterable app table or matrix showing the core research fields, buildability verdict/blocker, and evidence links. Show `unknown`/missing data honestly.
- A concise explanation of the actual research-agent workflow, technologies and retrieval/verification steps, based on the implemented code and run metadata.
- Human involvement and limitations, stated accurately.
- Pass 1 vs Pass 2 evaluation on the fixed 28-app sample: agreement with Clay, coverage, abstentions and mismatches, with denominators. Clearly label this **agreement with Clay, not factual accuracy**.
- At least one named example of a match and one named disagreement/failure, with the relevant evidence. Do not call a Clay disagreement a factual error unless independently verified against official documentation.
- A runnable local proof: the exact verified command(s) to run the research agent and/or view the report. Do not invent a live URL.

## Constraints

- Use the existing app catalogue, Pass 1/Pass 2 records, metrics/errors and actual code. Inspect their schemas before implementing.
- Do not change the research agent, prompts, scorer, sample, labels, metrics or run records to improve the presentation.
- Do not claim independently verified accuracy or human verification unless the project contains evidence of what was actually checked. The current Phase 4 report says the Clay labels are `not_independently_verified`.
- Do not include secrets, `.env` values, private notes, `private/` contents or raw files that may contain sensitive information in public `site/` assets.
- Prefer a simple static page. Reuse existing reporting scripts/components if they work; do not add a framework or unnecessary dependencies.

## Acceptance checks

- The page works locally from the repository and explains the result without narration.
- Counts and charts are generated from the records and reconcile with the underlying grouped data; test this programmatically where practical.
- The 100-app table has 100 distinct app IDs and links to the available evidence.
- All evaluation figures match the Phase 4 outputs and retain their denominators and Clay-agreement caveat.
- Run the existing project checks and report the results.

## Composer prompt — Phase 5

```text
Implement Phase 5 only: build the final local HTML case study.

First inspect the current repository, actual data schemas, existing report scripts, and the Phase 4 evaluation artifacts. Reuse what exists; do not assume the old plan's report command or file layout is implemented.

Create a polished, static, self-explanatory case study under the existing site/report location (use site/index.html if appropriate). Include concise headline patterns across all 100 apps, a searchable/filterable 100-app table with core fields and evidence links, the actual agent workflow and tools, human involvement/limitations, and a Pass 1 vs Pass 2 evaluation section for the fixed 28-app sample.

Use the Phase 4 numbers exactly, including denominators. Label them as agreement with Clay, not factual accuracy. Show coverage, abstentions and mismatches as well as answered-only agreement. Include at least one named match and one named disagreement or operational failure. Do not describe a Clay disagreement as a proven factual error.

Generate any supporting JSON/CSV assets needed by the page from the existing source records. Ensure all summary counts reconcile with the underlying records. Use only public-safe content: no secrets, .env values, private/ contents, or raw logs that may expose sensitive information.

Do not change the agent, prompts, research records, sample, labels, scorer or metrics. Do not add a framework or unnecessary dependencies. Do not deploy, commit, push or stage anything.

Run appropriate validation and the existing project checks. Report the files created/changed, the local preview instructions, the checks performed, and any content that could not be supported by the data. Stop after Phase 5.
```

---

# Phase 6 — Write the README (no deployment)

## Goal

Write a short, accurate README that lets another developer understand the project and run the research agent and evaluation without needing this conversation.

## Must include

- What the project does and the 100-app research problem it addresses.
- A brief architecture/workflow overview based on the actual code.
- Prerequisites and setup instructions.
- Exact verified commands for checks, the full research run, scoring Pass 1/Pass 2, and viewing the local case study.
- Required environment-variable **names**, their purpose and where to obtain them. Never include actual secrets or `.env` values.
- Where outputs are saved and how to interpret the evaluation.
- Known limitations: evidence/retrieval gaps, operational failures, and that the Phase 4 score is agreement with Clay-derived labels, not independently established factual accuracy.
- Clearly state that deployment has not been performed; do not add a fake live URL.

## Constraints

- Inspect `package.json`, CLI entry points, configuration and the actual implementation before writing commands or describing the architecture.
- Do not copy stale commands from earlier notes. In particular, verify whether `npm run research` is still a stub; document the correct runnable command.
- Document the actual model/provider used in Pass 2 only if confirmed by configuration/run metadata.
- Do not expose secrets, private/ contents, or internal-only paths as public downloads.
- Do not modify the research pipeline, records, labels, metrics or case-study findings.
- Do not deploy, commit, push, stage, or create a deployment configuration.

## Acceptance checks

- A new developer can follow the README to install dependencies, configure environment variables, run checks, understand/run the research pipeline, reproduce scoring, and preview the case study locally.
- Every documented command and environment variable has been checked against the current codebase.
- No secrets or private material appear in the README or public site assets.

## Composer prompt — Phase 6

```text
Implement Phase 6 only: write or update the repository README. Do not deploy.

Inspect the actual package scripts, CLI entry points, configuration, run metadata and current case-study files before documenting anything. Write a concise README that explains the project, the implemented research-agent workflow, setup/prerequisites, required environment-variable names and purposes, exact verified commands for checks/research/scoring/local report preview, output locations, and known limitations.

Document the actual provider/model only if confirmed by the current configuration or run metadata. Verify every command rather than copying old notes. Explicitly warn against any research command that is still a stub, if that remains true.

State accurately that the Phase 4 evaluation measures agreement with Clay-derived labels, not independently established factual accuracy. Explain the main coverage/evidence limitations and the known operational failures without hiding them. Do not claim human verification unless its scope is evidenced in the repository.

Do not include secret values, .env contents, private/ files or a fictitious live URL. State that the case study is currently available as a local preview and has not been deployed.

Do not modify the research agent, research outputs, sample, labels, scorer, metrics or case-study findings. Do not deploy, commit, push, stage, or create deployment configuration.

Run the existing project checks and verify that each README command and environment-variable name matches the codebase. Report files changed, checks run, and anything still incomplete. Stop after the README is complete.
```

---

## Final handoff checklist

- [ ] Case-study page and any supporting public-safe JSON/CSV are generated.
- [ ] All reported counts reconcile with the source records.
- [ ] Phase 1–4 results and limitations are represented accurately.
- [ ] README setup, environment variables and commands are verified against the code.
- [ ] Local preview works.
- [ ] No deployment, commit, push or staging was performed.
