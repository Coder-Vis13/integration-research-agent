import { readFileSync } from "node:fs";
import { assignWave, WAVE_LABELS, type WaveBucket } from "../assignWave.js";
import type { FieldResult, ScoreReport } from "../score/scoreSample.js";
import { appIdentitySchema, appRecordSchema } from "../schema/appRecord.js";
import { z } from "zod";

const runFileSchema = z.object({
  catalog: z.string().optional(),
  apps: z.array(z.object({
    id: z.number().int(),
    name: z.string(),
    category: z.string(),
    record: appRecordSchema,
    retrieval: z.object({
      mode: z.enum(["http_only", "composio_search"]),
      sentence: z.string(),
      searchSlug: z.string().nullable(),
    }),
  })),
});

export interface CaseStudyAppRow {
  id: number;
  name: string;
  category: string;
  auth: string;
  access: string;
  apiSurface: string;
  mcp: string;
  buildability: string;
  confidence: string;
  wave: WaveBucket;
  waveLabel: string;
  retrievalMode: string;
  composioSlug: string | null;
  evidenceUrls: string[];
  promptVersion: string;
}

export interface CaseStudyData {
  generatedAt: string;
  metricLabel: "agreement_with_clay";
  evaluationNote: string;
  headline: {
    waveCounts: Record<WaveBucket, number>;
    waveTotal: number;
    buildNow: number;
    unknownAccess: number;
    unknownAuth: number;
    rowsWithQuotedEvidence: number;
    retrievalHttpOnly: number;
    retrievalExa: number;
  };
  patterns: {
    topAuthModes: { label: string; count: number }[];
    buildability: Record<string, number>;
  };
  evaluation: {
    sampleSize: number;
    pass1: Pick<ScoreReport, "scoredFields" | "evidenceCompliance"> & {
      fiveFieldAgreementAnswered: { numerator: number; denominator: number };
    };
    pass2: Pick<ScoreReport, "scoredFields" | "evidenceCompliance"> & {
      fiveFieldAgreementAnswered: { numerator: number; denominator: number };
    };
  };
  examples: {
    clayMatch: { app: string; field: string; pass2Value: string; clayValue: string; note: string };
    clayMismatch: { app: string; field: string; pass2Value: string; clayValue: string; note: string };
    operationalFailure: { app: string; issue: string; note: string };
  };
  workflow: {
    command: string;
    promptPass1: string;
    promptPass2: string;
    tools: string[];
  };
  humanInvolvement: string[];
  limitations: string[];
  headlineSummary: string[];
  verificationRows: {
    clayMatches: { appName: string; field: string; agentValue: string; clayValue: string }[];
    clayMismatches: { appName: string; field: string; agentValue: string; clayValue: string }[];
  };
  proof: {
    localPreview: string;
    commands: { label: string; command: string }[];
  };
  apps: CaseStudyAppRow[];
}

function formatAuth(auth: readonly string[]): string {
  return auth.join("|");
}

function fiveFieldTotals(scoredFields: ScoreReport["scoredFields"]): { numerator: number; denominator: number } {
  let numerator = 0;
  let denominator = 0;
  for (const field of Object.values(scoredFields)) {
    numerator += field.agreementAmongAnswered.numerator;
    denominator += field.agreementAmongAnswered.denominator;
  }
  return { numerator, denominator };
}

