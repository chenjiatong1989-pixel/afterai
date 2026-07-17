export function renderPrivacyTerminal(snapshot) {
  const observed = snapshot.observed;
  const lines = [
    "",
    "AFTER AI · PRIVACY",
    "─".repeat(54),
    snapshot.headline,
    "",
    "OBSERVED",
    `${observed.filesInspected} configuration file${observed.filesInspected === 1 ? "" : "s"} inspected locally`,
    `${observed.endpoints.length} configured endpoint${observed.endpoints.length === 1 ? "" : "s"}`,
    `${observed.mcpServers.length} MCP server${observed.mcpServers.length === 1 ? "" : "s"}`,
    `${observed.secretReferences.length} secret-like setting${observed.secretReferences.length === 1 ? "" : "s"} (values never shown)`,
  ];

  if (observed.endpoints.length) {
    lines.push("", "ENDPOINTS");
    for (const endpoint of observed.endpoints) {
      lines.push(`${endpoint.local ? "✓" : "○"} ${endpoint.host} · ${endpoint.local ? "local" : "external"} · observed in ${endpoint.source}`);
    }
  }

  if (observed.telemetry.length) {
    lines.push("", "DATA COLLECTION SETTINGS");
    for (const item of observed.telemetry) lines.push(`${statusIcon(item.status)} ${item.key} · ${item.status} · ${item.source}`);
  }

  if (snapshot.findings.length) {
    lines.push("", "FINDINGS");
    for (const finding of snapshot.findings) lines.push(`${findingIcon(finding.severity)} ${finding.text}${finding.source ? ` · ${finding.source}` : ""}`);
  }

  lines.push(
    "",
    "UNKNOWN",
    "Live network traffic was not captured, so actual transmitted content is unknown.",
    "",
    "NEXT",
    snapshot.next,
  );
  return lines.join("\n");
}

function statusIcon(status) {
  if (status === "enabled") return "⚠";
  if (status === "disabled") return "✓";
  return "?";
}

function findingIcon(severity) {
  if (severity === "high") return "✕";
  if (severity === "review") return "⚠";
  return "○";
}
