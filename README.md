# QVAC Atlas

QVAC Atlas is an evidence-backed hardware compatibility registry for QVAC.

The V1 workflow is deliberately narrow:

```text
consented local probe
  -> sanitized, versioned JSON report
  -> reviewed Git contribution
  -> static compatibility registry
```

Atlas is not a replacement for `qvac doctor`. It uses official QVAC diagnostics as evidence, then records whether one pinned workload actually started, which backend was directly observed, and whether it completed.

## Project status

Day 1 feasibility and contract work is in progress. The repository is not yet ready for external use or publication.

See [`docs/PROJECT.md`](docs/PROJECT.md) for the immutable V1 boundary and [`docs/STATUS.md`](docs/STATUS.md) for the current verified state.

