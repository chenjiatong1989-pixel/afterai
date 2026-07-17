import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSession, analyzeSessions } from "../src/analyzer.js";

test("marks a generic session verified only when deterministic verification passes", () => {
  const session = analyzeSession({
    id: "verified",
    source: "custom",
    file: "/tmp/2026-07-17.jsonl",
    events: [
      { timestamp: "2026-07-17T10:00:00Z", task: "Fix login", model: "test-model" },
      { timestamp: "2026-07-17T10:01:00Z", file_path: "src/login.js" },
      { timestamp: "2026-07-17T10:02:00Z", command: "npm test", exit_code: 0 },
      { timestamp: "2026-07-17T10:03:00Z", message: "Completed the fix", usage: { input_tokens: 100, output_tokens: 20 } },
    ],
  });
  assert.equal(session.status, "verified");
  assert.equal(session.usage.totalTokens, 120);
  assert.deepEqual(session.models, ["test-model"]);
});

test("uses Unknown instead of inventing missing generic usage", () => {
  const recap = analyzeSessions([{
    id: "unknown",
    source: "custom",
    file: "/tmp/2026-07-17.jsonl",
    events: [{ timestamp: "2026-07-17T10:00:00Z", task: "Inspect repository" }],
  }], { range: "today", now: new Date("2026-07-17T12:00:00Z") });

  assert.equal(recap.sessions[0].status, "unknown");
  assert.equal(recap.usage.source, "unknown");
  assert.equal(recap.usage.estimatedCostUsd, null);
});

test("parses current Codex events without treating context paths as changed files", () => {
  const session = analyzeSession({
    id: "codex-real-shape",
    source: "codex",
    file: "/tmp/2026-07-17/session.jsonl",
    events: [
      { timestamp: "2026-07-17T10:00:00Z", type: "session_meta", payload: { model: "gpt-5.6-sol", cwd: "C:/work/project" } },
      { timestamp: "2026-07-17T10:00:01Z", type: "turn_context", payload: { workspace_roots: Array.from({ length: 12 }, (_, index) => `C:/work/path-${index}`) } },
      { timestamp: "2026-07-17T10:00:02Z", type: "event_msg", payload: { type: "user_message", message: "Fix checkout validation" } },
      { timestamp: "2026-07-17T10:00:03Z", type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 20, total_tokens: 120 } } } },
      { timestamp: "2026-07-17T10:01:00Z", type: "response_item", payload: { type: "function_call", name: "exec_command", call_id: "call-1", arguments: JSON.stringify({ cmd: "npm test" }) } },
      { timestamp: "2026-07-17T10:01:02Z", type: "response_item", payload: { type: "function_call_output", call_id: "call-1", output: JSON.stringify({ exit_code: 0, output: "12 tests passed" }) } },
      { timestamp: "2026-07-17T10:01:03Z", type: "event_msg", payload: { type: "task_complete", last_agent_message: "Implemented and verified the checkout fix." } },
    ],
  });

  assert.equal(session.title, "Fix checkout validation");
  assert.equal(session.status, "verified");
  assert.deepEqual(session.models, ["gpt-5.6-sol"]);
  assert.equal(session.usage.totalTokens, 120);
  assert.equal(session.usage.cacheTokens, 40);
  assert.equal(session.evidence.some((item) => item.type === "files"), false);
  assert.equal(session.retryCount, 0);
});

test("uses only the latest cumulative Codex token snapshot", () => {
  const session = analyzeSession({
    id: "tokens",
    source: "codex",
    file: "/tmp/2026-07-17/session.jsonl",
    events: [
      { timestamp: "2026-07-17T10:00:00Z", type: "event_msg", payload: { type: "user_message", message: "Inspect repository" } },
      { timestamp: "2026-07-17T10:00:01Z", type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 } } } },
      { timestamp: "2026-07-17T10:00:02Z", type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 160, output_tokens: 40, total_tokens: 200 } } } },
    ],
  });
  assert.equal(session.usage.totalTokens, 200);
});

