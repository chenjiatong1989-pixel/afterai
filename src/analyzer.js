const SUCCESS_WORDS = /\b(completed?|finished|fixed|implemented|resolved|done|passed)\b/i;
const FAILURE_WORDS = /\b(error|failed|failure|exception|timeout|timed out|permission denied|rate limit)\b/i;
const TEST_WORDS = /\b(test|tests|pytest|jest|vitest|mocha|build|lint|typecheck|tsc)\b/i;
const TEST_WORDS_ZH = /测试|构建|代码检查|类型检查/;
const SUCCESS_WORDS_ZH = /(?:已经|已)(?:完成|修复|实现|解决)|(?:测试|构建|检查)(?:已经|已)?通过|(?:修复|实现|更新)完成/;
const FAILURE_WORDS_ZH = /错误|失败|异常|超时|权限被拒绝|速率限制/;
const INCOMPLETE_WORDS = /\b(?:not finished|not complete|remaining work|one more step|needs? another step)\b/i;
const INCOMPLETE_WORDS_ZH = /还差(?:一|1)步|还没(?:有)?完全|尚未完成|未完成|没有完成|需要你再|请再运行|仍需(?:要)?/;

export function analyzeSessions(sessions, options = {}) {
  const window = dateWindow(options.range ?? "today", options.now ?? new Date());
  const allSessions = sessions
    .map(analyzeSession)
    .filter((session) => session.timestamp && (options.includeAll || inWindow(session.timestamp, window)))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const hiddenSessions = allSessions.filter(isInconclusiveChat);
  const analyzed = allSessions.filter((session) => !isInconclusiveChat(session));

  const counts = countStatuses(analyzed);
  const usage = sumUsage(allSessions);
  const retries = analyzed.reduce((sum, session) => sum + session.retryCount, 0);
  const attention = chooseAttention(analyzed);

  return {
    generatedAt: new Date(options.now ?? Date.now()).toISOString(),
    range: options.range ?? "today",
    headline: makeHeadline(analyzed, counts, attention),
    counts: {
      sessions: analyzed.length,
      scanned: allSessions.length,
      hidden: hiddenSessions.length,
      verified: counts.verified ?? 0,
      unverified: counts.unverified ?? 0,
      partial: counts.partial ?? 0,
      failed: counts.failed ?? 0,
      unknown: counts.unknown ?? 0,
      retries,
    },
    usage,
    pricingModels: [...new Set(allSessions.flatMap((session) => session.models))],
    attention,
    sessions: analyzed,
    warnings: options.sourceWarnings ?? [],
  };
}

