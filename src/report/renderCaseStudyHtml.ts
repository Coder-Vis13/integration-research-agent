import type { CaseStudyData } from "./buildCaseStudyData.js";
import { WAVE_LABELS, type WaveBucket } from "../assignWave.js";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pct(n: number, d: number): string {
  if (d === 0) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

export function renderCaseStudyHtml(data: CaseStudyData, jsonPayload: string): string {
  const sf = data.evaluation.pass1.scoredFields;
  const s2 = data.evaluation.pass2.scoredFields;
  const fields = ["auth", "access", "apiSurface", "mcp", "buildability"] as const;

  const scoreMatrix = fields.map((field) => {
    const f1 = sf[field];
    const f2 = s2[field];
    return `<tr>
      <th scope="row">${field}</th>
      <td>${f1.agreementAmongAnswered.numerator}/${f1.agreementAmongAnswered.denominator} <span class="pct">${pct(f1.agreementAmongAnswered.numerator, f1.agreementAmongAnswered.denominator)}</span></td>
      <td>${f2.agreementAmongAnswered.numerator}/${f2.agreementAmongAnswered.denominator} <span class="pct">${pct(f2.agreementAmongAnswered.numerator, f2.agreementAmongAnswered.denominator)}</span></td>
      <td>${f2.coverageOfEvaluable.numerator}/${f2.coverageOfEvaluable.denominator}</td>
      <td>${f2.abstentions.count}</td>
      <td>${f2.mismatches.count}</td>
    </tr>`;
  }).join("\n");

  const waveRows = (Object.keys(WAVE_LABELS) as WaveBucket[])
    .filter((key) => data.headline.waveCounts[key] > 0)
    .sort((a, b) => data.headline.waveCounts[b] - data.headline.waveCounts[a])
    .map((key) => `<tr><td>${escapeHtml(WAVE_LABELS[key])}</td><td class="num">${data.headline.waveCounts[key]}</td></tr>`)
    .join("\n");

  const hitRows = data.verificationRows.clayMatches.map((row) => `<tr class="hit">
    <td>${escapeHtml(row.appName)}</td><td>${escapeHtml(row.field)}</td>
    <td><code>${escapeHtml(row.agentValue)}</code></td><td><code>${escapeHtml(row.clayValue)}</code></td>
  </tr>`).join("\n");

  const missRows = data.verificationRows.clayMismatches.map((row) => `<tr class="miss">
    <td>${escapeHtml(row.appName)}</td><td>${escapeHtml(row.field)}</td>
    <td><code>${escapeHtml(row.agentValue)}</code></td><td><code>${escapeHtml(row.clayValue)}</code></td>
  </tr>`).join("\n");

  const tableRows = data.apps.map((app) => {
    const link = app.evidenceUrls[0]
      ? `<a href="${escapeHtml(app.evidenceUrls[0])}" target="_blank" rel="noopener">source</a>`
      : "—";
    return `<tr data-name="${escapeHtml(app.name.toLowerCase())}" data-wave="${escapeHtml(app.wave)}">
      <td>${app.id}</td>
      <td>${escapeHtml(app.name)}</td>
      <td>${escapeHtml(app.auth)}</td>
      <td>${escapeHtml(app.access)}</td>
      <td>${escapeHtml(app.apiSurface)}</td>
      <td>${escapeHtml(app.buildability)}</td>
      <td>${escapeHtml(app.waveLabel)}</td>
      <td>${link}</td>
    </tr>`;
  }).join("\n");

  const p2 = data.evaluation.pass2.fiveFieldAgreementAnswered;
  const p1 = data.evaluation.pass1.fiveFieldAgreementAnswered;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>100-app research agent — case study</title>
  <style>
    :root {
      --bg: #f6f8fb;
      --surface: #fff;
      --text: #0f172a;
      --muted: #475569;
      --line: #e2e8f0;
      --accent: #1d4ed8;
      --accent-soft: #dbeafe;
      --hit: #ecfdf5;
      --miss: #fef2f2;
      --human: #fffbeb;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Segoe UI", system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); line-height: 1.55; font-size: 16px; }
    a { color: var(--accent); }
    code, .cmd { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.88em; background: #f1f5f9; padding: 0.15em 0.4em; border-radius: 4px; }
    .cmd { display: block; padding: 0.65rem 0.85rem; margin: 0.35rem 0; border: 1px solid var(--line); background: #fff; }
    header { background: var(--surface); border-bottom: 1px solid var(--line); padding: 1.25rem 1.5rem 1rem; }
    header h1 { margin: 0; font-size: 1.65rem; font-weight: 700; letter-spacing: -0.02em; }
    .tagline { margin: 0.5rem 0 0; color: var(--muted); max-width: 46rem; }
    nav.jump { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; margin-top: 1rem; font-size: 0.9rem; }
    nav.jump a { text-decoration: none; font-weight: 600; }
    main { max-width: 1080px; margin: 0 auto; padding: 1.25rem 1.5rem 3rem; }
    section { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 1.25rem 1.35rem; margin-bottom: 1.25rem; }
    section h2 { margin: 0 0 0.75rem; font-size: 1.15rem; font-weight: 700; }
    section h2 span { font-weight: 500; color: var(--muted); font-size: 0.95rem; }
    .headline-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; margin: 0.75rem 0 1rem; }
    .stat { background: var(--accent-soft); border-radius: 10px; padding: 0.75rem; text-align: center; }
    .stat .n { display: block; font-size: 1.75rem; font-weight: 800; color: var(--accent); line-height: 1.1; }
    .stat .l { font-size: 0.8rem; color: var(--muted); }
    .bullets { margin: 0; padding-left: 1.2rem; color: var(--muted); }
    .bullets li { margin: 0.35rem 0; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th, td { border-bottom: 1px solid var(--line); padding: 0.5rem 0.55rem; text-align: left; vertical-align: top; }
    th { color: var(--muted); font-weight: 600; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; }
    .pct { color: var(--muted); font-size: 0.85em; }
    td.num, .num { font-variant-numeric: tabular-nums; font-weight: 600; }
    .callout { background: var(--human); border: 1px solid #fde68a; border-radius: 8px; padding: 0.85rem 1rem; margin: 0.75rem 0; font-size: 0.95rem; }
    .callout strong { display: block; margin-bottom: 0.35rem; }
    .warn { background: #f8fafc; border-left: 4px solid var(--accent); padding: 0.65rem 0.9rem; font-size: 0.92rem; color: var(--muted); margin-bottom: 0.75rem; }
    .flow { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; font-size: 0.88rem; color: var(--muted); margin: 0.5rem 0 1rem; }
    .flow span { background: #f1f5f9; padding: 0.35rem 0.55rem; border-radius: 6px; }
    .flow .arrow { background: none; padding: 0; }
    tr.hit { background: var(--hit); }
    tr.miss { background: var(--miss); }
    details.findings { border: none; padding: 0; background: transparent; }
    details.findings summary { cursor: pointer; font-weight: 600; margin-bottom: 0.75rem; }
    .table-scroll { overflow: auto; max-height: 65vh; }
    #filters { margin-bottom: 0.75rem; display: flex; gap: 0.5rem; flex-wrap: wrap; }
    #filters input, #filters select { padding: 0.45rem 0.6rem; border: 1px solid var(--line); border-radius: 6px; }
    footer { font-size: 0.8rem; color: var(--muted); text-align: center; padding: 1rem; }
    @media print { section { break-inside: avoid; } nav.jump { display: none; } }
  </style>
</head>
<body>
  <header>
    <h1>Composio 100-app research agent</h1>
    <p class="tagline">TypeScript pipeline: fetch docs → extract with a small LLM → verify quotes → score against a fixed 28-app Clay sample. This page is generated from frozen JSON; nothing here is hand-typed.</p>
    <nav class="jump" aria-label="Sections">
      <a href="#patterns">Patterns</a>
      <a href="#verification">Verification</a>
      <a href="#agent">Agent &amp; humans</a>
      <a href="#proof">Proof / rerun</a>
      <a href="#findings">100-app table</a>
    </nav>
  </header>

  <main>
    <section id="patterns">
      <h2>Headline patterns <span>Pass 2 · n=${data.headline.waveTotal}</span></h2>
      <div class="headline-strip">
        <div class="stat"><span class="n">${data.headline.buildNow}</span><span class="l">build_now</span></div>
        <div class="stat"><span class="n">${data.headline.rowsWithQuotedEvidence}</span><span class="l">quoted evidence</span></div>
        <div class="stat"><span class="n">${data.headline.unknownAccess}</span><span class="l">unknown access</span></div>
        <div class="stat"><span class="n">${data.headline.unknownAuth}</span><span class="l">unknown auth</span></div>
        <div class="stat"><span class="n">${data.headline.retrievalExa}</span><span class="l">used Exa backup</span></div>
      </div>
      <ul class="bullets">
        ${data.headlineSummary.map((line) => `<li>${escapeHtml(line)}</li>`).join("\n")}
      </ul>
      <table>
        <thead><tr><th>Wave bucket (computed)</th><th>Apps</th></tr></thead>
        <tbody>${waveRows}</tbody>
      </table>
    </section>

    <section id="verification">
      <h2>Verification <span>28-app sample · agreement with Clay (not factual accuracy)</span></h2>
      <div class="warn">${escapeHtml(data.evaluationNote)} A quick human check was done on the Clay sample before scoring.</div>
      <p class="bullets" style="list-style:none;padding:0;margin:0 0 0.75rem;">
        <strong>Among answered fields only:</strong> Pass 1 <code>${p1.numerator}/${p1.denominator}</code> (${pct(p1.numerator, p1.denominator)}) →
        Pass 2 <code>${p2.numerator}/${p2.denominator}</code> (${pct(p2.numerator, p2.denominator)}).
        Pass 2 answers more access/mcp fields but abstains more on buildability (4/28 coverage).
      </p>
      <table aria-label="Pass 2 Clay agreement matrix">
        <thead>
          <tr>
            <th>Field</th>
            <th>Pass 1 agree</th>
            <th>Pass 2 agree</th>
            <th>Pass 2 coverage</th>
            <th>Pass 2 abstain</th>
            <th>Pass 2 miss</th>
          </tr>
        </thead>
        <tbody>
          ${scoreMatrix}
        </tbody>
      </table>

      <h2 style="margin-top:1.25rem;font-size:1rem;">Hits <span style="font-weight:500;color:var(--muted)">Pass 2 matches Clay (sample)</span></h2>
      <div class="table-scroll"><table>
        <thead><tr><th>App</th><th>Field</th><th>Agent</th><th>Clay</th></tr></thead>
        <tbody>${hitRows}</tbody>
      </table></div>

      <h2 style="margin-top:1.25rem;font-size:1rem;">Misses <span style="font-weight:500;color:var(--muted)">disagreement ≠ proven error</span></h2>
      <div class="table-scroll"><table>
        <thead><tr><th>App</th><th>Field</th><th>Agent</th><th>Clay</th></tr></thead>
        <tbody>${missRows}</tbody>
      </table></div>
      <p style="font-size:0.88rem;color:var(--muted);margin:0.5rem 0 0;">Operational gap: <strong>${escapeHtml(data.examples.operationalFailure.app)}</strong> — ${escapeHtml(data.examples.operationalFailure.issue)}.</p>
    </section>

    <section id="agent">
      <h2>The agent <span>what we built</span></h2>
      <div class="flow">
        <span>apps.json</span><span class="arrow">→</span>
        <span>HTTP doc finder</span><span class="arrow">→</span>
        <span>optional Exa search</span><span class="arrow">→</span>
        <span>LLM extract (${escapeHtml(data.workflow.promptPass2)})</span><span class="arrow">→</span>
        <span>quote verifier</span><span class="arrow">→</span>
        <span>records.json</span>
      </div>
      <ol class="bullets">
        ${data.workflow.tools.map((step) => `<li>${escapeHtml(step)}</li>`).join("\n")}
      </ol>
      <div class="callout">
        <strong>Where a human was needed</strong>
        <ul style="margin:0.35rem 0 0;padding-left:1.2rem;">
          ${data.humanInvolvement.map((line) => `<li>${escapeHtml(line)}</li>`).join("\n")}
        </ul>
      </motion.div>
      <ul class="bullets">
        ${data.limitations.map((line) => `<li>${escapeHtml(line)}</li>`).join("\n")}
      </ul>
    </section>

    <section id="proof">
      <h2>Proof <span>live case study and reruns</span></h2>
      ${data.proof.liveUrl
    ? `<p style="margin-top:0;font-size:1rem;"><strong>Live case study:</strong> <a href="${escapeHtml(data.proof.liveUrl)}">${escapeHtml(data.proof.liveUrl)}</a></p>`
    : `<p style="margin-top:0;color:var(--muted);font-size:0.95rem;">No live deploy URL in site/deploy.json.</p>`}
      ${data.proof.repoUrl
    ? `<p style="margin:0.35rem 0 0;font-size:0.95rem;"><strong>Source repo:</strong> <a href="${escapeHtml(data.proof.repoUrl)}">${escapeHtml(data.proof.repoUrl)}</a></p>`
    : ""}
      <p style="margin:0.5rem 0;color:var(--muted);font-size:0.9rem;">Machine-readable export: <a href="data.json">data.json</a>. Local preview: ${escapeHtml(data.proof.localPreview)}</p>
      ${data.proof.commands.map((item) => `<p style="margin:0.75rem 0 0.15rem;font-size:0.85rem;font-weight:600;">${escapeHtml(item.label)}</p><code class="cmd">${escapeHtml(item.command)}</code>`).join("\n")}
    </section>

    <section id="findings">
      <details class="findings" open>
        <summary>Findings — full Pass 2 table (100 apps)</summary>
        <div id="filters">
          <input type="search" id="search" placeholder="Search name…" aria-label="Search app name"/>
          <select id="waveFilter" aria-label="Filter wave"><option value="">All waves</option>
            ${(Object.keys(WAVE_LABELS) as WaveBucket[]).map((key) => `<option value="${key}">${escapeHtml(WAVE_LABELS[key])}</option>`).join("")}
          </select>
        </div>
        <div class="table-scroll">
          <table id="appTable">
            <thead>
              <tr><th>#</th><th>App</th><th>Auth</th><th>Access</th><th>Surface</th><th>Build</th><th>Wave</th><th>Evidence</th></tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </details>
      <p style="margin:0.75rem 0 0;font-size:0.88rem;"><a href="data.csv">data.csv</a> · same rows as the table</p>
    </section>

    <script type="application/json" id="research-data">${jsonPayload}</script>
  </main>
  <footer>Generated ${escapeHtml(data.generatedAt)} from data/runs/pass2 and metrics JSON.</footer>
  <script>
    const search = document.getElementById("search");
    const waveFilter = document.getElementById("waveFilter");
    const rows = [...document.querySelectorAll("#appTable tbody tr")];
    function applyFilters() {
      const q = (search && search.value || "").trim().toLowerCase();
      const wave = waveFilter ? waveFilter.value : "";
      for (const row of rows) {
        const name = row.getAttribute("data-name") || "";
        const rowWave = row.getAttribute("data-wave") || "";
        row.style.display = (!q || name.includes(q)) && (!wave || rowWave === wave) ? "" : "none";
      }
    }
    if (search) search.addEventListener("input", applyFilters);
    if (waveFilter) waveFilter.addEventListener("change", applyFilters);
  </script>
</body>
</html>`;
}