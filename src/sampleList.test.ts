import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { appIdentitySchema } from "./schema/appRecord.js";

const POSITION_IDS = [1, 10, 11, 20, 21, 30, 31, 40, 41, 50, 51, 60, 61, 70, 71, 80, 81, 90, 91, 100];
const TRAP_IDS = [58, 59, 84, 85, 92, 96, 97, 98];
const LABEL_KEYS = ["auth", "access", "apiSurface", "mcp", "buildability", "evidenceUrl", "note", "labels"];

test("sample.json has the 28 pre-registered ids and no label fields", () => {
  const sample = JSON.parse(
    readFileSync(new URL("../data/sample.json", import.meta.url), "utf8"),
  ) as {
    selectionRule: string;
    apps: Record<string, unknown>[];
  };
  const apps = appIdentitySchema.array().parse(
    JSON.parse(readFileSync(new URL("../data/apps.json", import.meta.url), "utf8")),
  );
  assert.equal(sample.apps.length, 28);
  assert.match(sample.selectionRule, /App 1 and app 10/);
  assert.match(sample.selectionRule, /Sherlock/);
  assert.match(sample.selectionRule, /Otter AI/);
  assert.match(sample.selectionRule, /Devin/);
  const ids = sample.apps.map((app) => app.id);
  assert.deepEqual(ids, [...POSITION_IDS, ...TRAP_IDS]);
  for (const entry of sample.apps) {
    assert.deepEqual(Object.keys(entry).sort(), ["id", "name"]);
    for (const key of LABEL_KEYS) {
      assert.equal(Object.hasOwn(entry, key), false);
    }
    const source = apps.find((app) => app.id === entry.id);
    assert.ok(source);
    assert.equal(entry.name, source?.name);
  }
  const smokeIds = [3, 25, 26, 27, 47];
  for (const smokeId of smokeIds) {
    assert.equal(ids.includes(smokeId), false);
  }
});