test("hides an ordinary Codex conversation while retaining its token usage", () => {
  const recap = analyzeSessions([{
    id: "chat",
    source: "codex",
    file: "/tmp/2026-07-17/session.jsonl",
    events: [
      { timestamp: "2026-07-17T10:00:00Z", type: "event_msg", payload: { type: "user_message", message: "What model are you?" } },
      { timestamp: "2026-07-17T10:00:01Z", type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 80, output_tokens: 20, total_tokens: 100 } } } },
      { timestamp: "2026-07-17T10:00:02Z", type: "event_msg", payload: { type: "task_complete", last_agent_message: "I am an AI model." } },
    ],
  }], { range: "today", now: new Date("2026-07-17T12:00:00Z") });

  assert.equal(recap.sessions.length, 0);
  assert.equal(recap.counts.scanned, 1);
  assert.equal(recap.counts.hidden, 1);
  assert.equal(recap.usage.totalTokens, 100);
  assert.equal(recap.headline, "No actionable AI work found for this period.");
  assert.doesNotMatch(recap.headline, /Good/);
});

test("reports the exact number of tasks needing review and hides inconclusive chat", () => {
  const now = new Date("2026-07-17T12:00:00Z");
  const recap = analyzeSessions([
    {
      id: "failed", source: "custom", file: "/tmp/2026-07-17-failed.jsonl",
      events: [{ timestamp: "2026-07-17T10:00:00Z", task: "Download file", command: "curl file", exit_code: 1 }],
    },
    {
      id: "partial", source: "custom", file: "/tmp/2026-07-17-partial.jsonl",
      events: [{ timestamp: "2026-07-17T10:01:00Z", task: "Fix app", file_path: "src/app.js", command: "npm test", exit_code: 1, message: "Finished the change" }],
    },
    {
      id: "chat", source: "codex", file: "/tmp/2026-07-17-chat.jsonl",
      events: [{ timestamp: "2026-07-17T10:02:00Z", type: "event_msg", payload: { type: "user_message", message: "How are you?" } }],
    },
  ], { range: "today", now });

  assert.equal(recap.headline, "2 tasks need review.");
  assert.equal(recap.counts.sessions, 2);
  assert.equal(recap.counts.hidden, 1);
  assert.equal(recap.attention.sessionId, "failed");
});

test("counts files only from explicit patch operations", () => {
  const session = analyzeSession({
    id: "patch",
    source: "codex",
    file: "/tmp/2026-07-17/session.jsonl",
    events: [
      { timestamp: "2026-07-17T10:00:00Z", type: "event_msg", payload: { type: "user_message", message: "Update the parser" } },
      { timestamp: "2026-07-17T10:00:01Z", type: "response_item", payload: { type: "function_call", name: "apply_patch", call_id: "patch-1", arguments: "*** Begin Patch\n*** Update File: src/parser.js\n*** Add File: test/parser.test.js\n*** End Patch" } },
      { timestamp: "2026-07-17T10:00:02Z", type: "event_msg", payload: { type: "task_complete", last_agent_message: "Implemented the parser update." } },
    ],
  });
  const fileEvidence = session.evidence.find((item) => item.type === "files");
  assert.equal(session.status, "unverified");
  assert.deepEqual(fileEvidence.files, ["src/parser.js", "test/parser.test.js"]);
});

test("recognizes a Chinese completion claim but does not invent verification", () => {
  const session = analyzeSession({
    id: "zh-claim",
    source: "codex",
    file: "/tmp/2026-07-17/session.jsonl",
    events: [
      { timestamp: "2026-07-17T10:00:00Z", type: "event_msg", payload: { type: "user_message", message: "修复日志解析" } },
      { timestamp: "2026-07-17T10:00:01Z", type: "event_msg", payload: { type: "task_complete", last_agent_message: "已经完成日志解析修复。" } },
    ],
  });
  assert.equal(session.status, "unverified");
  assert.equal(session.claim, "Agent reported completion");
});

test("treats Test-Path plus an explicit remaining step as Partial, not Verified", () => {
  const events = [
    { timestamp: "2026-07-17T10:00:00Z", type: "event_msg", payload: { type: "user_message", message: "wifi densepose" } },
  ];
  for (let index = 0; index < 3; index += 1) {
    events.push(
      { timestamp: `2026-07-17T10:00:0${index + 1}Z`, type: "response_item", payload: { type: "function_call", name: "exec_command", call_id: `failed-${index}`, arguments: JSON.stringify({ cmd: "python install.py" }) } },
      { timestamp: `2026-07-17T10:00:1${index + 1}Z`, type: "response_item", payload: { type: "function_call_output", call_id: `failed-${index}`, output: JSON.stringify({ exit_code: 1, output: "Error" }) } },
    );
  }
  events.push(
    { timestamp: "2026-07-17T10:01:00Z", type: "response_item", payload: { type: "function_call", name: "exec_command", call_id: "probe", arguments: JSON.stringify({ cmd: "Test-Path 'C:/InvokeAI/python.exe'" }) } },
    { timestamp: "2026-07-17T10:01:01Z", type: "response_item", payload: { type: "function_call_output", call_id: "probe", output: JSON.stringify({ exit_code: 0, output: "True" }) } },
    { timestamp: "2026-07-17T10:01:02Z", type: "event_msg", payload: { type: "task_complete", last_agent_message: "现在还差一步，桌面入口还没完全收干净。请再运行修正脚本。" } },
  );

  const session = analyzeSession({ id: "densepose", source: "codex", file: "/tmp/2026-07-17/session.jsonl", events });
  assert.equal(session.status, "partial");
  assert.equal(session.evidence.some((item) => item.type === "verification"), false);
  assert.equal(session.evidence.some((item) => item.type === "agent-report"), true);
});

