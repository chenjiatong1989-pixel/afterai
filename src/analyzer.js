const SUCCESS_WORDS = /\b(completed?|finished|fixed|implemented|resolved|done|passed)\b/i;
const FAILURE_WORDS = /\b(error|failed|failure|exception|timeout|timed out|permission denied|rate limit)\b/i;
const TEST_WORDS = /\b(test|tests|pytest|jest|vitest|mocha|build|lint|typecheck|tsc)\b/i;

export function analyzeSessions(sessions, options = {}) {
  const window = dateWindow(options.range ?? "today", options.now ?? new Date());
  const analyzed = sessions
    .map(analyzeSession)
    .filter((session) => session.timestamp && (options.includeAll || inWindow(session.timestamp, window)))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const counts = countStatuses(analyzed);
  const usage = sumUsage(analyzed);
  const retries = analyzed.reduce((sum, session) => sum + session.retryCount, 0);
  const attention = chooseAttention(analyzed);

  return {
    generatedAt: new Date(options.now ?? Date.now()).toISOString(),
    range: options.range ?? "today",
    headline: makeHeadline(analyzed, counts, attention),
    counts: {
      sessions: analyzed.length,
      verified: counts.verified ?? 0,
      unverified: counts.unverified ?? 0,
      partial: counts.partial ?? 0,
      failed: counts.failed ?? 0,
      unknown: counts.unknown ?? 0,
      retries,
    },
    usage,
    attention,
    sessions: analyzed,
    warnings: options.sourceWarnings ?? [],
  };
}

export function analyzeSession(session) {
  const flattened = session.events.flatMap((event) => flatten(event));
  const strings = flattened.filter((item) => typeof item.value === "string");
  const text = strings.map((item) => item.value).join("\n");
  const timestamp = findTimestamp(session.events, session.file);
  const commands = findCommands(flattened);
  const exitCodes = findExitCodes(flattened);
  const usage = extractUsage(session.events);
  const models = findModels(flattened);
  const changedFiles = findChangedFiles(flattened);
  const retryInfo = findRetries(strings, commands);
  const verification = findVerification(commands, exitCodes, text);
  const claim = SUCCESS_WORDS.test(text);
  const failure = hasFailure(exitCodes, text);
  const status = determineStatus({ claim, failure, verification, changedFiles, text });

  return {
    id: session.id,
    source: session.source,
    timestamp,
    title: findTitle(session.events, text),
    status,
    claim: claim ? "Agent reported completion" : "No clear completion claim",
    evidence: buildEvidence({ verification, changedFiles, exitCodes }),
    models,
    usage,
    retryCount: retryInfo.count,
    repeatedFailure: retryInfo.repeatedFailure,
    file: session.file,
  };
}

function determineStatus({ claim, failure, verification, changedFiles, text }) {
  if (verification.passed) return "verified";
  if (verification.failed && (changedFiles.length > 0 || claim)) return "partial";
  if (failure && !claim) return "failed";
  if (claim && (changedFiles.length > 0 || text.length > 0)) return "unverified";
  if (changedFiles.length > 0) return "unverified";
  return "unknown";
}

function buildEvidence({ verification, changedFiles, exitCodes }) {
  const evidence = [];
  if (verification.passed) evidence.push({ type: "verification", exact: true, text: `${verification.command} passed` });
  if (verification.failed) evidence.push({ type: "verification", exact: true, text: `${verification.command} failed` });
  if (changedFiles.length > 0) evidence.push({ type: "files", exact: true, text: `${changedFiles.length} changed file${changedFiles.length === 1 ? "" : "s"}`, files: changedFiles });
  const nonZero = exitCodes.filter((code) => code !== 0);
  if (nonZero.length > 0) evidence.push({ type: "exit-code", exact: true, text: `${nonZero.length} non-zero command exit${nonZero.length === 1 ? "" : "s"}` });
  return evidence;
}

