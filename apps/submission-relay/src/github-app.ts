import { createPrivateKey, createSign, type KeyObject } from "node:crypto";

const API_ORIGIN = "https://api.github.com";
const API_VERSION = "2022-11-28";
const MAX_TOKEN_RESPONSE_BYTES = 16_384;

export interface GitHubCredentialProvider {
  token(signal: AbortSignal): Promise<string>;
}

export interface GitHubAppCredentialsOptions {
  readonly appId: string;
  readonly installationId: number;
  readonly owner: string;
  readonly repository: string;
  readonly privateKeyPem: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
}

class CredentialError extends Error {
  constructor() {
    super("github-credentials-unavailable");
    this.name = "CredentialError";
  }
}

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

async function boundedJson(response: Response): Promise<unknown> {
  const declared = response.headers.get("content-length");
  if (
    declared !== null &&
    (!/^\d+$/u.test(declared) || Number(declared) > MAX_TOKEN_RESPONSE_BYTES)
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw new CredentialError();
  }
  if (response.body === null) throw new CredentialError();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > MAX_TOKEN_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new CredentialError();
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new CredentialError();
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export class GitHubAppCredentials implements GitHubCredentialProvider {
  readonly #appId: string;
  readonly #installationId: number;
  readonly #owner: string;
  readonly #repository: string;
  readonly #key: KeyObject;
  readonly #fetch: typeof fetch;
  readonly #now: () => Date;
  #cached: { token: string; expiresAtMs: number } | null = null;
  #minting: Promise<{ token: string; expiresAtMs: number }> | null = null;

  constructor(options: GitHubAppCredentialsOptions) {
    this.#appId = options.appId;
    this.#installationId = options.installationId;
    this.#owner = options.owner;
    this.#repository = options.repository;
    this.#fetch = options.fetch ?? fetch;
    this.#now = options.now ?? (() => new Date());
    try {
      this.#key = createPrivateKey(options.privateKeyPem);
    } catch {
      throw new CredentialError();
    }
    if (this.#key.type !== "private" || this.#key.asymmetricKeyType !== "rsa")
      throw new CredentialError();
  }

  #jwt(): string {
    const nowSeconds = Math.floor(this.#now().getTime() / 1_000);
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = base64url(
      JSON.stringify({
        exp: nowSeconds + 540,
        iat: nowSeconds - 60,
        iss: this.#appId,
      }),
    );
    const unsigned = `${header}.${payload}`;
    const signer = createSign("RSA-SHA256");
    signer.update(unsigned, "utf8");
    signer.end();
    return `${unsigned}.${signer.sign(this.#key, "base64url")}`;
  }

  async #mint(
    signal: AbortSignal,
  ): Promise<{ token: string; expiresAtMs: number }> {
    let response: Response;
    try {
      response = await this.#fetch(
        `${API_ORIGIN}/app/installations/${this.#installationId}/access_tokens`,
        {
          method: "POST",
          headers: {
            accept: "application/vnd.github+json",
            authorization: `Bearer ${this.#jwt()}`,
            "content-type": "application/json",
            "user-agent": "qvac-atlas-anonymous-relay/0.1",
            "x-github-api-version": API_VERSION,
          },
          body: JSON.stringify({
            permissions: {
              contents: "write",
              metadata: "read",
              pull_requests: "write",
            },
            repositories: [this.#repository],
          }),
          redirect: "error",
          signal,
        },
      );
    } catch {
      throw new CredentialError();
    }
    if (response.status !== 201) {
      await response.body?.cancel().catch(() => undefined);
      throw new CredentialError();
    }
    const value = record(await boundedJson(response));
    const permissions = record(value?.permissions);
    const permissionKeys =
      permissions === null ? [] : Object.keys(permissions).sort();
    const expiresAtMs =
      typeof value?.expires_at === "string"
        ? Date.parse(value.expires_at)
        : Number.NaN;
    if (
      typeof value?.token !== "string" ||
      value.token.length < 20 ||
      value.token.length > 4_096 ||
      /[\x00-\x20\x7f-\x9f]/u.test(value.token) ||
      value.repository_selection !== "selected" ||
      JSON.stringify(permissionKeys) !==
        JSON.stringify(["contents", "metadata", "pull_requests"]) ||
      permissions?.contents !== "write" ||
      permissions.metadata !== "read" ||
      permissions.pull_requests !== "write" ||
      !Number.isFinite(expiresAtMs) ||
      expiresAtMs < this.#now().getTime() + 300_000 ||
      expiresAtMs > this.#now().getTime() + 3_900_000
    ) {
      throw new CredentialError();
    }
    return { token: value.token, expiresAtMs };
  }

  async token(signal: AbortSignal): Promise<string> {
    if (
      this.#cached !== null &&
      this.#cached.expiresAtMs > this.#now().getTime() + 300_000
    ) {
      return this.#cached.token;
    }
    this.#minting ??= this.#mint(signal).finally(() => {
      this.#minting = null;
    });
    this.#cached = await this.#minting;
    return this.#cached.token;
  }
}