test("lets the latest explicit incomplete report override an earlier passing test", () => {
  const session = analyzeSession({
    id: "latest-incomplete",
    source: "codex",
    file: "/tmp/2026-07-17/session.jsonl",
    events: [
      { timestamp: "2026-07-17T10:00:00Z", type: "event_msg", payload: { type: "user_message", message: "Migrate InvokeAI" } },
      { timestamp: "2026-07-17T10:00:01Z", type: "response_item", payload: { type: "function_call", name: "exec_command", call_id: "test", arguments: JSON.stringify({ cmd: "npm test" }) } },
      { timestamp: "2026-07-17T10:00:02Z", type: "response_item", payload: { type: "function_call_output", call_id: "test", output: JSON.stringify({ exit_code: 0, output: "All tests passed" }) } },
      { timestamp: "2026-07-17T10:00:03Z", type: "event_msg", payload: { type: "task_complete", last_agent_message: "迁移已完成。" } },
      { timestamp: "2026-07-17T10:01:00Z", type: "event_msg", payload: { type: "task_complete", last_agent_message: "现在还差一步，桌面入口还没完全收干净。" } },
    ],
  });
  assert.equal(session.status, "partial");
});

test("keeps a Codex task Failed when every observed command failed", () => {
  const session = analyzeSession({
    id: "download",
    source: "codex",
    file: "/tmp/2026-07-17/session.jsonl",
    events: [
      { timestamp: "2026-07-17T10:00:00Z", type: "event_msg", payload: { type: "user_message", message: "下载agents.md" } },
      { timestamp: "2026-07-17T10:00:01Z", type: "response_item", payload: { type: "function_call", name: "exec_command", call_id: "download", arguments: JSON.stringify({ cmd: "curl example.invalid/agents.md" }) } },
      { timestamp: "2026-07-17T10:00:02Z", type: "response_item", payload: { type: "function_call_output", call_id: "download", output: JSON.stringify({ exit_code: 1, output: "Error: download failed" }) } },
      { timestamp: "2026-07-17T10:00:03Z", type: "event_msg", payload: { type: "task_complete", last_agent_message: "无法下载该文件。" } },
    ],
  });
  assert.equal(session.status, "failed");
});

test("does not trust a generic completion claim when the last test failed", () => {
  const session = analyzeSession({
    id: "partial",
    source: "custom",
    file: "/tmp/2026-07-17.jsonl",
    events: [
      { timestamp: "2026-07-17T10:00:00Z", task: "Fix checkout" },
      { timestamp: "2026-07-17T10:01:00Z", file_path: "src/checkout.js" },
      { timestamp: "2026-07-17T10:02:00Z", command: "npm test", exit_code: 1, error: "Test failed" },
      { timestamp: "2026-07-17T10:03:00Z", message: "Finished the checkout fix" },
    ],
  });
  assert.equal(session.status, "partial");
  assert.match(session.evidence[0].text, /failed/);
});

test("detects repeated failed generic work", () => {
  const session = analyzeSession({
    id: "retry",
    source: "custom",
    file: "/tmp/2026-07-17.jsonl",
    events: [
      { timestamp: "2026-07-17T10:00:00Z", task: "Run integration tests" },
      { command: "npm run test:integration", exit_code: 1, stderr: "Error connection refused 5432" },
      { command: "npm run test:integration", exit_code: 1, stderr: "Error connection refused 5432" },
      { command: "npm run test:integration", exit_code: 1, stderr: "Error connection refused 5432" },
    ],
  });
  assert.equal(session.retryCount, 2);
  assert.match(session.repeatedFailure, /error connection refused/);
});
