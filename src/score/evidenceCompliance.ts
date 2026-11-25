import type { AppRecord } from "../schema/appRecord.js";
import type { ClayLabelsApp } from "../clay/exportClayLabels.js";

export interface EvidenceComplianceRow {
  appId: number;
  appName: string;
  clayEvidenceEvaluable: boolean;
  clayUrl: string;
  clayQuote: string;
  agentEvidenceCount: number;
  agentUrlMatchesClay: boolean;
  agentHas2xxEvidence: boolean;
  agentQuoteNonEmpty: boolean;
}

export function evidenceComplianceForApp(
  clay: ClayLabelsApp,
  record: AppRecord,
): EvidenceComplianceRow {
  const urlCell = clay.evidence.url;
  const quoteCell = clay.evidence.quote;
  const statusCell = clay.evidence.httpStatus;
  const clayEvaluable = urlCell.state === "value"
    && quoteCell.state === "value"
    && urlCell.raw.trim() !== ""
    && quoteCell.raw.trim() !== "";
  const clayUrl = urlCell.raw.trim();
  const agentEvidence = record.evidence;
  const agentUrlMatchesClay = clayEvaluable
    && agentEvidence.some((item) => item.url.trim() === clayUrl);
  const agentHas2xxEvidence = agentEvidence.some((item) => item.httpStatus >= 200 && item.httpStatus < 300);
  const agentQuoteNonEmpty = agentEvidence.some((item) => item.quote.trim() !== "");
  const statusOk = statusCell.state === "value"
    && Number.isInteger(Number(statusCell.raw))
    && Number(statusCell.raw) >= 200
    && Number(statusCell.raw) < 300;
  return {
    appId: clay.id,
    appName: clay.name,
    clayEvidenceEvaluable: clayEvaluable && statusOk,
    clayUrl,
    clayQuote: quoteCell.raw,
    agentEvidenceCount: agentEvidence.length,
    agentUrlMatchesClay,
    agentHas2xxEvidence,
    agentQuoteNonEmpty,
  };
}