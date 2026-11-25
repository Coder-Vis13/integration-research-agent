import { readFileSync } from "node:fs";

// A value already in the environment wins, so `LLM_PROVIDER=stub npm run research` stays on the stub.
export function loadEnvFile(filePath: string, env: NodeJS.ProcessEnv = process.env): void {
  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (error) {
    const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
    if (missing) return;
    throw error;
  }
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = (lines[i] ?? "").trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) throw new Error(`Invalid .env line ${i + 1}.`);
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\""))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (env[key] === undefined) env[key] = value;
  }
}
