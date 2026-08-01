import { isIP } from "node:net";

const FORBIDDEN_KEY =
  /(?:^|_)(?:api_?key|auth(?:orization)?|cookie|credential|email|env(?:ironment)?|full_?log|home(?:_directory)?|host(?:name)?|ip(?:_address)?|mac(?:_address)?|machine_?id|organization|output|password|process(?:_list)?|prompt|secret|serial(?:_number)?|shell_?history|ssid|token|username)(?:$|_)/i;

const CONTENT_RULES = [
  ["private-key", /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/],
  [
    "bearer-token",
    /(?<![A-Za-z0-9])(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/i,
  ],
  [
    "jwt",
    /(?<![A-Za-z0-9])eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?![A-Za-z0-9])/,
  ],
  [
    "known-token",
    /(?<![A-Za-z0-9])(?:gh[opusr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|(?:AKIA|ASIA)[0-9A-Z]{16})(?![A-Za-z0-9])/,
  ],
  [
    "credential-url",
    /(?<![A-Za-z0-9])[a-z][a-z0-9+.-]*:\/\/[^\s/:]+:[^\s/@]+@/i,
  ],
  ["email", /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i],
  ["windows-user-path", /(?<![A-Za-z0-9])[A-Za-z]:\\Users\\[^\\\s]+/i],
  ["posix-user-path", /(?<![A-Za-z0-9./])\/(?:Users|home)\/[^/\s"']+/],
  ["windows-absolute-path", /(?<![A-Za-z0-9])[A-Za-z]:[\\/][^\s"'<>]+/],
  ["windows-unc-path", /(?<![A-Za-z0-9\\])\\\\[^\\\s"'<>]+\\[^\\\s"'<>]+/],
  [
    "posix-absolute-path",
    /(?<![A-Za-z0-9./])\/(?!\/)[A-Za-z0-9._+-]+(?:\/[^/\s"'<>]+)+/,
  ],
  [
    "mac-address",
    /(?:(?<![A-Za-z0-9])(?<![0-9A-F]{2}[:-])(?:[0-9A-F]{2}[:-]){5}[0-9A-F]{2}(?![A-Za-z0-9]|[:-][0-9A-F]{2})|(?<![A-Za-z0-9])(?<![0-9A-F]{4}\.)(?:[0-9A-F]{4}\.){2}[0-9A-F]{4}(?![A-Za-z0-9]|\.[0-9A-F]{4}))/i,
  ],
  [
    "stable-identifier",
    /(?<![A-Za-z0-9])[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}(?![A-Za-z0-9])/i,
  ],
  [
    "ipv4-address",
    /(?<![A-Za-z0-9.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![A-Za-z0-9.])/,
  ],
];

// Report strings are schema-bounded to 1024 characters. Capture only the name and
// the first value character so findings can never reflect the assigned value.
const ASSIGNMENT_CANDIDATE =
  /(?<![A-Za-z0-9_.-])([A-Za-z0-9_.-]{1,1024})[ \t]*=[ \t]*\S/gi;
const SENSITIVE_KEY_PREFIXES = new Set(["ACCESS", "API", "PRIVATE", "SECRET"]);
const COMPACT_ADJACENT_SENSITIVE_KEY =
  /(?:SECRET(?:V(?:ERSION)?\d*|\d+)?(?:ACCESS(?:V(?:ERSION)?\d*|\d+)?)?KEY|PRIVATE(?:V(?:ERSION)?\d*|\d+)?KEY|ACCESS(?:V(?:ERSION)?\d*|\d+)?KEY|API(?:V(?:ERSION)?\d*|\d+)?KEY)/gu;
const COMPACT_SENSITIVE_PREFIX = /(?:SECRET|PRIVATE|ACCESS|API)/gu;
const SAFE_KEY_WORD_PREFIX = /^KEY(?:BOARD|STONE|WORD|NOTE)/u;
const SAFE_COMPACT_PREFIX_WORDS = [
  "ACCESSIBILITIES",
  "ACCESSIBILITY",
  "ACCESSIBLE",
  "ACCESSORIES",
  "ACCESSORY",
  "APICULTURE",
  "APIOLOGY",
  "APIARIES",
  "APIARY",
  "APICAL",
  "APIECE",
  "APISH",
  "PRIVATEERS",
  "PRIVATEER",
  "PRIVATELY",
  "SECRETARIAT",
  "SECRETARIES",
  "SECRETARY",
  "SECRETIVE",
  "SECRETION",
  "SECRETORY",
];
const COMPACT_PREFIX_BOUNDARY_WORDS = [
  ...SAFE_COMPACT_PREFIX_WORDS,
  "OPENAI",
  "GITHUB",
  "GITLAB",
  "GOOGLE",
  "CUSTOM",
  "SERVICE",
  "CLIENT",
  "SERVER",
  "ATLAS",
  "AZURE",
  "QVAC",
  "PROD",
  "STAGING",
  "TEST",
  "AWS",
  "GCP",
  "APP",
  "DEV",
  "TEAM",
  "ORG",
  "MY",
  "CI",
  "CD",
];
const SAFE_KEY_ENDING_STEMS = [
  "DON",
  "FLUN",
  "HOC",
  "HOT",
  "JOC",
  "LAC",
  "LOW",
  "MON",
  "PO",
  "TUR",
  "TURN",
  "WHIS",
];
const COMPACT_ASSIGNMENT_SEGMENTS = new Map([
  ["ACCESSKEY", "ACCESS_KEY"],
  ["ACCESSKEYS", "ACCESS_KEYS"],
  ["APIKEY", "API_KEY"],
  ["APIKEYS", "API_KEYS"],
  ["FULLLOG", "FULL_LOG"],
  ["FULLLOGS", "FULL_LOGS"],
  ["HOMEDIRECTORIES", "HOME_DIRECTORIES"],
  ["HOMEDIRECTORY", "HOME_DIRECTORY"],
  ["IPADDRESS", "IP_ADDRESS"],
  ["IPADDRESSES", "IP_ADDRESSES"],
  ["MACADDRESS", "MAC_ADDRESS"],
  ["MACADDRESSES", "MAC_ADDRESSES"],
  ["MACHINEID", "MACHINE_ID"],
  ["MACHINEIDS", "MACHINE_IDS"],
  ["PRIVATEKEY", "PRIVATE_KEY"],
  ["PRIVATEKEYS", "PRIVATE_KEYS"],
  ["PROCESSLIST", "PROCESS_LIST"],
  ["PROCESSLISTS", "PROCESS_LISTS"],
  ["SERIALNUMBER", "SERIAL_NUMBER"],
  ["SERIALNUMBERS", "SERIAL_NUMBERS"],
  ["SECRETACCESSKEY", "SECRET_ACCESS_KEY"],
  ["SECRETACCESSKEYS", "SECRET_ACCESS_KEYS"],
  ["SECRETKEY", "SECRET_KEY"],
  ["SECRETKEYS", "SECRET_KEYS"],
  ["SHELLHISTORIES", "SHELL_HISTORIES"],
  ["SHELLHISTORY", "SHELL_HISTORY"],
]);
const PLURAL_ASSIGNMENT_SEGMENTS = new Map([
  ["ADDRESSES", "ADDRESS"],
  ["APIKEYS", "APIKEY"],
  ["AUTHS", "AUTH"],
  ["AUTHORIZATIONS", "AUTHORIZATION"],
  ["COOKIES", "COOKIE"],
  ["CREDENTIALS", "CREDENTIAL"],
  ["DIRECTORIES", "DIRECTORY"],
  ["EMAILS", "EMAIL"],
  ["ENVS", "ENV"],
  ["ENVIRONMENTS", "ENVIRONMENT"],
  ["FULLLOGS", "FULLLOG"],
  ["HISTORIES", "HISTORY"],
  ["HOMES", "HOME"],
  ["HOSTS", "HOST"],
  ["HOSTNAMES", "HOSTNAME"],
  ["IDS", "ID"],
  ["IPS", "IP"],
  ["KEYS", "KEY"],
  ["LISTS", "LIST"],
  ["LOGS", "LOG"],
  ["MACS", "MAC"],
  ["MACHINEIDS", "MACHINEID"],
  ["NUMBERS", "NUMBER"],
  ["ORGANIZATIONS", "ORGANIZATION"],
  ["OUTPUTS", "OUTPUT"],
  ["PASSWORDS", "PASSWORD"],
  ["PROCESSES", "PROCESS"],
  ["PROMPTS", "PROMPT"],
  ["SECRETS", "SECRET"],
  ["SERIALS", "SERIAL"],
  ["SHELLHISTORIES", "SHELLHISTORY"],
  ["SSIDS", "SSID"],
  ["TOKENS", "TOKEN"],
  ["USERNAMES", "USERNAME"],
]);

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
const IPV6_ADJACENT = /[0-9A-Za-z.%~]/u;

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

function addNumericBoundaries(value) {
  return value
    .replace(/([A-Za-z])([0-9])/gu, "$1_$2")
    .replace(/([0-9])([A-Za-z])/gu, "$1_$2");
}

function assignmentNameVariants(rawName) {
  const compact = rawName.replace(/[.-]+/gu, "_").replace(/^_+/u, "");
  const simpleCamel = compact.replace(/([a-z0-9])([A-Z])/gu, "$1_$2");
  const acronymCamel = compact
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/gu, "$1_$2");
  return new Set(
    [compact, simpleCamel, acronymCamel].flatMap((candidate) => {
      const upper = candidate.toUpperCase();
      return [upper, addNumericBoundaries(upper)];
    }),
  );
}

function hasCompactSensitiveKey(segment) {
  // The segment and every generated variant are schema-bounded. Continue past
  // benign words so a later real key family in the same segment is still found.
  for (const match of segment.matchAll(COMPACT_ADJACENT_SENSITIVE_KEY)) {
    const tail = segment.slice(match.index + match[0].length);
    if (SAFE_KEY_WORD_PREFIX.test(`KEY${tail}`)) continue;
    return true;
  }
  for (const prefix of segment.matchAll(COMPACT_SENSITIVE_PREFIX)) {
    const left = segment.slice(0, prefix.index);
    const hasBoundary =
      prefix.index === 0 ||
      COMPACT_PREFIX_BOUNDARY_WORDS.some((word) => left.endsWith(word));
    if (!hasBoundary) continue;
    if (
      SAFE_COMPACT_PREFIX_WORDS.some((word) =>
        segment.startsWith(word, prefix.index),
      )
    )
      continue;
    const prefixEnd = prefix.index + prefix[0].length;
    let keyIndex = segment.indexOf("KEY", prefixEnd);
    while (keyIndex !== -1) {
      const bridge = segment.slice(prefixEnd, keyIndex);
      const tail = segment.slice(keyIndex + 3);
      const ordinaryKeyWord = SAFE_KEY_ENDING_STEMS.some((stem) =>
        bridge.endsWith(stem),
      );
      if (!ordinaryKeyWord && !SAFE_KEY_WORD_PREFIX.test(`KEY${tail}`))
        return true;
      keyIndex = segment.indexOf("KEY", keyIndex + 3);
    }
  }
  return false;
}

function isSensitiveAssignmentName(name) {
  const rawSegments = name.split("_").filter(Boolean);
  // A recognized compact key family may have an ordinary namespace prefix
  // or suffix inside the same segment (for example
  // AWSSECRETACCESSKEYBACKUP). Ordinary KEYBOARD/KEYSTONE/KEYWORD/KEYNOTE
  // compounds and ordinary words ending in KEY remain safe; scanning continues
  // after them so a later sensitive key family still rejects.
  if (rawSegments.some(hasCompactSensitiveKey)) return true;
  const segments = rawSegments
    .flatMap((segment) =>
      (COMPACT_ASSIGNMENT_SEGMENTS.get(segment) ?? segment).split("_"),
    );
  const policySegments = segments.map(
    (segment) => PLURAL_ASSIGNMENT_SEGMENTS.get(segment) ?? segment,
  );
  const safePolicySegments = policySegments.map((segment, index) =>
    segments[index] === "SECRET" &&
    SAFE_KEY_WORD_PREFIX.test(policySegments[index + 1] ?? "")
      ? "SAFE"
      : segment,
  );
  const policyName = safePolicySegments.join("_");
  if (
    FORBIDDEN_KEY.test(policyName) ||
    /(?:API_?KEYS?|AUTHORIZATIONS?|COOKIES?|CREDENTIALS?|PASSWORDS?|SECRETS?|TOKENS?)$/u.test(
      name,
    )
  )
    return true;
  for (let index = 0; index < policySegments.length; index += 1) {
    if (!SENSITIVE_KEY_PREFIXES.has(policySegments[index])) continue;
    // Namespace and version segments are allowed between a sensitive prefix
    // and a KEY-bearing suffix. Requiring adjacency let API2KEY and apiV2Key
    // bypass policy; requiring an exact KEY let API2KEYBACKUP bypass it.
    if (
      policySegments
        .slice(index + 1)
        .some(
          (segment) =>
            segment.startsWith("KEY") &&
            !SAFE_KEY_WORD_PREFIX.test(segment),
        )
    )
      return true;
  }
  return false;
}

function hasSensitiveAssignment(value) {
  for (const match of value.matchAll(ASSIGNMENT_CANDIDATE)) {
    const variants = assignmentNameVariants(match[1]);
    // This deliberate fixture-safe negation is exact under every supported name
    // convention; prefixed or suffixed forms remain sensitive.
    if (variants.has("NOT_TOKEN")) continue;
    for (const name of variants) {
      if (isSensitiveAssignmentName(name)) return true;
    }
  }
  return false;
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
    if (hasSensitiveAssignment(current)) {
      findings.push({ path: pointer || "/", rule: "sensitive-assignment" });
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
