import { receiveSdkBootstrapAndImport } from "../../dist/internal.js";

try {
  const sdk = await receiveSdkBootstrapAndImport();
  process.send?.({
    type: "fixture-result",
    fixtureValue: sdk.fixtureValue,
    cwd: process.cwd(),
    execArgv: process.execArgv,
    forbiddenEnvironment: {
      NODE_OPTIONS: process.env.NODE_OPTIONS,
      NODE_PATH: process.env.NODE_PATH,
      QVAC_CONFIG_PATH: process.env.QVAC_CONFIG_PATH,
      QVAC_WORKER_PATH: process.env.QVAC_WORKER_PATH,
    },
  });
  process.disconnect();
} catch (error) {
  process.send?.({
    type: "fixture-error",
    error: JSON.parse(JSON.stringify(error)),
  });
  process.disconnect();
  process.exitCode = 1;
}
