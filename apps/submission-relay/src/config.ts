export const HOST_CONTROLS_ACKNOWLEDGEMENT =
  "edge-rate-limit-and-concurrency-v1";

export interface RelayConfig {
  readonly relayOrigin: string;
  readonly listenHost: "127.0.0.1" | "0.0.0.0";
  readonly port: number;
  readonly githubAppId: string;
  readonly githubInstallationId: number;
  readonly githubPrivateKeyPem: string;
  readonly queueOwner: string;
  readonly queueRepository: string;
  readonly queueRepositoryId: number;
  readonly queueBaseBranch: string;
  readonly queueMaxPending: number;
  readonly maxConcurrentRequests: number;
}

function required(
  environment: NodeJS.ProcessEnv,
  name: string,
  maximum = 4_096,
): string {
  const value = environment[name];
  if (
    value === undefined ||
    value.length === 0 ||
    value.length > maximum ||
    /[\x00-\x20\x7f-\x9f]/u.test(value)
  ) {
    throw new Error(`relay-config:${name}`);
  }
  return value;
}

function repositoryPart(value: string, name: string): string {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?$/u.test(value))
    throw new Error(`relay-config:${name}`);
  return value;
}

function baseBranch(value: string): string {
  if (
    !/^[A-Za-z0-9](?:[A-Za-z0-9._/-]{0,198}[A-Za-z0-9])?$/u.test(value) ||
    value.includes("..") ||
    value.includes("//") ||
    value.includes("@{") ||
    value.endsWith(".lock")
  ) {
    throw new Error("relay-config:ATLAS_QUEUE_BASE_BRANCH");
  }
  return value;
}

function relayOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("relay-config:ATLAS_RELAY_ORIGIN");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    (parsed.pathname !== "/" && parsed.pathname !== "")
  ) {
    throw new Error("relay-config:ATLAS_RELAY_ORIGIN");
  }
  return parsed.origin;
}

function integer(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const value = raw ?? String(fallback);
  if (!/^\d+$/u.test(value)) throw new Error(`relay-config:${name}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum)
    throw new Error(`relay-config:${name}`);
  return parsed;
}

function privateKey(value: string): string {
  if (
    value.length === 0 ||
    value.length > 16_384 ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      value,
    )
  ) {
    throw new Error("relay-config:ATLAS_GITHUB_APP_PRIVATE_KEY_BASE64");
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value)
    throw new Error("relay-config:ATLAS_GITHUB_APP_PRIVATE_KEY_BASE64");
  const pem = new TextDecoder("utf-8", { fatal: true }).decode(decoded);
  if (
    !/^-----BEGIN (?:RSA )?PRIVATE KEY-----\n[\s\S]+\n-----END (?:RSA )?PRIVATE KEY-----\n?$/u.test(
      pem,
    )
  ) {
    throw new Error("relay-config:ATLAS_GITHUB_APP_PRIVATE_KEY_BASE64");
  }
  return pem;
}

export function readRelayConfig(environment: NodeJS.ProcessEnv): RelayConfig {
  if (environment.ATLAS_HOST_ABUSE_CONTROLS !== HOST_CONTROLS_ACKNOWLEDGEMENT) {
    throw new Error("relay-config:ATLAS_HOST_ABUSE_CONTROLS");
  }
  const listenHost = environment.ATLAS_RELAY_LISTEN_HOST ?? "127.0.0.1";
  if (listenHost !== "127.0.0.1" && listenHost !== "0.0.0.0")
    throw new Error("relay-config:ATLAS_RELAY_LISTEN_HOST");
  return {
    relayOrigin: relayOrigin(required(environment, "ATLAS_RELAY_ORIGIN", 512)),
    listenHost,
    port: integer(environment.PORT, 8787, 1, 65_535, "PORT"),
    githubAppId: String(
      integer(
        environment.ATLAS_GITHUB_APP_ID,
        0,
        1,
        Number.MAX_SAFE_INTEGER,
        "ATLAS_GITHUB_APP_ID",
      ),
    ),
    githubInstallationId: integer(
      environment.ATLAS_GITHUB_INSTALLATION_ID,
      0,
      1,
      Number.MAX_SAFE_INTEGER,
      "ATLAS_GITHUB_INSTALLATION_ID",
    ),
    githubPrivateKeyPem: privateKey(
      required(environment, "ATLAS_GITHUB_APP_PRIVATE_KEY_BASE64", 16_384),
    ),
    queueOwner: repositoryPart(
      required(environment, "ATLAS_QUEUE_OWNER", 100),
      "ATLAS_QUEUE_OWNER",
    ),
    queueRepository: repositoryPart(
      required(environment, "ATLAS_QUEUE_REPOSITORY", 100),
      "ATLAS_QUEUE_REPOSITORY",
    ),
    queueRepositoryId: integer(
      environment.ATLAS_QUEUE_REPOSITORY_ID,
      0,
      1,
      Number.MAX_SAFE_INTEGER,
      "ATLAS_QUEUE_REPOSITORY_ID",
    ),
    queueBaseBranch: baseBranch(environment.ATLAS_QUEUE_BASE_BRANCH ?? "main"),
    queueMaxPending: integer(
      environment.ATLAS_QUEUE_MAX_PENDING,
      100,
      1,
      100,
      "ATLAS_QUEUE_MAX_PENDING",
    ),
    maxConcurrentRequests: integer(
      environment.ATLAS_RELAY_MAX_CONCURRENT,
      4,
      1,
      32,
      "ATLAS_RELAY_MAX_CONCURRENT",
    ),
  };
}
