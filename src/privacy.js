import os from "node:os";
import path from "node:path";
import { readFile, readdir, stat } from "node:fs/promises";

const MAX_FILES = 500;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const CONFIG_EXTENSIONS = new Set([".json", ".toml", ".yaml", ".yml"]);
const SECRET_KEY = /(api[_-]?key|access[_-]?token|auth[_-]?token|secret|password|credential)/i;
const TELEMETRY_KEY = /(telemetry|analytics|crash[_-]?report|sentry|diagnostic[_-]?data)/i;
const ENV_REFERENCE = /^(\$\{?[A-Z][A-Z0-9_]*\}?|%[A-Z][A-Z0-9_]*%|env:|process\.env\.)/i;

export async function createPrivacySnapshot(options = {}) {
  const candidates = options.demo
    ? [options.demoPath]
    : options.paths?.length
      ? options.paths
      : defaultConfigPaths();
  const files = await collectConfigFiles(candidates);
  const observations = [];
  const warnings = [];

  for (const file of files) {
    try {
      const info = await stat(file);
      if (info.size > MAX_FILE_BYTES) {
        warnings.push(`Skipped oversized configuration: ${file}`);
        continue;
      }
      const content = await readFile(file, "utf8");
      observations.push(analyzeConfig(file, content));
    } catch (error) {
      warnings.push(`Could not inspect ${file}: ${error.message}`);
    }
  }

  const endpoints = dedupe(observations.flatMap((item) => item.endpoints), (item) => `${item.host}|${item.source}`);
  const telemetry = observations.flatMap((item) => item.telemetry);
  const mcpServers = dedupe(observations.flatMap((item) => item.mcpServers), (item) => `${item.name}|${item.source}`);
  const secrets = observations.flatMap((item) => item.secrets);
  const findings = buildFindings({ endpoints, telemetry, secrets });

  return {
    generatedAt: new Date().toISOString(),
    headline: makeHeadline(files.length, findings),
    observed: {
      filesInspected: files.length,
      tools: [...new Set(observations.map((item) => item.tool))],
      endpoints,
      telemetry,
      mcpServers,
      secretReferences: secrets,
    },
    liveTraffic: {
      status: "unknown",
      explanation: "Live network traffic was not captured. Configuration evidence cannot prove what was actually transmitted.",
    },
    findings,
    next: chooseNext(findings, files.length),
    warnings,
  };
}

function analyzeConfig(file, content) {
  const source = redactHome(file);
  const result = {
    source,
    tool: detectTool(file),
    endpoints: extractEndpoints(content, source),
    telemetry: [],
    mcpServers: [],
    secrets: [],
  };

  if (path.extname(file).toLowerCase() === ".json") {
    try {
      inspectObject(JSON.parse(content), result, []);
      return normalizeObservation(result);
    } catch {
      // Continue with conservative line-based inspection.
    }
  }

  inspectText(content, result);
  return normalizeObservation(result);
}

function inspectObject(value, result, keyPath) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const currentPath = [...keyPath, key];
    const displayKey = currentPath.join(".");

    if (/^mcpServers$/i.test(key) && child && typeof child === "object") {
      for (const name of Object.keys(child)) result.mcpServers.push({ name, source: result.source, evidence: "exact" });
    }
    if (TELEMETRY_KEY.test(key)) {
      result.telemetry.push({ key: displayKey, status: booleanStatus(child), source: result.source, evidence: "exact" });
    }
    if (SECRET_KEY.test(key) && typeof child === "string" && child.trim()) {
      result.secrets.push({
        key: displayKey,
        storage: ENV_REFERENCE.test(child.trim()) ? "environment-reference" : "inline-value",
        source: result.source,
        evidence: "exact",
      });
    }
    if (typeof child === "string" && /^(https?|wss?):\/\//i.test(child)) {
      const endpoint = safeEndpoint(child, result.source);
      if (endpoint) result.endpoints.push(endpoint);
    }
    inspectObject(child, result, currentPath);
  }
}