function findVerification(commands, exitCodes, text) {
  let last = null;
  for (let index = 0; index < commands.length; index += 1) {
    if (TEST_WORDS.test(commands[index])) {
      last = { command: shorten(commands[index], 72), code: exitCodes[index] };
    }
  }
  if (last && last.code === 0) return { passed: true, failed: false, command: last.command };
  if (last && Number.isInteger(last.code) && last.code !== 0) return { passed: false, failed: true, command: last.command };

  const passing = /\b(all tests passed|tests? passed|build succeeded|lint passed|typecheck passed)\b/i.test(text);
  const failing = /\b(tests? failed|build failed|lint failed|typecheck failed)\b/i.test(text);
  return {
    passed: passing && !failing,
    failed: failing,
    command: "Recorded verification",
  };
}

function hasFailure(exitCodes, text) {
  return exitCodes.some((code) => code !== 0) || FAILURE_WORDS.test(text);
}

function findRetries(strings, commands) {
  const normalizedCommands = commands.map(normalizeError).filter((value) => value.length >= 8);
  const normalizedErrors = strings
    .filter((item) => /error|output|stderr|result/i.test(item.path))
    .map((item) => normalizeError(item.value))
    .filter((value) => value.length >= 8 && FAILURE_WORDS.test(value));

  const commandRetries = largestDuplicateCount(normalizedCommands);
  const errorRepeats = largestDuplicateCount(normalizedErrors);
  const repeatedFailure = firstRepeatedValue(normalizedErrors);
  return { count: Math.max(commandRetries, errorRepeats), repeatedFailure: repeatedFailure ? shorten(repeatedFailure, 100) : null };
}

function largestDuplicateCount(values) {
  const counts = new Map();
  let largest = 0;
  for (const value of values) {
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    largest = Math.max(largest, count - 1);
  }
  return largest;
}

function firstRepeatedValue(values) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

function extractUsage(events) {
  const totals = { inputTokens: 0, outputTokens: 0, cacheTokens: 0, totalTokens: 0, source: "unknown" };
  const snapshots = [];
  for (const event of events) collectUsage(event, snapshots);
  if (snapshots.length === 0) return totals;

  for (const usage of snapshots) {
    totals.inputTokens += numberAt(usage, ["input_tokens", "inputTokens", "prompt_tokens", "promptTokens"]);
    totals.outputTokens += numberAt(usage, ["output_tokens", "outputTokens", "completion_tokens", "completionTokens"]);
    totals.cacheTokens += numberAt(usage, ["cache_read_input_tokens", "cached_input_tokens", "cacheTokens"]);
    totals.totalTokens += numberAt(usage, ["total_tokens", "totalTokens"]);
  }
  if (totals.totalTokens === 0) totals.totalTokens = totals.inputTokens + totals.outputTokens;
  totals.source = "exact";
  return totals;
}

function collectUsage(value, snapshots) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (/^(usage|token_usage|tokenUsage)$/i.test(key) && child && typeof child === "object") snapshots.push(child);
    else collectUsage(child, snapshots);
  }
}

function findCommands(flattened) {
  const commandKeys = /(^|\.)(command|cmd|shell_command|script|input\.command)$/i;
  return flattened
    .filter((item) => typeof item.value === "string" && commandKeys.test(item.path))
    .map((item) => item.value);
}

function findExitCodes(flattened) {
  const codeKeys = /(^|\.)(exit_code|exitCode|status_code|returncode)$/i;
  return flattened
    .filter((item) => codeKeys.test(item.path) && Number.isFinite(Number(item.value)))
    .map((item) => Number(item.value));
}

function findModels(flattened) {
  return [...new Set(flattened
    .filter((item) => /(^|\.)model$/i.test(item.path) && typeof item.value === "string")
    .map((item) => item.value))];
}

function findChangedFiles(flattened) {
  const files = flattened
    .filter((item) => typeof item.value === "string" && /(^|\.)(file|file_path|path|changed_files\.\d+)$/i.test(item.path))
    .map((item) => item.value)
    .filter((value) => /[\\/]|\.[a-z0-9]{1,8}$/i.test(value) && !value.includes("sessions/"));
  return [...new Set(files)].slice(0, 50);
}

