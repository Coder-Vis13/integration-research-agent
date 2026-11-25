import { readFileSync } from "node:fs";
import { SCORED_FIELDS } from "../rubric.js";
import { CLAY_CHECKED_AT } from "./loadClaySample.js";
import { parseCsv } from "./loadClaySample.js";

export const CLAY_SOURCE_FILE = "data/clay_sample.csv";
export const LABELS_OUTPUT_FILE = "data/ground-truth/labels.json";

const COMPARABLE_AGENT_FIELDS = {
  oneLiner: "Use AI One Liner",
  access: "Use AI Access",
  apiSurface: "Use AI Api Surface",
  apiBreadth: "Use AI Api Breadth",
  mcp: "Use AI Mcp",
  mcpUrl: "Use AI Mcp Url",
  webhooks: "Use AI Webhooks",
  openApiSpecUrl: "Use AI Open Api Spec Url",
  sandbox: "Use AI Sandbox",
  pricingForApi: "Use AI Pricing For Api",
  rateLimit: "Use AI Rate Limit",
  buildability: "Use AI Buildability",
  blocker: "Use AI Blocker",
  confidence: "Use AI Confidence",
  unknownReason: "Use AI Unknown Reason",
  auth: "Authentication Method",
} as const;

const EVIDENCE_COLUMNS = {
  url: "Use AI Evidence Url",
  httpStatus: "Use AI Evidence Http Status",
  quote: "Use AI Evidence Quote",
} as const;

/** Present in some exports; not used when Authentication Method is the auth source. */
const LEGACY_AUTH_COLUMN = "Use AI Auth";

const NOT_COMPARABLE_COLUMNS = new Set([
  "id",
  "name",
  "category",
  "hint",
  "hintUrl",
  "hintNote",
  "hintUrlAlt",
  "inSample",
  "API Documentation Access",
]);

export type CellState = "blank" | "unknown" | "value";

export interface ClayCellRef {
  clayColumn: string;
  raw: string;
  state: CellState;
}

export interface ComparableClayField extends ClayCellRef {
  agentField: string;
  comparable: true;
  scored: boolean;
}

export interface ClayLabelsApp {
  id: number;
  name: string;
  clayRow: number;
  notComparable: Record<string, ClayCellRef>;
  fields: Record<string, ComparableClayField>;
  evidence: Record<string, ClayCellRef>;
}

export interface ClayLabelsFile {
  provenance: {
    source: "clay_csv";
    sourceFile: string;
    verificationStatus: "not_independently_verified";
    note: string;
    checkedAt: string;
    sampleSize: number;
  };
  comparableMappings: { agentField: string; clayColumn: string; scored: boolean }[];
  notComparableColumns: string[];
  ambiguousColumns: { clayColumn: string; reason: string }[];
  apps: ClayLabelsApp[];
}

function cellState(raw: string): CellState {
  if (raw === "") return "blank";
  if (raw.toLowerCase() === "unknown") return "unknown";
  return "value";
}

function cellRef(column: string, raw: string): ClayCellRef {
  return { clayColumn: column, raw, state: cellState(raw) };
}

function comparableField(agentField: string, column: string, raw: string): ComparableClayField {
  const scored = (SCORED_FIELDS as readonly string[]).includes(agentField);
  return {
    agentField,
    clayColumn: column,
    comparable: true,
    scored,
    raw,
    state: cellState(raw),
  };
}

