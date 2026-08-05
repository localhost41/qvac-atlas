import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import {
  HOST_CONTROLS_ACKNOWLEDGEMENT,
  readRelayConfig,
} from "../src/config.js";
import { GitHubAppCredentials } from "../src/github-app.js";
import { jsonResponse } from "./helpers.js";

function privateKeyPem(): string {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return privateKey.export({ format: "pem", type: "pkcs8" }).toString();
}

test("relay config requires HTTPS, host controls, immutable repo ID, and app key", () => {
  const pem = privateKeyPem();
  const environment = {
    ATLAS_GITHUB_APP_ID: "123",
    ATLAS_GITHUB_APP_PRIVATE_KEY_BASE64: Buffer.from(pem).toString("base64"),
    ATLAS_GITHUB_INSTALLATION_ID: "456",
    ATLAS_HOST_ABUSE_CONTROLS: HOST_CONTROLS_ACKNOWLEDGEMENT,
    ATLAS_QUEUE_OWNER: "atlas-owner",
    ATLAS_QUEUE_REPOSITORY: "private-queue",
    ATLAS_QUEUE_REPOSITORY_ID: "789",
    ATLAS_RELAY_ORIGIN: "https://relay.example",
  };
  const config = readRelayConfig(environment);
  assert.equal(config.githubPrivateKeyPem, pem);
  assert.equal(config.queueRepositoryId, 789);
  assert.equal(config.relayOrigin, "https://relay.example");
  for (const name of [
    "ATLAS_HOST_ABUSE_CONTROLS",
    "ATLAS_QUEUE_REPOSITORY_ID",
    "ATLAS_GITHUB_APP_PRIVATE_KEY_BASE64",
  ]) {
    const hostile = { ...environment };
    delete hostile[name as keyof typeof hostile];
    assert.throws(() => readRelayConfig(hostile), /relay-config/);
  }
  assert.throws(
    () =>
      readRelayConfig({
        ...environment,
        ATLAS_RELAY_ORIGIN: "http://relay.example",
      }),
    /relay-config/,
  );
});

test("GitHub App tokens are minted once with exact repository and permissions", async () => {
  const now = new Date("2026-08-04T00:00:00.000Z");
  const requests: Array<{ authorization: string; body: any; url: string }> = [];
  const credentials = new GitHubAppCredentials({
    appId: "123",
    installationId: 456,
    owner: "atlas-owner",
    repository: "private-queue",
    privateKeyPem: privateKeyPem(),
    now: () => now,
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      requests.push({
        authorization: headers.get("authorization") ?? "",
        body: JSON.parse(String(init?.body)),
        url: String(input),
      });
      return jsonResponse(
        {
          expires_at: "2026-08-04T00:59:00.000Z",
          permissions: {
            contents: "write",
            metadata: "read",
            pull_requests: "write",
          },
          repository_selection: "selected",
          token: `ghs_${"a".repeat(40)}`,
        },
        201,
      );
    },
  });
  const first = await credentials.token(new AbortController().signal);
  const second = await credentials.token(new AbortController().signal);
  assert.equal(first, second);
  assert.equal(requests.length, 1);
  assert.equal(
    requests[0]?.url,
    "https://api.github.com/app/installations/456/access_tokens",
  );
  assert.deepEqual(requests[0]?.body, {
    permissions: {
      contents: "write",
      metadata: "read",
      pull_requests: "write",
    },
    repositories: ["private-queue"],
  });
  const jwt = requests[0]?.authorization.replace("Bearer ", "") ?? "";
  const parts = jwt.split(".");
  assert.equal(parts.length, 3);
  const payload = JSON.parse(
    Buffer.from(parts[1] ?? "", "base64url").toString(),
  );
  assert.equal(payload.iss, "123");
  assert.equal(payload.exp - payload.iat, 600);
});
