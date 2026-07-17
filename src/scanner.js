import os from "node:os";
import path from "node:path";
import { readFile, readdir, stat } from "node:fs/promises";

const DEFAULT_SOURCES = [
  { name: "codex", location: [".codex", "sessions"] },
  { name: "claude", location: [".claude", "projects"] },
];

const MAX_FILES = 5_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export async function scanSources(options = {}) {
  const candidates = options.paths?.length
    ? options.paths.map((location) => ({ name: detectSource(location), location }))
    : DEFAULT_SOURCES.map((source) => ({
        name: source.name,
        location: path.join(os.homedir(), ...source.location),
      }));

  const sessions = [];
  const warnings = [];

  for (const source of candidates) {
    const files = await collectFiles(source.location, warnings);
    for (const file of files) {
      try {
        const info = await stat(file);
        if (info.size > MAX_FILE_BYTES) {
          warnings.push(`Skipped oversized log: ${file}`);
          continue;
        }
        const events = await readEvents(file);
        if (events.length > 0) {
          sessions.push({
            id: path.basename(file),
            source: source.name,
            file,
            events,
          });
        }
      } catch (error) {
        warnings.push(`Could not read ${file}: ${error.message}`);
      }
    }
  }

  return { sessions, warnings };
}

async function collectFiles(location, warnings) {
  let info;
  try {
    info = await stat(location);
  } catch (error) {
    if (error.code !== "ENOENT") warnings.push(`Could not inspect ${location}: ${error.message}`);
    return [];
  }

  if (info.isFile()) return isLogFile(location) ? [location] : [];

  const files = [];
  const queue = [location];
  while (queue.length > 0 && files.length < MAX_FILES) {
    const current = queue.shift();
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      warnings.push(`Could not scan ${current}: ${error.message}`);
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(entryPath);
      else if (entry.isFile() && isLogFile(entryPath)) files.push(entryPath);
      if (files.length >= MAX_FILES) break;
    }
  }

  if (files.length >= MAX_FILES) warnings.push(`Stopped after ${MAX_FILES} log files`);
  return files;
}

async function readEvents(file) {
  const content = await readFile(file, "utf8");
  if (file.endsWith(".jsonl")) {
    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
  }

  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function isLogFile(file) {
  return file.endsWith(".jsonl") || file.endsWith(".json");
}

function detectSource(location) {
  const lower = location.toLowerCase();
  if (lower.includes("claude")) return "claude";
  if (lower.includes("codex")) return "codex";
  return "custom";
}