export function exportClayLabelsFromCsv(
  csvText: string,
  sampleIds: readonly number[],
  sampleRule: string,
): ClayLabelsFile {
  const table = parseCsv(csvText);
  const header = table[0];
  if (!header) throw new Error("Clay sample CSV is empty.");
  if (header.includes(LEGACY_AUTH_COLUMN) && header.includes(COMPARABLE_AGENT_FIELDS.auth)) {
    throw new Error("Clay CSV has both Use AI Auth and Authentication Method. Resolve before export.");
  }

  const scoredSet = new Set<string>(SCORED_FIELDS);
  const comparableMappings = Object.entries(COMPARABLE_AGENT_FIELDS).map(([agentField, clayColumn]) => ({
    agentField,
    clayColumn,
    scored: scoredSet.has(agentField),
  }));

  const mappedClayColumns = new Set<string>([
    ...Object.values(COMPARABLE_AGENT_FIELDS),
    ...Object.values(EVIDENCE_COLUMNS),
  ]);
  const notComparableColumns = header.filter((col) => (
    NOT_COMPARABLE_COLUMNS.has(col) || (!mappedClayColumns.has(col) && col !== LEGACY_AUTH_COLUMN)
  ));
  const ambiguousColumns: ClayLabelsFile["ambiguousColumns"] = header.includes(LEGACY_AUTH_COLUMN)
    ? [{ clayColumn: LEGACY_AUTH_COLUMN, reason: "Legacy auth column; Authentication Method is absent." }]
    : [];

  const byId = new Map<number, { row: string[]; clayRow: number }>();
  for (let index = 1; index < table.length; index += 1) {
    const row = table[index];
    if (!row || !row.some((cell) => cell.trim() !== "")) continue;
    const cells = new Map<string, string>();
    for (let i = 0; i < header.length; i += 1) {
      const key = header[i];
      if (key) cells.set(key, row[i] ?? "");
    }
    const idText = (cells.get("id") ?? "").trim();
    if (idText === "") throw new Error(`Clay row ${index + 1} has no id.`);
    const id = Number(idText);
    if (!Number.isInteger(id)) throw new Error(`Clay row ${index + 1} id is not an integer.`);
    if (byId.has(id)) throw new Error(`Duplicate Clay id ${id} at row ${index + 1}.`);
    byId.set(id, { row, clayRow: index + 1 });
  }

  for (const id of byId.keys()) {
    if (!sampleIds.includes(id)) {
      throw new Error(`Clay row id ${id} is not in the fixed sample.`);
    }
  }

  const apps: ClayLabelsApp[] = [];
  for (const id of sampleIds) {
    const found = byId.get(id);
    if (!found) throw new Error(`Clay sample CSV is missing sample id ${id}.`);
    const cells = new Map<string, string>();
    for (let i = 0; i < header.length; i += 1) {
      const key = header[i];
      if (key) cells.set(key, found.row[i] ?? "");
    }
    const name = (cells.get("name") ?? "").trim();
    if (name === "") throw new Error(`Clay row for id ${id} has an empty name.`);
    const notComparable: Record<string, ClayCellRef> = {};
    for (const column of notComparableColumns) {
      if (!NOT_COMPARABLE_COLUMNS.has(column)) continue;
      notComparable[column] = cellRef(column, cells.get(column) ?? "");
    }
    const fields: Record<string, ComparableClayField> = {};
    for (const [agentField, column] of Object.entries(COMPARABLE_AGENT_FIELDS)) {
      if (!header.includes(column)) {
        throw new Error(`Clay CSV is missing column ${column} for ${agentField}.`);
      }
      fields[agentField] = comparableField(agentField, column, cells.get(column) ?? "");
    }
    const evidence: Record<string, ClayCellRef> = {};
    for (const [key, column] of Object.entries(EVIDENCE_COLUMNS)) {
      if (!header.includes(column)) throw new Error(`Clay CSV is missing column ${column}.`);
      evidence[key] = cellRef(column, cells.get(column) ?? "");
    }
    apps.push({ id, name, clayRow: found.clayRow, notComparable, fields, evidence });
  }

  return {
    provenance: {
      source: "clay_csv",
      sourceFile: CLAY_SOURCE_FILE,
      verificationStatus: "not_independently_verified",
      note: [
        "Clay-derived reference for scorer agreement checks.",
        "This is not independently verified ground truth.",
        sampleRule,
      ].join(" "),
      checkedAt: CLAY_CHECKED_AT,
      sampleSize: sampleIds.length,
    },
    comparableMappings,
    notComparableColumns: [...notComparableColumns],
    ambiguousColumns,
    apps,
  };
}

export function loadSampleIds(sampleJsonText: string): number[] {
  const parsed = JSON.parse(sampleJsonText) as { apps: { id: number }[] };
  return parsed.apps.map((app) => app.id);
}

export function validateClayLabelsFile(labels: ClayLabelsFile, sampleIds: readonly number[]): string[] {
  const issues: string[] = [];
  if (labels.apps.length !== sampleIds.length) {
    issues.push(`Expected ${sampleIds.length} apps, got ${labels.apps.length}.`);
  }
  const ids = labels.apps.map((app) => app.id);
  const dup = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (dup.length > 0) issues.push(`Duplicate app ids: ${[...new Set(dup)].join(", ")}.`);
  for (const id of sampleIds) {
    if (!ids.includes(id)) issues.push(`Missing sample id ${id}.`);
  }
  for (const id of ids) {
    if (!sampleIds.includes(id)) issues.push(`Extra app id ${id} not in sample.`);
  }
  for (const app of labels.apps) {
    for (const mapping of labels.comparableMappings) {
      const field = app.fields[mapping.agentField];
      if (!field) {
        issues.push(`App ${app.id} missing field ${mapping.agentField}.`);
        continue;
      }
      if (field.clayColumn !== mapping.clayColumn) {
        issues.push(`App ${app.id} field ${mapping.agentField} column mismatch.`);
      }
      if (field.raw !== field.raw.trim() && field.state !== "blank") {
        // Clay cells are stored as parsed CSV values; leading/trailing space would be visible in raw.
      }
    }
    for (const [key, item] of Object.entries(app.evidence)) {
      if (!item.clayColumn.startsWith("Use AI Evidence")) {
        issues.push(`App ${app.id} evidence ${key} has unexpected column ${item.clayColumn}.`);
      }
    }
  }
  return issues;
}

export function exportClayLabelsFromPaths(
  csvPath: string,
  samplePath: string,
  sampleRule: string,
): ClayLabelsFile {
  return exportClayLabelsFromCsv(
    readFileSync(csvPath, "utf8"),
    loadSampleIds(readFileSync(samplePath, "utf8")),
    sampleRule,
  );
}