function inspectText(content, result) {
  for (const line of content.split(/\r?\n/)) {
    const section = line.match(/^\s*\[\s*mcp_servers\.([^\]]+)\]/i);
    if (section) result.mcpServers.push({ name: section[1].replace(/["']/g, ""), source: result.source, evidence: "exact" });

    const assignment = line.match(/^\s*([A-Za-z0-9_.-]+)\s*[:=]\s*(.+?)\s*$/);
    if (!assignment) continue;
    const [, key, rawValue] = assignment;
    const value = rawValue.replace(/^['"]|['"],?$/g, "").trim();
    if (TELEMETRY_KEY.test(key)) result.telemetry.push({ key, status: booleanStatus(value), source: result.source, evidence: "exact" });
    if (SECRET_KEY.test(key) && value) {
      result.secrets.push({
        key,
        storage: ENV_REFERENCE.test(value) ? "environment-reference" : "inline-value",
        source: result.source,
        evidence: "exact",
      });
    }
  }
}

function extractEndpoints(content, source) {
  const matches = content.match(/(?:https?|wss?):\/\/[^\s"'<>)}\]]+/gi) ?? [];
  return matches.map((url) => safeEndpoint(url.replace(/[,;]$/, ""), source)).filter(Boolean);
}

function safeEndpoint(value, source) {
  try {
    const url = new URL(value);
    return {
      host: url.hostname,
      protocol: url.protocol.replace(":", ""),
      local: ["localhost", "127.0.0.1", "::1"].includes(url.hostname),
      embeddedCredentials: Boolean(url.username || url.password),
      source,
      evidence: "exact",
    };
  } catch {
    return null;
  }
}

function normalizeObservation(result) {
  result.endpoints = dedupe(result.endpoints, (item) => `${item.host}|${item.source}`);
  result.telemetry = dedupe(result.telemetry, (item) => `${item.key}|${item.source}`);
  result.mcpServers = dedupe(result.mcpServers, (item) => `${item.name}|${item.source}`);
  result.secrets = dedupe(result.secrets, (item) => `${item.key}|${item.source}`);
  return result;
}

function buildFindings({ endpoints, telemetry, secrets }) {
  const findings = [];
  for (const secret of secrets.filter((item) => item.storage === "inline-value")) {
    findings.push({ severity: "high", text: `Inline secret-like value under “${secret.key}”`, source: secret.source });
  }
  for (const item of telemetry.filter((entry) => entry.status === "enabled")) {
    findings.push({ severity: "review", text: `Telemetry-like setting “${item.key}” is enabled`, source: item.source });
  }
  for (const endpoint of endpoints.filter((item) => item.embeddedCredentials)) {
    findings.push({ severity: "high", text: `Endpoint contains embedded credentials for ${endpoint.host}`, source: endpoint.source });
  }
  const external = endpoints.filter((item) => !item.local);
  if (external.length > 0) findings.push({ severity: "info", text: `${external.length} external endpoint${external.length === 1 ? "" : "s"} found in configuration`, source: null });
  return findings;
}

function chooseNext(findings, filesInspected) {
  const high = findings.find((item) => item.severity === "high");
  if (high) return `Review ${high.source}: ${high.text}.`;
  const review = findings.find((item) => item.severity === "review");
  if (review) return `Review ${review.source}: ${review.text}.`;
  if (filesInspected === 0) return "No supported AI configuration was found. Pass a path with --path to inspect one.";
  return "No obvious configuration risk needs your attention. Live traffic remains unknown.";
}

function makeHeadline(filesInspected, findings) {
  if (filesInspected === 0) return "No supported AI configuration found.";
  if (findings.some((item) => item.severity === "high")) return "Check one privacy risk found in local AI configuration.";
  if (findings.some((item) => item.severity === "review")) return "Review one data-collection setting.";
  return "No obvious configuration risk found.";
}

async function collectConfigFiles(candidates) {
  const files = [];
  const queue = [...new Set(candidates.filter(Boolean).map((item) => path.resolve(item)))];
  while (queue.length > 0 && files.length < MAX_FILES) {
    const current = queue.shift();
    let info;
    try {
      info = await stat(current);
    } catch {
      continue;
    }
    if (info.isFile()) {
      if (isConfigFile(current)) files.push(current);
      continue;
    }
    if (!info.isDirectory()) continue;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (["node_modules", ".git", "sessions", "projects"].includes(entry.name)) continue;
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(entryPath);
      else if (entry.isFile() && isConfigFile(entryPath)) files.push(entryPath);
      if (files.length >= MAX_FILES) break;
    }
  }
  return [...new Set(files)];
}

function defaultConfigPaths() {
  return [
    path.join(os.homedir(), ".codex", "config.toml"),
    path.join(os.homedir(), ".claude", "settings.json"),
    path.join(os.homedir(), ".claude.json"),
    path.resolve(".mcp.json"),
  ];
}

function isConfigFile(file) {
  return CONFIG_EXTENSIONS.has(path.extname(file).toLowerCase()) && !file.endsWith("package-lock.json");
}

function detectTool(file) {
  const lower = file.toLowerCase();
  if (lower.includes("codex")) return "codex";
  if (lower.includes("claude")) return "claude";
  if (lower.includes("mcp")) return "mcp";
  return "custom";
}

function booleanStatus(value) {
  if (value === true || /^(true|on|yes|enabled|1)$/i.test(String(value))) return "enabled";
  if (value === false || /^(false|off|no|disabled|0)$/i.test(String(value))) return "disabled";
  return "configured";
}

function redactHome(file) {
  if (file.includes(`${path.sep}examples${path.sep}privacy${path.sep}`)) return `examples/privacy/${path.basename(file)}`;
  const home = os.homedir();
  return file.startsWith(home) ? `~${file.slice(home.length)}` : file;
}

function dedupe(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const id = key(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
