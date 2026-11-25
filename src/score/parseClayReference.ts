import {
  accessSchema,
  apiSurfaceSchema,
  authMethodSchema,
  buildabilitySchema,
  mcpSchema,
  type Access,
  type ApiSurface,
  type AuthMethod,
  type Buildability,
  type McpStatus,
} from "../schema/appRecord.js";
import type { ComparableClayField } from "../clay/exportClayLabels.js";

export type UnscorableReason =
  | "clay_blank"
  | "clay_unknown"
  | "clay_unparseable"
  | "agent_row_missing";

export type ParsedClayScored =
  | { kind: "evaluable"; value: string | AuthMethod[] }
  | { kind: "unscorable"; reason: UnscorableReason };

function parseAuthRaw(raw: string, name: string): AuthMethod[] {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "unknown") return ["unknown"];
  let parts: string[];
  if (trimmed.startsWith("[")) {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      throw new Error(`Clay auth for ${name} is not a JSON string list.`);
    }
    parts = parsed;
  } else {
    parts = trimmed.split(",").map((item) => item.trim()).filter((item) => item !== "");
  }
  if (parts.length === 0) return ["unknown"];
  return parts.map((item) => authMethodSchema.parse(item));
}

export function clayFieldEvaluable(field: ComparableClayField): ParsedClayScored {
  if (field.state === "blank") return { kind: "unscorable", reason: "clay_blank" };
  if (field.state === "unknown") return { kind: "unscorable", reason: "clay_unknown" };
  if (field.agentField === "auth") {
    try {
      const auth = parseAuthRaw(field.raw, field.agentField);
      if (auth.length === 1 && auth[0] === "unknown") {
        return { kind: "unscorable", reason: "clay_unknown" };
      }
      return { kind: "evaluable", value: auth };
    } catch {
      return { kind: "unscorable", reason: "clay_unparseable" };
    }
  }
  try {
    if (field.agentField === "access") {
      return { kind: "evaluable", value: accessSchema.parse(field.raw.trim()) as Access };
    }
    if (field.agentField === "apiSurface") {
      return { kind: "evaluable", value: apiSurfaceSchema.parse(field.raw.trim()) as ApiSurface };
    }
    if (field.agentField === "mcp") {
      return { kind: "evaluable", value: mcpSchema.parse(field.raw.trim()) as McpStatus };
    }
    if (field.agentField === "buildability") {
      return { kind: "evaluable", value: buildabilitySchema.parse(field.raw.trim()) as Buildability };
    }
    return { kind: "evaluable", value: field.raw.trim() };
  } catch {
    return { kind: "unscorable", reason: "clay_unparseable" };
  }
}

export function agentAuthAbstains(auth: readonly AuthMethod[]): boolean {
  return auth.length === 1 && auth[0] === "unknown";
}

export function authSetsEqual(left: readonly AuthMethod[], right: readonly AuthMethod[]): boolean {
  const a = [...left].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export function formatAuth(auth: readonly AuthMethod[]): string {
  return [...auth].sort().join("|");
}

export function formatAgentValue(field: string, record: {
  auth: AuthMethod[];
  access: Access;
  apiSurface: ApiSurface;
  mcp: McpStatus;
  buildability: Buildability;
}): string {
  if (field === "auth") return formatAuth(record.auth);
  if (field === "access") return record.access;
  if (field === "apiSurface") return record.apiSurface;
  if (field === "mcp") return record.mcp;
  if (field === "buildability") return record.buildability;
  return "";
}

export function formatClayValue(field: string, value: string | AuthMethod[]): string {
  if (field === "auth" && Array.isArray(value)) return formatAuth(value);
  return String(value);
}

export function agentFieldAbstains(field: string, record: {
  auth: AuthMethod[];
  access: Access;
  apiSurface: ApiSurface;
  mcp: McpStatus;
  buildability: Buildability;
}): boolean {
  if (field === "auth") return agentAuthAbstains(record.auth);
  const value = formatAgentValue(field, record);
  return value === "unknown";
}