function countAuthModes(apps: readonly CaseStudyAppRow[]): { label: string; count: number }[] {
  const tally = new Map<string, number>();
  for (const app of apps) {
    tally.set(app.auth, (tally.get(app.auth) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

export function buildCaseStudyData(root: string): CaseStudyData {
  const pass2Path = `${root}/data/runs/pass2/records.json`;
  const pass1MetricsPath = `${root}/data/runs/pass1/metrics.json`;
  const pass2MetricsPath = `${root}/data/runs/pass2/metrics.json`;

  const run = runFileSchema.parse(JSON.parse(readFileSync(pass2Path, "utf8")));
  const pass1Metrics = JSON.parse(readFileSync(pass1MetricsPath, "utf8")) as ScoreReport;
  const pass2Metrics = JSON.parse(readFileSync(pass2MetricsPath, "utf8")) as ScoreReport;
  const identities = appIdentitySchema.array().parse(
    JSON.parse(readFileSync(`${root}/data/apps.json`, "utf8")),
  );
  const categoryById = new Map(identities.map((app) => [app.id, app.category]));

  const waveCounts = {} as Record<WaveBucket, number>;
  for (const key of Object.keys(WAVE_LABELS) as WaveBucket[]) {
    waveCounts[key] = 0;
  }

  const apps: CaseStudyAppRow[] = [];
  let buildNow = 0;
  let unknownAccess = 0;
  let unknownAuth = 0;
  let rowsWithQuotedEvidence = 0;
  let retrievalHttpOnly = 0;
  let retrievalExa = 0;
  const buildability: Record<string, number> = {};

  for (const row of run.apps) {
    const record = row.record;
    const wave = assignWave(record);
    waveCounts[wave] += 1;
    if (record.buildability === "build_now") buildNow += 1;
    if (record.access === "unknown") unknownAccess += 1;
    if (record.auth.length === 1 && record.auth[0] === "unknown") unknownAuth += 1;
    if (record.evidence.some((item) => item.quote.trim() !== "" && item.url.trim() !== "")) {
      rowsWithQuotedEvidence += 1;
    }
    if (row.retrieval.mode === "http_only") retrievalHttpOnly += 1;
    else retrievalExa += 1;
    buildability[record.buildability] = (buildability[record.buildability] ?? 0) + 1;

    const evidenceUrls = [...new Set(record.evidence.map((item) => item.url).filter((url) => url.trim() !== ""))];
    apps.push({
      id: row.id,
      name: row.name,
      category: row.category || categoryById.get(row.id) || "unknown",
      auth: formatAuth(record.auth),
      access: record.access,
      apiSurface: record.apiSurface,
      mcp: record.mcp,
      buildability: record.buildability,
      confidence: record.confidence,
      wave,
      waveLabel: WAVE_LABELS[wave],
      retrievalMode: row.retrieval.mode,
      composioSlug: record.composio?.slug ?? null,
      evidenceUrls,
      promptVersion: record.promptVersion,
    });
  }

  apps.sort((a, b) => a.id - b.id);

  const pass2Errors = JSON.parse(readFileSync(`${root}/data/runs/pass2/errors.json`, "utf8")) as {
    mismatches: { appName: string; field: string; agentValue: string; clayValue: string }[];
  };
  const clayMatches = (pass2Metrics.fieldResults as FieldResult[])
    .filter((row) => row.kind === "match")
    .slice(0, 10)
    .map((row) => ({
      appName: row.appName,
      field: row.field,
      agentValue: row.agentValue,
      clayValue: row.clayValue,
    }));
  const clayMismatches = pass2Errors.mismatches.map((row) => ({
    appName: row.appName,
    field: row.field,
    agentValue: row.agentValue,
    clayValue: row.clayValue,
  }));

  const silentDocs = waveCounts.unknown_docs_silent ?? 0;
  const noDocs = waveCounts.unknown_no_docs ?? 0;

  return {
    generatedAt: new Date().toISOString(),
    metricLabel: "agreement_with_clay",
    evaluationNote: "Scores are agreement with Clay-exported reference values on the fixed 28-app sample, not established factual accuracy.",
    headline: {
      waveCounts,
      waveTotal: apps.length,
      buildNow,
      unknownAccess,
      unknownAuth,
      rowsWithQuotedEvidence,
      retrievalHttpOnly,
      retrievalExa,
    },
    patterns: {
      topAuthModes: countAuthModes(apps),
      buildability,
    },
    evaluation: {
      sampleSize: pass2Metrics.sampleSize,
      pass1: {
        scoredFields: pass1Metrics.scoredFields,
        evidenceCompliance: pass1Metrics.evidenceCompliance,
        fiveFieldAgreementAnswered: fiveFieldTotals(pass1Metrics.scoredFields),
      },
      pass2: {
        scoredFields: pass2Metrics.scoredFields,
        evidenceCompliance: pass2Metrics.evidenceCompliance,
        fiveFieldAgreementAnswered: fiveFieldTotals(pass2Metrics.scoredFields),
      },
    },
    examples: {
      clayMatch: {
        app: "Salesforce",
        field: "auth",
        pass2Value: "oauth2",
        clayValue: "oauth2",
        note: "Pass 2 moved from abstention to an answered value that matches the Clay reference.",
      },
      clayMismatch: {
        app: "Zendesk",
        field: "access",
        pass2Value: "self_serve_trial",
        clayValue: "self_serve_free",
        note: "Pass 2 quoted trial marketing copy; Clay labeled self-serve free. This is a disagreement with Clay, not proof of a factual error.",
      },
      operationalFailure: {
        app: "DealCloud",
        issue: "HTTP 503 from the extraction provider",
        note: "The pipeline kept a schema-valid unknown placeholder with empty evidence.",
      },
    },
    workflow: {
      command: "COST_OK=yes EXA_MAX_APPS=20 npm run pass2",
      promptPass1: "smoke-v3",
      promptPass2: "smoke-v4",
      tools: [
        "HTTP doc discovery (hint URL plus same-site developer links, capped at eight pages)",
        "Composio Exa Instant backup (EXA_SEARCH, EXA_GET_CONTENTS_ACTION) when login wording is missing",
        "OpenRouter extraction with google/gemini-2.5-flash-lite",
        "Quote-based generic verifier and Composio catalog match",
      ],
    },
    humanInvolvement: [
      "A quick human check was done on the Clay sample labels before scoring.",
      "The 28-app evaluation sample was fixed before any extraction.",
      "Paid runs over five apps required an explicit cost estimate and COST_OK=yes.",
    ],
    limitations: [
      "Access and buildability stay unknown on most of the 100-app Pass 2 run (83 and 87 rows respectively).",
      "Six apps had no usable page; DealCloud failed one model call.",
      "Agreement with Clay does not prove either Clay or the agent is factually correct.",
    ],
    headlineSummary: [
      `On all 100 apps (Pass 2), ${buildNow} look buildable now with quoted evidence, but ${unknownAccess} still have unknown access and ${unknownAuth} have unknown auth.`,
      `${rowsWithQuotedEvidence} rows carry at least one quoted URL; ${retrievalExa} needed Composio Exa backup search after HTTP.`,
      `${silentDocs + noDocs} apps land in an unknown wave because docs are missing or silent on gates (${noDocs} no usable docs, ${silentDocs} docs present but no gating quote).`,
    ],
    verificationRows: {
      clayMatches,
      clayMismatches,
    },
    proof: {
      localPreview: "Open site/index.html in a browser, or run: npx --yes serve site",
      commands: [
        { label: "Re-run the 100-app pipeline (Pass 2)", command: "COST_OK=yes EXA_MAX_APPS=20 npm run pass2" },
        { label: "Score agreement with Clay", command: "SCORE_ALLOW_UNCOMMITTED=yes npm run score -- --pass pass2" },
        { label: "Regenerate this page from frozen JSON", command: "npm run report" },
        { label: "Typecheck, lint, tests", command: "npm run check" },
      ],
    },
    apps,
  };
}

export function appsToCsv(apps: readonly CaseStudyAppRow[]): string {
  const header = [
    "id", "name", "category", "auth", "access", "apiSurface", "mcp", "buildability",
    "confidence", "wave", "retrievalMode", "composioSlug", "firstEvidenceUrl",
  ];
  const rows = apps.map((app) => [
    String(app.id),
    escapeCsv(app.name),
    escapeCsv(app.category),
    escapeCsv(app.auth),
    app.access,
    app.apiSurface,
    app.mcp,
    app.buildability,
    app.confidence,
    app.wave,
    app.retrievalMode,
    app.composioSlug ?? "",
    app.evidenceUrls[0] ?? "",
  ]);
  return [header.join(","), ...rows.map((row) => row.join(","))].join("\n");
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}