export function analyzeSession(session) {
  if (isCodexEventStream(session.events)) return analyzeCodexSession(session);

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
  const claim = hasCompletionClaim(text);
  const failure = hasFailure(exitCodes, text);
  const status = determineStatus({ claim, failure, verification, changedFiles });

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

function isCodexEventStream(events) {
  return events.some((event) =>
    ["session_meta", "turn_context", "world_state", "event_msg", "response_item"].includes(event?.type)
  );
}

function analyzeCodexSession(session) {
  const calls = collectCodexCalls(session.events);
  const commandRuns = calls.map((call) => ({
    ...call,
    command: commandFromCall(call),
    exitCode: exitCodeFromValue(call.output),
  })).filter((call) => call.command);
  const commands = commandRuns.map((call) => call.command);
  const exitCodes = commandRuns.map((call) => call.exitCode).filter(Number.isInteger);
  const outputText = calls.map((call) => stringValue(call.output)).filter(Boolean).join("\n");
  const finalMessages = session.events
    .filter((event) => event?.type === "event_msg" && event.payload?.type === "task_complete")
    .map((event) => event.payload?.last_agent_message)
    .filter((value) => typeof value === "string");
  const claimText = finalMessages.at(-1) ?? "";
  const changedFiles = findCodexChangedFiles(calls);
  const verification = findCodexVerification(commandRuns);
  const claim = hasCompletionClaim(claimText);
  const incomplete = hasIncompleteClaim(claimText);
  const explicitAbort = session.events.some((event) =>
    event?.type === "event_msg" && event.payload?.type === "turn_aborted" &&
    !/user|cancel/i.test(String(event.payload?.reason ?? ""))
  );
  const failedRuns = commandRuns.filter((run) =>
    (Number.isInteger(run.exitCode) && run.exitCode !== 0) || hasFailureText(stringValue(run.output))
  );
  const successfulRuns = commandRuns.filter((run) => run.exitCode === 0);
  const failure = verification.failed || explicitAbort || (!claim && !incomplete && failedRuns.length > 0 && successfulRuns.length === 0);
  const retryInfo = findCodexRetries(commandRuns);
  const progress = changedFiles.length > 0 || successfulRuns.length > 0 || calls.length > 0;
  const status = determineStatus({ claim, incomplete, progress, failure, verification, changedFiles });

  return {
    id: session.id,
    source: session.source,
    timestamp: findCodexTimestamp(session.events, session.file),
    title: findCodexTitle(session.events),
    status,
    claim: claim ? "Agent reported completion" : "No clear completion claim",
    evidence: buildEvidence({ verification, changedFiles, exitCodes, incomplete }),
    models: findCodexModels(session.events),
    usage: extractCodexUsage(session.events),
    retryCount: retryInfo.count,
    repeatedFailure: retryInfo.repeatedFailure,
    file: session.file,
  };
}

function collectCodexCalls(events) {
  const outputs = new Map();
  for (const event of events) {
    const payload = event?.payload;
    if (event?.type === "response_item" && payload?.type === "function_call_output") {
      outputs.set(payload.call_id, payload.output);
    } else if (event?.type === "event_msg" && payload?.type === "mcp_tool_call_end") {
      outputs.set(payload.call_id, payload.result);
    }
  }

  return events.flatMap((event) => {
    const payload = event?.payload;
    if (event?.type !== "response_item" || !["function_call", "tool_search_call", "web_search_call"].includes(payload?.type)) return [];
    return [{
      id: payload.call_id ?? payload.id,
      name: payload.name ?? payload.type,
      arguments: parseArguments(payload.arguments),
      rawArguments: typeof payload.arguments === "string" ? payload.arguments : JSON.stringify(payload.arguments ?? {}),
      output: outputs.get(payload.call_id ?? payload.id),
    }];
  });
}

function parseArguments(value) {
  if (!value || typeof value === "object") return value ?? {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : { value };
  } catch {
    return { value };
  }
}

function commandFromCall(call) {
  const candidates = [
    call.arguments?.cmd,
    call.arguments?.command,
    call.arguments?.shell_command,
    call.arguments?.script,
  ];
  const direct = candidates.find((value) => typeof value === "string" && value.trim());
  if (direct) return direct;
  if (/exec|command|shell/i.test(call.name) && typeof call.arguments?.value === "string") return call.arguments.value;
  return null;
}

function exitCodeFromValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    for (const key of ["exit_code", "exitCode", "returncode"]) {
      if (Number.isFinite(Number(value[key]))) return Number(value[key]);
    }
    for (const child of Object.values(value)) {
      const nested = exitCodeFromValue(child);
      if (Number.isInteger(nested)) return nested;
    }
    return null;
  }
  const text = String(value);
  try {
    const parsed = JSON.parse(text);
    const nested = exitCodeFromValue(parsed);
    if (Number.isInteger(nested)) return nested;
  } catch {
    // Tool output is often plain text.
  }
  const match = text.match(/(?:exit[_ ]?code|exited with (?:the )?code|returncode)["':=\s]+(-?\d+)/i);
  return match ? Number(match[1]) : null;
}

function findCodexVerification(runs) {
  const verificationRuns = runs.filter((run) => isVerificationCommand(run.command));
  const last = verificationRuns.at(-1);
  if (!last) return { passed: false, failed: false, command: null };
  if (last.exitCode === 0) return { passed: true, failed: false, command: shorten(last.command, 72) };
  if (Number.isInteger(last.exitCode) && last.exitCode !== 0) {
    return { passed: false, failed: true, command: shorten(last.command, 72) };
  }
  return { passed: false, failed: false, command: shorten(last.command, 72) };
}

function findCodexChangedFiles(calls) {
  const files = new Set();
  for (const call of calls) {
    const raw = `${call.rawArguments ?? ""}\n${stringValue(call.arguments)}`;
    for (const match of raw.matchAll(/\*\*\* (?:Add|Update|Delete) File:\s*([^\r\n*]+)/g)) {
      const file = match[1].replace(/\\[nr].*$/, "").trim();
      if (file) files.add(file);
    }
    if (/create_file|update_file|delete_file/i.test(call.name)) {
      const file = call.arguments?.path;
      if (typeof file === "string" && file.trim()) files.add(file.trim());
    }
  }
  return [...files].slice(0, 50);
}

function findCodexRetries(runs) {
  const failed = runs.filter((run) =>
    (Number.isInteger(run.exitCode) && run.exitCode !== 0) || hasFailureText(stringValue(run.output))
  );
  const normalized = failed.map((run) => normalizeError(run.command)).filter((value) => value.length >= 8);
  return {
    count: largestDuplicateCount(normalized),
    repeatedFailure: firstRepeatedValue(normalized),
  };
}

function findCodexTitle(events) {
  const messages = events
    .filter((event) => event?.type === "event_msg" && event.payload?.type === "user_message")
    .map((event) => event.payload?.message)
    .filter((value) => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length >= 2 && !/^(?:<environment_context>|===== BEGIN ADDITIONAL MESSAGE)/i.test(value));
  return shorten(messages[0] ?? "Untitled Codex session", 78);
}

function findCodexTimestamp(events, file) {
  const candidates = events
    .flatMap((event) => [event?.timestamp, event?.type === "session_meta" ? event.payload?.timestamp : null])
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()));
  if (candidates.length > 0) return new Date(Math.max(...candidates.map((date) => date.getTime()))).toISOString();
  const match = file.match(/(20\d{2})[-_/](\d{2})[-_/](\d{2})/);
  return match ? new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`).toISOString() : null;
}

function findCodexModels(events) {
  const models = [];
  for (const event of events) {
    if (!["session_meta", "event_msg"].includes(event?.type)) continue;
    collectNamedStrings(event.payload, "model", models);
  }
  return [...new Set(models)];
}

function extractCodexUsage(events) {
  const snapshots = events
    .filter((event) => event?.type === "event_msg" && event.payload?.type === "token_count")
    .map((event) => event.payload?.info?.total_token_usage ?? event.payload?.info?.totalTokenUsage ?? event.payload?.info)
    .filter((value) => value && typeof value === "object")
    .map(normalizeUsage)
    .filter((value) => value.totalTokens > 0 || value.inputTokens > 0 || value.outputTokens > 0);
  if (snapshots.length === 0) return emptyUsage();
  return snapshots.reduce((largest, usage) => usage.totalTokens >= largest.totalTokens ? usage : largest);
}

function normalizeUsage(usage) {
  const inputTokens = numberAt(usage, ["input_tokens", "inputTokens", "prompt_tokens", "promptTokens"]);
  const outputTokens = numberAt(usage, ["output_tokens", "outputTokens", "completion_tokens", "completionTokens"]);
  const cacheTokens = numberAt(usage, ["cache_read_input_tokens", "cached_input_tokens", "cacheTokens"]);
  const statedTotal = numberAt(usage, ["total_tokens", "totalTokens"]);
  return {
    inputTokens,
    outputTokens,
    cacheTokens,
    totalTokens: statedTotal || inputTokens + outputTokens,
    source: "exact",
  };
}

function emptyUsage() {
  return { inputTokens: 0, outputTokens: 0, cacheTokens: 0, totalTokens: 0, source: "unknown" };
}

function collectNamedStrings(value, keyName, output) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key === keyName && typeof child === "string") output.push(child);
    else collectNamedStrings(child, keyName, output);
  }
}

function stringValue(value) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try { return JSON.stringify(value); } catch { return String(value); }
}

function determineStatus({ claim, incomplete = false, progress = false, failure, verification, changedFiles }) {
  if (incomplete && progress) return "partial";
  if (verification.passed) return "verified";
  if (verification.failed && (changedFiles.length > 0 || claim)) return "partial";
  if (failure && !claim) return "failed";
  if (claim || changedFiles.length > 0) return "unverified";
  return "unknown";
}

function buildEvidence({ verification, changedFiles, exitCodes, incomplete = false }) {
  const evidence = [];
  if (verification.passed) evidence.push({ type: "verification", exact: true, text: `${verification.command} passed` });
  if (verification.failed) evidence.push({ type: "verification", exact: true, text: `${verification.command} failed` });
  if (changedFiles.length > 0) evidence.push({ type: "files", exact: true, text: `${changedFiles.length} changed file${changedFiles.length === 1 ? "" : "s"}`, files: changedFiles });
  const nonZero = exitCodes.filter((code) => code !== 0);
  if (nonZero.length > 0) {
    const prefix = verification.passed ? "earlier " : "";
    evidence.push({ type: "exit-code", exact: true, text: `${nonZero.length} ${prefix}non-zero command exit${nonZero.length === 1 ? "" : "s"}` });
  }
  if (incomplete) evidence.push({ type: "agent-report", exact: false, text: "Agent reported that work remains" });
  return evidence;
}

function findVerification(commands, exitCodes, text) {
  let last = null;
  for (let index = 0; index < commands.length; index += 1) {
    if (isVerificationCommand(commands[index])) last = { command: shorten(commands[index], 72), code: exitCodes[index] };
  }
  if (last && last.code === 0) return { passed: true, failed: false, command: last.command };
  if (last && Number.isInteger(last.code) && last.code !== 0) return { passed: false, failed: true, command: last.command };
  const passing = /\b(all tests passed|tests? passed|build succeeded|lint passed|typecheck passed)\b/i.test(text);
  const failing = /\b(tests? failed|build failed|lint failed|typecheck failed)\b/i.test(text);
  return { passed: passing && !failing, failed: failing, command: "Recorded verification" };
}

function hasFailure(exitCodes, text) {
  return exitCodes.some((code) => code !== 0) || hasFailureText(text);
}

function hasCompletionClaim(text) {
  const value = String(text ?? "");
  return SUCCESS_WORDS.test(value) || SUCCESS_WORDS_ZH.test(value);
}

function hasFailureText(text) {
  const value = String(text ?? "");
  return FAILURE_WORDS.test(value) || FAILURE_WORDS_ZH.test(value);
}

function hasIncompleteClaim(text) {
  const value = String(text ?? "");
  return INCOMPLETE_WORDS.test(value) || INCOMPLETE_WORDS_ZH.test(value);
}

function isVerificationCommand(command) {
  const value = String(command ?? "");
  if (/\bTest-Path\b/i.test(value)) return false;
  return TEST_WORDS.test(value) || TEST_WORDS_ZH.test(value);
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
  const snapshots = [];
  for (const event of events) collectUsage(event, snapshots);
  if (snapshots.length === 0) return emptyUsage();
  const totals = emptyUsage();
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
  return flattened.filter((item) => typeof item.value === "string" && commandKeys.test(item.path)).map((item) => item.value);
}

function findExitCodes(flattened) {
  const codeKeys = /(^|\.)(exit_code|exitCode|status_code|returncode)$/i;
  return flattened.filter((item) => codeKeys.test(item.path) && Number.isFinite(Number(item.value))).map((item) => Number(item.value));
}

function findModels(flattened) {
  return [...new Set(flattened.filter((item) => /(^|\.)model$/i.test(item.path) && typeof item.value === "string").map((item) => item.value))];
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
  if (sessions.length === 0) return "No actionable AI work found for this period.";
  const needReview = (counts.failed ?? 0) + (counts.partial ?? 0);
  if (needReview > 0) return `${needReview} task${needReview === 1 ? "" : "s"} need review.`;
  const unverified = counts.unverified ?? 0;
  if (unverified > 0) return `${unverified} task${unverified === 1 ? " has" : "s have"} no verification evidence.`;
  const proven = counts.verified ?? 0;
  if (proven === 0) return `No verified completion found in ${sessions.length} session${sessions.length === 1 ? "" : "s"}.`;
  if (proven === sessions.length) return `All ${sessions.length} session${sessions.length === 1 ? "" : "s"} have verification evidence.`;
  return `${proven} of ${sessions.length} sessions have verification evidence.`;
}

function isInconclusiveChat(session) {
  return ["codex", "claude"].includes(session.source) &&
    session.status === "unknown" &&
    session.evidence.length === 0 &&
    session.retryCount === 0;
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
