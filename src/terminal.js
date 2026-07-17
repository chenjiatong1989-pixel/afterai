const STATUS = {
  verified: "✓ Verified",
  unverified: "◌ Unverified",
  partial: "◐ Partial",
  failed: "✕ Failed",
  unknown: "? Unknown",
};

import { formatMoneyRange } from "./value.js";

export function renderTerminal(recap) {
  const lines = [
    "",
    `AFTER AI · ${recap.range.toUpperCase()}`,
    "─".repeat(54),
    recap.headline,
    "",
  ];

  if (recap.sessions.length === 0) {
    lines.push("Try `afterai --demo` or pass logs with `--path <path>`.");
  } else {
    for (const session of recap.sessions) {
      lines.push(`${STATUS[session.status]}  ${session.title}`);
      const details = [];
      if (session.models.length) details.push(session.models.join(", "));
      if (session.usage.totalTokens) details.push(`${formatNumber(session.usage.totalTokens)} tokens`);
      if (session.retryCount) details.push(`${session.retryCount} ${session.retryCount === 1 ? "retry" : "retries"}`);
      if (details.length) lines.push(`  ${details.join(" · ")}`);
    }
  }

  lines.push(
    "",
    "TOTAL",
    `${recap.counts.sessions} tasks shown · ${recap.counts.verified} verified · ${recap.counts.failed + recap.counts.partial} need review`,
  );
  if (recap.counts.hidden > 0) {
    lines.push(`${recap.counts.hidden} inconclusive chat session${recap.counts.hidden === 1 ? "" : "s"} hidden · included in token total`);
  }
  lines.push(
    recap.usage.totalTokens > 0
      ? `${formatNumber(recap.usage.totalTokens)} tokens`
      : "Token usage unknown — the source logs did not expose it.",
  );

  lines.push("", "TOKEN VALUE");
  if (recap.value?.status === "estimated") {
    lines.push(`API equivalent  ${formatMoneyRange(recap.value.usd, "USD", "en-US")}`);
    if (recap.value.localCurrency !== "USD") {
      lines.push(`Local equivalent  ${formatMoneyRange(recap.value.local, recap.value.localCurrency)}`);
      if (recap.value.exchangeRate) lines.push(`Exchange rate  1 USD = ${formatRate(recap.value.exchangeRate)} ${recap.value.localCurrency} · ${recap.value.ratesAsOf}`);
    }
    lines.push(`Confidence  ${recap.value.confidence} · pricing ${recap.value.pricingAsOf}`, "Actual amount billed  Unknown");
  } else {
    lines.push(`Unknown — ${recap.value?.reasons?.[0] ?? "pricing evidence is incomplete."}`);
  }

  lines.push("", "NEXT", recap.attention.text);

  if (recap.warnings.length) lines.push("", `Note: ${recap.warnings.length} source warning${recap.warnings.length === 1 ? "" : "s"}. Use --json for details.`);
  return lines.join("\n");
}

function formatRate(value) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 6 }).format(value);
}

function formatNumber(value) {
  return new Intl.NumberFormat("en", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}
