import assert from "node:assert/strict";
import test from "node:test";

import {
  dispatchCli,
  type InternalCliDependencies,
} from "../src/internal-dispatcher.js";

function dependencies(calls: string[]): InternalCliDependencies {
  return {
    interactive: false,
    isInteractive: () => {
      calls.push("tty");
      return true;
    },
    cwd: () => {
      calls.push("cwd");
      return "/fixture";
    },
    ask: async () => {
      calls.push("ask-fixture");
      return "no";
    },
    askReal: async () => {
      calls.push("ask-real");
      return "no";
    },
    stdout: () => calls.push("stdout"),
    stderr: () => calls.push("stderr"),
    onSigint: (listener) => {
      void listener;
      calls.push("signal");
      return () => calls.push("remove-signal");
    },
    loadRealCli: async () => {
      calls.push("load");
      return { runEnabledRealCli: async () => 0 };
    },
    runProbe: async () => {
      calls.push("probe");
      throw new Error("must not run");
    },
  };
}

test("false real gate refuses before every effect", async () => {
  const calls: string[] = [];
  const exit = await dispatchCli(
    ["probe", "--real", "--output", "report.json"],
    dependencies(calls),
    false,
  );
  assert.equal(exit, 2);
  assert.deepEqual(calls, ["stderr"]);
});

test("help forms succeed on stdout before every effect", async () => {
  const forms = [["--help"], ["-h"], ["probe", "--help"], ["probe", "-h"]];
  for (const args of forms) {
    const calls: string[] = [];
    const output: string[] = [];
    const deps = dependencies(calls);
    deps.stdout = (value) => {
      calls.push("stdout");
      output.push(value);
    };
    assert.equal(await dispatchCli(args, deps, false), 0);
    assert.deepEqual(calls, ["stdout"]);
    assert.match(output.join(""), /^QVAC Atlas creates a local/u);
    assert.match(output.join(""), /separate reviewed activation decision/);
    assert.equal(output.join("").includes("resolver is bound"), false);
  }
});

test("malformed real intent has no effects beyond fixed usage", async () => {
  const cases = [
    ["probe", "--real"],
    ["probe", "--real", "--output", "a", "--output", "b"],
    ["probe", "--real", "--project", "x", "--output", "a"],
    ["probe", "--real", "--output", "a", "--yes", "yes"],
    ["probe", "--real", "--output", "a", "-y", "yes"],
    ["probe", "--real", "--output", "--yes"],
    ["probe", "--real", "--output", "a\0b"],
    ["probe", "--real", "--output", "a\nb\u001b"],
    ["probe", "--real", "--output", "a\rb"],
    ["probe", "--real", "--output", "a\tb"],
    ["probe", "--real", "--output", "x".repeat(4_097)],
  ];
  for (const args of cases) {
    const calls: string[] = [];
    assert.equal(await dispatchCli(args, dependencies(calls), true), 2);
    assert.deepEqual(calls, ["stderr"]);
  }
});

test("malformed fixture syntax has no effects beyond fixed usage", async () => {
  const cases = [
    ["probe", "--fixture", "success", "--fixture", "timeout", "--output", "a"],
    ["probe", "--fixture", "success", "--output", "a", "--output", "b"],
    [
      "probe",
      "--fixture",
      "success",
      "--project",
      "a",
      "--project",
      "b",
      "--output",
      "c",
    ],
    ["probe", "--fixture", "success", "--output", ""],
    ["probe", "--fixture", "success", "--project", "", "--output", "a"],
    ["probe", "--fixture", "success", "--output", "a\nb"],
    ["probe", "--fixture", "success", "--output", "a\rb"],
    ["probe", "--fixture", "success", "--output", "a\tb"],
    ["probe", "--fixture", "success", "--output", "x".repeat(4_097)],
  ];
  for (const args of cases) {
    const calls: string[] = [];
    assert.equal(await dispatchCli(args, dependencies(calls), false), 2);
    assert.deepEqual(calls, ["stderr"]);
  }
});

test("fixture value named --real remains fixture syntax", async () => {
  const calls: string[] = [];
  const exit = await dispatchCli(
    ["probe", "--fixture", "success", "--output", "--real"],
    dependencies(calls),
    false,
  );
  assert.equal(exit, 1);
  assert.deepEqual(calls, ["tty", "cwd", "probe", "stderr"]);
});

test("enabled non-TTY refusal precedes cwd, signal, and real import", async () => {
  const calls: string[] = [];
  const deps = dependencies(calls);
  deps.isInteractive = () => {
    calls.push("tty");
    return false;
  };
  assert.equal(
    await dispatchCli(
      ["probe", "--real", "--output", "report.json"],
      deps,
      true,
    ),
    2,
  );
  assert.deepEqual(calls, ["tty", "stderr"]);
});

test("enabled SIGINT is delivered and listener remains until cleanup settles", async () => {
  const calls: string[] = [];
  let interrupt: (() => void) | undefined;
  let releaseCleanup!: () => void;
  let dispatchSettled = false;
  const deps = dependencies(calls);
  deps.onSigint = (listener) => {
    calls.push("signal");
    interrupt = listener;
    return () => calls.push("remove-signal");
  };
  deps.loadRealCli = async () => ({
    runEnabledRealCli: async ({ signal }) => {
      calls.push("run-real");
      await new Promise<void>((resolve) => {
        signal.addEventListener(
          "abort",
          () => {
            calls.push("aborted");
            releaseCleanup = resolve;
          },
          { once: true },
        );
      });
      calls.push("settled");
      return 130;
    },
  });
  const pending = dispatchCli(
    ["probe", "--real", "--output", "report.json"],
    deps,
    true,
  );
  void pending.finally(() => {
    dispatchSettled = true;
  });
  while (interrupt === undefined || !calls.includes("run-real"))
    await Promise.resolve();
  interrupt();
  while (releaseCleanup === undefined) await Promise.resolve();
  await Promise.resolve();
  assert.equal(dispatchSettled, false);
  assert.equal(calls.includes("remove-signal"), false);
  releaseCleanup();
  assert.equal(await pending, 130);
  assert.deepEqual(calls, [
    "tty",
    "cwd",
    "signal",
    "run-real",
    "aborted",
    "settled",
    "remove-signal",
  ]);
});
