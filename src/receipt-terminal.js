export function renderReceipt(receipt) {
  const lines = [
    "",
    `AFTERAI WORK RECEIPT · ${String(receipt.range).toUpperCase()}`,
    "─".repeat(58),
    `VERDICT  ${receipt.status} · ${receipt.evidenceLevel}`,
    "",
    renderField("WHAT AI DID", receipt.work),
    renderField("SUCCEEDED", receipt.succeeded),
    renderField("FAILED", receipt.failed),
    renderField("CHANGED FILES", receipt.changedFiles),
    renderTests(receipt.tests),
    renderField("RETRIES", receipt.retries),
    renderField("MODELS", receipt.models),
    renderField("TOKENS", receipt.tokens),
    "",
    "Exact = directly observed · Estimated = deterministic inference · Unknown = not proven",
  ];
  return lines.join("\n");
}

function renderTests(field) {
  const suffix = field.stale ? " · STALE" : "";
  return renderField("TESTS REALLY PASSED", field, suffix);
}

function renderField(label, field, suffix = "") {
  return `${label}  [${field.evidence}]${suffix}\n${formatValue(field.value)}`;
}

function formatValue(value) {
  if (value === "Unknown") return "  Unknown";
  if (Array.isArray(value)) {
    if (value.length === 0) return "  None";
    return value.map((item) => `  - ${formatItem(item)}`).join("\n");
  }
  return `  ${formatItem(value)}`;
}

function formatItem(value) {
  if (value && typeof value === "object") {
    if (value.task && value.result) return `${value.result}: ${value.task}`;
    if (value.task && value.state) return `${value.task} (${value.state})`;
    return JSON.stringify(value);
  }
  return String(value);
}

