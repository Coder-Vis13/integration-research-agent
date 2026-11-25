import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appsToCsv, buildCaseStudyData } from "../report/buildCaseStudyData.js";
import { renderCaseStudyHtml } from "../report/renderCaseStudyHtml.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const siteDir = path.join(root, "site");

const data = buildCaseStudyData(root);
mkdirSync(siteDir, { recursive: true });

const publicData = {
  generatedAt: data.generatedAt,
  metricLabel: data.metricLabel,
  evaluationNote: data.evaluationNote,
  headline: data.headline,
  patterns: data.patterns,
  evaluation: data.evaluation,
  examples: data.examples,
  workflow: data.workflow,
  humanInvolvement: data.humanInvolvement,
  limitations: data.limitations,
  headlineSummary: data.headlineSummary,
  verificationRows: data.verificationRows,
  proof: data.proof,
  apps: data.apps,
};

writeFileSync(path.join(siteDir, "data.json"), JSON.stringify(publicData, null, 2));
writeFileSync(path.join(siteDir, "data.csv"), appsToCsv(data.apps));
const jsonPayload = JSON.stringify(publicData).replace(/</g, "\\u003c");
writeFileSync(path.join(siteDir, "index.html"), renderCaseStudyHtml(data, jsonPayload));

console.log(`Wrote ${path.join(siteDir, "index.html")}, data.json, and data.csv.`);
console.log(`Wave total: ${data.headline.waveTotal}; five-field agreement (answered): ${data.evaluation.pass2.fiveFieldAgreementAnswered.numerator}/${data.evaluation.pass2.fiveFieldAgreementAnswered.denominator}.`);