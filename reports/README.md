# QVAC Atlas reports

This tree stores immutable, reviewed QVAC Atlas evidence. It is not an upload
folder: adding a file never transmits anything from a contributor's machine.

Schema-major V1 reports live at:

```text
reports/v1/sha256-<64 lowercase hex>.json
```

The filename must map exactly to the report's `sha256:<same hex>` `report_id`.
Every report must pass the complete admission gate and receive exactly one
maintainer-owned entry in `registry/catalog.json` before merge. See
[`CONTRIBUTING.md`](../CONTRIBUTING.md) for the human-reviewed workflow.
