const EVIDENCE = Object.freeze({
  EXACT: "Exact",
  ESTIMATED: "Estimated",
  UNKNOWN: "Unknown",
});

export function createReceipt(recap) {
  const sessions = Array.isArray(recap?.sessions) ? recap.sessions : [];
  const verified = sessions.filter((session) => session.status === "verified");
  const failed = sessions.filter((session) => ["failed", "partial"].includes(session.status));
  const files = unique(sessions.flatMap((session) =>
    session.evidence?.filter((item) => item.type === "files").flatMap((item) => item.files ?? []) ?? []
  ));
  const verifications = sessions.flatMap((session) => {
    const items = session.evidence?.filter((item) => item.type === "verification") ?? [];
    if (items.length === 0) return [];
    return items.map((item) => ({
      task: session.title,
      result: item.stale ? "Stale" : /failed/i.test(item.text ?? "") ? "Failed" : "Passed",
      evidence: EVIDENCE.EXACT,
    }));
  });
  const stale = verifications.some((item) => item.result === "Stale");
  const models = unique(sessions.flatMap((session) => session.models ?? []));
  const tokenKnown = recap?.usage?.source === "exact" && Number.isFinite(recap?.usage?.totalTokens);
  const status = verdict(recap, sessions, stale, tokenKnown, models.length > 0);

  return {
    schemaVersion: "afterai.receipt.v1",
    generatedAt: recap?.generatedAt ?? new Date().toISOString(),
    range: recap?.range ?? "today",
    status,
    evidenceLevel: overallEvidence({ sessions, tokenKnown, stale }),
    work: field(
      sessions.length ? sessions.map((session) => ({ task: session.title, state: session.status })) : "Unknown",
      sessions.length ? EVIDENCE.ESTIMATED : EVIDENCE.UNKNOWN,
      "Deterministic activity summary; raw prompts are not exported.",
    ),
    succeeded: field(
      sessions.length ? verified.map((session) => session.title) : "Unknown",
      sessions.length ? EVIDENCE.ESTIMATED : EVIDENCE.UNKNOWN,
      "Tasks with a fresh, recorded verifier exit of zero.",
    ),
    failed: field(
      sessions.length ? failed.map((session) => session.title) : "Unknown",
      sessions.length ? EVIDENCE.ESTIMATED : EVIDENCE.UNKNOWN,
      "Tasks with recorded failure or failed final verification.",
    ),
    changedFiles: {
      ...field(files.length ? files : "Unknown", files.length ? EVIDENCE.EXACT : EVIDENCE.UNKNOWN, "Observed file operations only."),
      attribution: "Unknown",
    },
    tests: {
      ...field(verifications.length ? verifications : "Unknown", verifications.length ? EVIDENCE.EXACT : EVIDENCE.UNKNOWN, "Recorded verifier results; AfterAI does not run discovered commands."),
      stale,
    },
    retries: field(sessions.length ? (recap?.counts?.retries ?? 0) : "Unknown", sessions.length ? EVIDENCE.ESTIMATED : EVIDENCE.UNKNOWN, "Repeated failed commands grouped deterministically."),
    models: field(models.length ? models : "Unknown", models.length ? EVIDENCE.EXACT : EVIDENCE.UNKNOWN, "All recorded model identifiers, in first-seen order."),
    tokens: field(tokenKnown ? recap.usage.totalTokens : "Unknown", tokenKnown ? EVIDENCE.EXACT : EVIDENCE.UNKNOWN, "Latest complete cumulative token snapshot per session."),
  };
}

function verdict(recap, sessions, stale, tokenKnown, modelKnown) {
  if ((recap?.counts?.failed ?? 0) > 0 || (recap?.counts?.partial ?? 0) > 0) return "FAILED";
  if (sessions.length > 0 && (!tokenKnown || !modelKnown || stale || (recap?.counts?.unverified ?? 0) > 0 || (recap?.counts?.unknown ?? 0) > 0)) return "UNVERIFIED";
  if (sessions.length > 0 && sessions.every((session) => session.status === "verified")) return "VERIFIED";
  return "UNKNOWN";
}

function overallEvidence({ sessions, tokenKnown, stale }) {
  if (sessions.length === 0 || !tokenKnown) return EVIDENCE.UNKNOWN;
  return EVIDENCE.ESTIMATED;
}

function field(value, evidence, basis) {
  return { value, evidence, basis };
}

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()))];
}
