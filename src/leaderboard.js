import os from "node:os";
import path from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { formatMoneyRange } from "./value.js";

export const LEADERBOARD_API = "https://afterai-burn-rank.chenjiatong1989.chatgpt.site/api/leaderboard";

export async function getLeaderboard(options = {}) {
  const identity = await loadIdentity(options);
  const endpoint = options.endpoint ?? process.env.AFTERAI_RANK_API ?? LEADERBOARD_API;
  const url = new URL(endpoint);
  if (identity?.participantId) url.searchParams.set("participantId", identity.participantId);
  return requestJson(url, { method: "GET" }, options.fetcher);
}

export async function syncLeaderboard(recap, options = {}) {
  if (recap?.value?.status !== "estimated" || !recap.value.usd) {
    throw new Error("Token value is Unknown, so this week cannot be ranked honestly");
  }
  const identity = await ensureIdentity(options);
  if (options.name) {
    identity.displayName = normalizeName(options.name);
    await saveIdentity(identity, options);
  }
  const verifiedTokens = recap.sessions
    .filter((session) => session.status === "verified")
    .reduce((sum, session) => sum + Number(session.usage?.totalTokens ?? 0), 0);
  const endpoint = options.endpoint ?? process.env.AFTERAI_RANK_API ?? LEADERBOARD_API;
  const board = await requestJson(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      participantId: identity.participantId,
      secret: identity.secret,
      displayName: identity.displayName,
      tokenCount: recap.usage.totalTokens,
      verifiedTokens,
      usdLow: recap.value.usd.low,
      usdHigh: recap.value.usd.high,
    }),
  }, options.fetcher);
  return { board, identity, recap, uploaded: ["anonymous ID and device proof", "nickname", "token totals", "estimated USD range", "week"] };
}

export async function leaveLeaderboard(options = {}) {
  const identity = await loadIdentity(options);
  if (!identity) return { deleted: false, reason: "This device has not joined the leaderboard." };
  const endpoint = options.endpoint ?? process.env.AFTERAI_RANK_API ?? LEADERBOARD_API;
  await requestJson(endpoint, {
    method: "DELETE", headers: { "content-type": "application/json" },
    body: JSON.stringify({ participantId: identity.participantId, secret: identity.secret }),
  }, options.fetcher);
  await rm(options.identityPath ?? defaultIdentityPath(), { force: true });
  return { deleted: true };
}

export function renderLeaderboard(result, options = {}) {
  const board = result.board ?? result;
  const lines = ["", "AFTER AI · BURN RANK", "─".repeat(54)];
  if (result.recap) {
    lines.push(
      `🔥 ${formatTokens(result.recap.usage.totalTokens)} tokens this week`,
      `API equivalent  ${formatMoneyRange(result.recap.value.usd, "USD", "en-US")}`,
    );
    if (result.recap.value.localCurrency !== "USD") lines.push(`Local equivalent  ${formatMoneyRange(result.recap.value.local, result.recap.value.localCurrency)}`);
    lines.push("");
  } else if (board.you) {
    const usd = { low: board.you.usdLow, high: board.you.usdHigh };
    lines.push(`🔥 ${formatTokens(board.you.tokenCount)} tokens this week`, `API equivalent  ${formatMoneyRange(usd, "USD", "en-US")}`);
    const currency = options.currency ?? "USD";
    const rate = currency === "USD" ? 1 : Number(options.rates?.rates?.[currency]);
    if (currency !== "USD" && Number.isFinite(rate) && rate > 0) {
      lines.push(`Local equivalent  ${formatMoneyRange({ low: usd.low * rate, high: usd.high * rate }, currency)}`);
    }
    lines.push("");
  }
  if (board.rank) {
    const standing = board.totalParticipants === 1
      ? "first burner this week"
      : `ahead of ${Math.round(((board.totalParticipants - board.rank) / board.totalParticipants) * 1000) / 10}%`;
    lines.push(`Weekly rank  #${board.rank} of ${board.totalParticipants} · ${standing}`);
    if (board.verifiedRank) lines.push(`Verified rank  #${board.verifiedRank}`);
  } else {
    lines.push(`${board.totalParticipants ?? 0} burners this week`, "Run `afterai rank --sync` to upload your anonymous summary and receive a rank.");
  }
  const leaders = (board.leaderboard ?? []).slice(0, 5);
  if (leaders.length) {
    lines.push("", "TOP BURNERS");
    for (const entry of leaders) lines.push(`#${entry.rank}  ${entry.displayName} · ${formatTokens(entry.tokenCount)} tokens`);
  }
  lines.push("", "API-equivalent estimates for fun — not actual bills.");
  if (result.uploaded) lines.push("Uploaded only: anonymous ID and device proof, nickname, token totals, estimated USD range, and week.");
  return lines.join("\n");
}

async function ensureIdentity(options) {
  const existing = await loadIdentity(options);
  if (existing) return existing;
  const participantId = randomUUID();
  const identity = {
    participantId,
    secret: randomBytes(32).toString("base64url"),
    displayName: normalizeName(options.name ?? `Burner-${participantId.slice(0, 6).toUpperCase()}`),
  };
  await saveIdentity(identity, options);
  return identity;
}

async function loadIdentity(options) {
  try {
    const identity = JSON.parse(await readFile(options.identityPath ?? defaultIdentityPath(), "utf8"));
    return identity?.participantId && identity?.secret && identity?.displayName ? identity : null;
  } catch { return null; }
}

async function saveIdentity(identity, options) {
  const file = options.identityPath ?? defaultIdentityPath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(identity, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

function defaultIdentityPath() { return path.join(os.homedir(), ".afterai", "rank.json"); }
function normalizeName(value) { const name = String(value).trim().replace(/[<>]/g, ""); if (!name || name.length > 24) throw new Error("Leaderboard nickname must be 1–24 characters"); return name; }
function formatTokens(value) { return new Intl.NumberFormat("en", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value); }

async function requestJson(url, init, fetcher = globalThis.fetch) {
  const response = await fetcher(url, init);
  let payload;
  try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok) throw new Error(payload.error ?? `Leaderboard request failed (${response.status})`);
  return payload;
}
