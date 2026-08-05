#!/usr/bin/env node

import { readRelayConfig } from "./config.js";
import { GitHubAppCredentials } from "./github-app.js";
import { GitHubPrivateQueue } from "./github-queue.js";
import { startRelayServer } from "./server.js";

try {
  const config = readRelayConfig(process.env);
  const credentials = new GitHubAppCredentials({
    appId: config.githubAppId,
    installationId: config.githubInstallationId,
    owner: config.queueOwner,
    repository: config.queueRepository,
    privateKeyPem: config.githubPrivateKeyPem,
  });
  const queue = new GitHubPrivateQueue({
    owner: config.queueOwner,
    repository: config.queueRepository,
    baseBranch: config.queueBaseBranch,
    maxPending: config.queueMaxPending,
    repositoryId: config.queueRepositoryId,
    credentials,
  });
  const server = await startRelayServer(config, queue);
  const stop = () => server.close(() => process.exit(0));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  process.stdout.write("QVAC Atlas anonymous relay is ready.\n");
} catch {
  process.stderr.write("QVAC Atlas anonymous relay failed readiness.\n");
  process.exitCode = 1;
}
