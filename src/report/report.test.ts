import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { buildCaseStudyData } from "./buildCaseStudyData.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("case study wave headline counts sum to 100 Pass 2 rows", () => {
  const data = buildCaseStudyData(root);
  const sum = Object.values(data.headline.waveCounts).reduce((total, count) => total + count, 0);
  assert.equal(sum, data.headline.waveTotal);
  assert.equal(data.apps.length, 100);
  assert.equal(data.evaluation.pass1.fiveFieldAgreementAnswered.numerator, 34);
  assert.equal(data.evaluation.pass1.fiveFieldAgreementAnswered.denominator, 48);
  assert.equal(data.evaluation.pass2.fiveFieldAgreementAnswered.numerator, 38);
  assert.equal(data.evaluation.pass2.fiveFieldAgreementAnswered.denominator, 49);
});