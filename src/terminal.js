const STATUS = {
  verified: "✓ Verified",
  unverified: "◌ Unverified",
  partial: "◐ Partial",
  failed: "✕ Failed",
  unknown: "? Unknown",
};

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
    `${recap.counts.sessions} sessions · ${recap.counts.verified} verified · ${recap.counts.failed + recap.counts.partial} need review`,
    recap.usage.totalTokens > 0
      ? `${formatNumber(recap.usage.totalTokens)} tokens · cost unknown until an exact pricing source is configured`
      : "Token usage unknown — the source logs did not expose it.",
    "",
    "NEXT",
    recap.attention.text,
  );

  if (recap.warnings.length) lines.push("", `Note: ${recap.warnings.length} source warning${recap.warnings.length === 1 ? "" : "s"}. Use --json for details.`);
  return lines.join("\n");
}

function formatNumber(value) {
  return new Intl.NumberFormat("en", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}
