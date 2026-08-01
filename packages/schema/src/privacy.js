import { isIP } from "node:net";

const FORBIDDEN_KEY =
  /(?:^|_)(?:api_?key|auth(?:orization)?|cookie|credential|email|env(?:ironment)?|full_?log|home(?:_directory)?|host(?:name)?|ip(?:_address)?|mac(?:_address)?|machine_?id|organization|output|password|process(?:_list)?|prompt|secret|serial(?:_number)?|shell_?history|ssid|token|username)(?:$|_)/i;

const CONTENT_RULES = [
  ["private-key", /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/],
  ["bearer-token", /\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/i],
  ["jwt", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/],
  [
    "known-token",
    /\b(?:gh[opusr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})\b/,
  ],
  ["credential-url", /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:]+:[^\s/@]+@/i],
  ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ["windows-user-path", /\b[A-Za-z]:\\Users\\[^\\\s]+/i],
  ["posix-user-path", /(?:^|[\s"'])\/(?:Users|home)\/[^/\s"']+/],
  ["windows-absolute-path", /(?:^|[\s"'(=])[A-Za-z]:[\\/][^\s"'<>]+/],
  ["windows-unc-path", /(?:^|[\s"'(=])\\\\[^\\\s"'<>]+\\[^\\\s"'<>]+/],
  [
    "posix-absolute-path",
    /(?:^|[\s"'(=:])\/(?!\/)[A-Za-z0-9._+-]+(?:\/[^\s"'<>]*)?/,
  ],
  ["mac-address", /\b(?:[0-9A-F]{2}[:-]){5}[0-9A-F]{2}\b/i],
  [
    "stable-identifier",
    /(?<![0-9a-f])[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}(?![0-9a-f])/i,
  ],
  [
    "ipv4-address",
    /(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\d.])/,
  ],
  [
    "sensitive-assignment",
    /\b(?:TOKEN|SECRET|PASSWORD|API_KEY|AUTHORIZATION)\s*=\s*\S+/i,
  ],
];

const EXACT_ENTROPY_EXEMPT_PATHS = new Set([
  "/report_id",
  "/schema_version",
  "/probe_version",
  "/runtime/node_version",
  "/qvac/sdk_version",
  "/profile/version",
  "/profile/artifact_sha256",
  "/privacy/sanitizer_version",
]);
const PACKAGE_VERSION_PATH = /^\/qvac\/packages\/\d+\/version$/;
const IPV6_CANDIDATE =
  /\[[0-9A-Fa-f:.]{2,128}(?:%[0-9A-Za-z_.~-]{1,64})?\]|[0-9A-Fa-f:.]{0,128}:[0-9A-Fa-f:.]{1,128}(?:%[0-9A-Za-z_.~-]{1,64})?/gu;
const IPV6_ADJACENT = /[0-9A-Za-z_.%~-]/u;

function pointerSegment(value) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function shannonEntropy(value) {
  const counts = new Map();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function hasHighEntropySecret(value, pointer) {
  if (
    EXACT_ENTROPY_EXEMPT_PATHS.has(pointer) ||
    PACKAGE_VERSION_PATH.test(pointer)
  )
    return false;
  const candidates = value.match(/[A-Za-z0-9+/=_-]{32,}/g) ?? [];
  return candidates.some((candidate) => shannonEntropy(candidate) >= 4.25);
}

function hasIpv6Address(value) {
  for (const match of value.matchAll(IPV6_CANDIDATE)) {
    let candidate = match[0];
    if (candidate.length > 192) continue;
    const bracketed = candidate.startsWith("[") && candidate.endsWith("]");
    const before = value[match.index - 1];
    const after = value[match.index + match[0].length];
    if (
      (before !== undefined && IPV6_ADJACENT.test(before)) ||
      (after !== undefined &&
        (IPV6_ADJACENT.test(after) || (!bracketed && after === ":")))
    )
      continue;
    if (bracketed) {
      candidate = candidate.slice(1, -1);
    } else {
      candidate = candidate.replace(/[.,;!?]+$/u, "");
    }
    const zoneIndex = candidate.indexOf("%");
    const address =
      zoneIndex === -1 ? candidate : candidate.slice(0, zoneIndex);
    if (isIP(address) === 6) return true;
  }
  return false;
}

/**
 * Defense-in-depth scanner. It returns rule names and JSON pointers but never
 * includes the suspect value in an error, so validation logs cannot amplify a leak.
 */
export function scanPrivacy(value) {
  const findings = [];

  function visit(current, pointer) {
    if (Array.isArray(current)) {
      current.forEach((child, index) => visit(child, `${pointer}/${index}`));
      return;
    }
    if (current !== null && typeof current === "object") {
      for (const [key, child] of Object.entries(current)) {
        const childPointer = `${pointer}/${pointerSegment(key)}`;
        if (FORBIDDEN_KEY.test(key))
          findings.push({ path: childPointer, rule: "forbidden-field-name" });
        visit(child, childPointer);
      }
      return;
    }
    if (typeof current !== "string") return;

    for (const [rule, pattern] of CONTENT_RULES) {
      if (pattern.test(current)) findings.push({ path: pointer || "/", rule });
    }
    if (hasIpv6Address(current)) {
      findings.push({ path: pointer || "/", rule: "ipv6-address" });
    }
    if (hasHighEntropySecret(current, pointer)) {
      findings.push({ path: pointer || "/", rule: "high-entropy-string" });
    }
  }

  visit(value, "");
  return findings;
}