function findTimestamp(events, file) {
  const flattened = events.flatMap((event) => flatten(event));
  const candidates = flattened
    .filter((item) => /(^|\.)(timestamp|created_at|createdAt|time)$/i.test(item.path))
    .map((item) => new Date(item.value))
    .filter((date) => !Number.isNaN(date.getTime()));
  if (candidates.length > 0) return new Date(Math.max(...candidates.map((date) => date.getTime()))).toISOString();

  const match = file.match(/(20\d{2})[-_/](\d{2})[-_/](\d{2})/);
  return match ? new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`).toISOString() : null;
}

function findTitle(events, text) {
  const flattened = events.flatMap((event) => flatten(event));
  const candidate = flattened.find((item) =>
    typeof item.value === "string" &&
    /(^|\.)(task|title|prompt|user_message|message\.content)$/i.test(item.path) &&
    item.value.trim().length >= 4
  );
  return shorten(candidate?.value ?? text.split("\n").find(Boolean) ?? "Untitled AI session", 78);
}

function sumUsage(sessions) {
  const usage = sessions.reduce((total, session) => ({
    inputTokens: total.inputTokens + session.usage.inputTokens,
    outputTokens: total.outputTokens + session.usage.outputTokens,
    cacheTokens: total.cacheTokens + session.usage.cacheTokens,
    totalTokens: total.totalTokens + session.usage.totalTokens,
  }), { inputTokens: 0, outputTokens: 0, cacheTokens: 0, totalTokens: 0 });
  return { ...usage, source: usage.totalTokens > 0 ? "exact" : "unknown", estimatedCostUsd: null };
}

function chooseAttention(sessions) {
  const failed = sessions.find((session) => session.status === "failed");
  if (failed) return { level: "high", text: `Review “${failed.title}” — it failed and has no verified result.`, sessionId: failed.id };
  const partial = sessions.find((session) => session.status === "partial");
  if (partial) return { level: "high", text: `Review “${partial.title}” — its last verification failed.`, sessionId: partial.id };
  const unverified = sessions.find((session) => session.status === "unverified");
  if (unverified) return { level: "medium", text: `Verify “${unverified.title}” — completion was not proven.`, sessionId: unverified.id };
  const retry = sessions.find((session) => session.retryCount >= 2);
  if (retry) return { level: "medium", text: `Check repeated work in “${retry.title}”.`, sessionId: retry.id };
  return { level: "none", text: "Nothing needs your attention.", sessionId: null };
}

function makeHeadline(sessions, counts, attention) {
  if (sessions.length === 0) return "No AI work found for this period.";
  if (attention.level === "high") return "Check one task — the evidence disagrees with the result.";
  const proven = counts.verified ?? 0;
  return `Good ${sessions.length === 1 ? "session" : "day"} — ${proven} of ${sessions.length} sessions have verification evidence.`;
}

function countStatuses(sessions) {
  return sessions.reduce((counts, session) => {
    counts[session.status] = (counts[session.status] ?? 0) + 1;
    return counts;
  }, {});
}

function dateWindow(range, nowValue) {
  const now = new Date(nowValue);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  if (range === "yesterday") {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
  } else if (range === "week") {
    start.setDate(start.getDate() - 6);
  }
  return { start, end };
}

function inWindow(timestamp, window) {
  const time = new Date(timestamp);
  return time >= window.start && time < window.end;
}

function flatten(value, prefix = "") {
  if (value === null || value === undefined) return [{ path: prefix, value }];
  if (typeof value !== "object") return [{ path: prefix, value }];
  return Object.entries(value).flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key));
}

function numberAt(object, keys) {
  for (const key of keys) {
    const value = Number(object[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function normalizeError(value) {
  return String(value).toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim().slice(0, 240);
}

function shorten(value, max) {
  const clean = String(value).replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
