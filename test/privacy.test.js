import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPrivacySnapshot } from "../src/privacy.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const demoPath = path.resolve(dirname, "../examples/privacy");

test("privacy snapshot reports evidence without returning secret values", async () => {
  const snapshot = await createPrivacySnapshot({ demo: true, demoPath });

  assert.equal(snapshot.observed.filesInspected, 1);
  assert.deepEqual(snapshot.observed.endpoints.map((item) => item.host).sort(), ["127.0.0.1", "mcp.example.test"]);
  assert.deepEqual(snapshot.observed.mcpServers.map((item) => item.name).sort(), ["documentation", "local-tools"]);
  assert.equal(snapshot.observed.telemetry[0].status, "enabled");
  assert.equal(snapshot.observed.secretReferences[0].storage, "inline-value");
  assert.equal(snapshot.liveTraffic.status, "unknown");
  assert.doesNotMatch(JSON.stringify(snapshot), /replace-me/);
});
