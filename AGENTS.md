# QVAC Atlas worker protocol

This repository, not chat history, is the project memory.

## Required startup sequence

Before changing files, read in order:

1. `docs/PROJECT.md`
2. `docs/SPEC.md`
3. `docs/DECISIONS.md`
4. `docs/TASKS.md`
5. `docs/STATUS.md`
6. The assigned work packet and relevant code/tests

## Work rules

- Work only on an assigned `ATLAS-*` task.
- Respect the task's allowed paths and dependencies.
- Do not expand V1 scope. Escalate ambiguity instead.
- Never add telemetry, automatic upload, accounts, a service database, arbitrary log collection, or automatic repair.
- Never claim a backend unless the probe directly observed it.
- Treat privacy leaks, orphaned child processes, nondeterministic reports, and fabricated compatibility claims as release blockers.
- Prefer official QVAC public APIs and commands. Do not copy Doctor rules or import private QVAC internals.
- Keep QVAC execution isolated from the parent probe process.
- Preserve user work and avoid destructive Git operations.
- Run the task's acceptance commands before handoff.

## Required handoff

Every completed, paused, or escalated task must report:

```text
Task and status
Branch and commit
Scope completed
Files changed
Commands/tests run and results
Decisions made
Open risks or blockers
Dependencies unblocked
Suggested next task
```

Workers do not merge their own branches. The release captain integrates completed packets and updates the durable project state.

