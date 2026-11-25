import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { missingRubricDefinitions, renderRubricMarkdown } from "./rubric.js";

test("every enum value has a rubric definition", () => {
  assert.deepEqual(missingRubricDefinitions(), []);
});

test("NOTES.md rubric section matches the rubric module", () => {
  const notes = readFileSync(new URL("../NOTES.md", import.meta.url), "utf8");
  const start = notes.indexOf("<!-- rubric:start -->");
  const end = notes.indexOf("<!-- rubric:end -->");
  assert.ok(start !== -1 && end !== -1 && end > start);
  const section = notes.slice(start + "<!-- rubric:start -->".length, end).trim();
  assert.equal(section, renderRubricMarkdown());
});
