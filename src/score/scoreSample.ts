import type { ClayLabelsFile } from "../clay/exportClayLabels.js";
import type { AppRecord } from "../schema/appRecord.js";
import { SCORED_FIELDS } from "../rubric.js";
import { evidenceComplianceForApp, type EvidenceComplianceRow } from "./evidenceCompliance.js";
import {
  agentFieldAbstains,
  authSetsEqual,
  clayFieldEvaluable,
  formatAgentValue,
  formatClayValue,
  type UnscorableReason,
} from "./parseClayReference.js";

export type FieldResultKind = "match" | "mismatch" | "abstention" | "unscorable";

export interface FieldResult {
  appId: number;
  appName: string;
  field: string;
  kind: FieldResultKind;
  agentValue: string;
  clayValue: string;
  unscorableReason?: UnscorableReason;
}

export interface CountSummary {
  numerator: number;
  denominator: number;
}

export interface FieldMetrics {
  agreementAmongAnswered: CountSummary;
  coverageOfEvaluable: CountSummary;
  abstentions: { count: number };
  mismatches: { count: number };
  unscorableClay: { count: number };
}

export interface ScoreReport {
  metricLabel: "agreement_with_clay";
  verificationNote: string;
  passId: string;
  recordsPath: string;
  labelsPath: string;
  sampleSize: number;
  scoredFields: Record<string, FieldMetrics>;
  fieldResults: FieldResult[];
  mismatches: FieldResult[];
  evidenceCompliance: {
    clayEvidenceEvaluable: CountSummary;
    agentUrlMatchesClay: CountSummary;
    agentHas2xxEvidence: CountSummary;
    agentQuoteNonEmpty: CountSummary;
    rows: EvidenceComplianceRow[];
  };
  limitations: string[];
}

export interface RunRow {
  id: number;
  name: string;
  record: AppRecord;
}

function emptyFieldMetrics(): FieldMetrics {
  return {
    agreementAmongAnswered: { numerator: 0, denominator: 0 },
    coverageOfEvaluable: { numerator: 0, denominator: 0 },
    abstentions: { count: 0 },
    mismatches: { count: 0 },
    unscorableClay: { count: 0 },
  };
}

function addCount(summary: CountSummary, hit: boolean): void {
  summary.denominator += 1;
  if (hit) summary.numerator += 1;
}

export function scoreSampleAgainstClay(
  labels: ClayLabelsFile,
  runRows: readonly RunRow[],
  passId: string,
  recordsPath: string,
  labelsPath: string,
): ScoreReport {
  const byId = new Map(runRows.map((row) => [row.id, row]));
  const fieldResults: FieldResult[] = [];
  const metrics: Record<string, FieldMetrics> = {};
  for (const field of SCORED_FIELDS) {
    metrics[field] = emptyFieldMetrics();
  }

  const evidenceRows: EvidenceComplianceRow[] = [];
  let clayEvidenceEvaluable = 0;
  let urlMatch = 0;
  let has2xx = 0;
  let quoteNonEmpty = 0;

  for (const clayApp of labels.apps) {
    const row = byId.get(clayApp.id);
    if (!row) {
      for (const field of SCORED_FIELDS) {
        metrics[field].unscorableClay.count += 1;
        fieldResults.push({
          appId: clayApp.id,
          appName: clayApp.name,
          field,
          kind: "unscorable",
          agentValue: "",
          clayValue: "",
          unscorableReason: "agent_row_missing",
        });
      }
      continue;
    }

    const evidence = evidenceComplianceForApp(clayApp, row.record);
    evidenceRows.push(evidence);
    if (evidence.clayEvidenceEvaluable) {
      clayEvidenceEvaluable += 1;
      if (evidence.agentUrlMatchesClay) urlMatch += 1;
      if (evidence.agentHas2xxEvidence) has2xx += 1;
      if (evidence.agentQuoteNonEmpty) quoteNonEmpty += 1;
    }

    for (const field of SCORED_FIELDS) {
      const clayField = clayApp.fields[field];
      if (!clayField) continue;
      const parsed = clayFieldEvaluable(clayField);
      const m = metrics[field];
      if (parsed.kind === "unscorable") {
        m.unscorableClay.count += 1;
        fieldResults.push({
          appId: clayApp.id,
          appName: clayApp.name,
          field,
          kind: "unscorable",
          agentValue: formatAgentValue(field, row.record),
          clayValue: clayField.raw,
          unscorableReason: parsed.reason,
        });
        continue;
      }

      addCount(m.coverageOfEvaluable, !agentFieldAbstains(field, row.record));
      const clayValue = parsed.value;
      const agentValue = formatAgentValue(field, row.record);

      if (agentFieldAbstains(field, row.record)) {
        m.abstentions.count += 1;
        fieldResults.push({
          appId: clayApp.id,
          appName: clayApp.name,
          field,
          kind: "abstention",
          agentValue,
          clayValue: formatClayValue(field, clayValue),
        });
        continue;
      }

      const matches = field === "auth" && Array.isArray(clayValue)
        ? authSetsEqual(row.record.auth, clayValue)
        : agentValue === String(clayValue);

      addCount(m.agreementAmongAnswered, matches);
      if (matches) {
        fieldResults.push({
          appId: clayApp.id,
          appName: clayApp.name,
          field,
          kind: "match",
          agentValue,
          clayValue: formatClayValue(field, clayValue),
        });
      } else {
        m.mismatches.count += 1;
        fieldResults.push({
          appId: clayApp.id,
          appName: clayApp.name,
          field,
          kind: "mismatch",
          agentValue,
          clayValue: formatClayValue(field, clayValue),
        });
      }
    }
  }

  const limitations = [
    "Scores measure agreement with Clay-exported reference values, not independently verified factual accuracy.",
    "Only the fixed 28-app sample is scored. This is not a random sample of 100 apps.",
    "Pass 1 records used prompt smoke-v3 and the verifier rules at run time; they were not re-verified with current code.",
  ];

  return {
    metricLabel: "agreement_with_clay",
    verificationNote: labels.provenance.verificationStatus,
    passId,
    recordsPath,
    labelsPath,
    sampleSize: labels.apps.length,
    scoredFields: metrics,
    fieldResults,
    mismatches: fieldResults.filter((item) => item.kind === "mismatch"),
    evidenceCompliance: {
      clayEvidenceEvaluable: { numerator: clayEvidenceEvaluable, denominator: labels.apps.length },
      agentUrlMatchesClay: { numerator: urlMatch, denominator: clayEvidenceEvaluable },
      agentHas2xxEvidence: { numerator: has2xx, denominator: clayEvidenceEvaluable },
      agentQuoteNonEmpty: { numerator: quoteNonEmpty, denominator: clayEvidenceEvaluable },
      rows: evidenceRows,
    },
    limitations,
  };
}