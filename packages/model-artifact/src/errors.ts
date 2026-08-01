export type ArtifactErrorCode =
  | "artifact-request-invalid"
  | "artifact-consent-required"
  | "artifact-private-root-unsafe"
  | "artifact-cache-unsafe"
  | "artifact-capacity-insufficient"
  | "artifact-capacity-unavailable"
  | "artifact-source-failed"
  | "artifact-acquisition-timeout"
  | "artifact-acquisition-aborted"
  | "artifact-size-mismatch"
  | "artifact-hash-mismatch"
  | "artifact-publish-collision"
  | "artifact-publish-failed"
  | "artifact-verification-failed"
  | "artifact-containment-unavailable"
  | "artifact-worker-failed"
  | "artifact-worker-protocol-invalid"
  | "artifact-cleanup-failed"
  | "artifact-execution-capability-invalid"
  | "artifact-execution-validation-failed";

/** Fixed, path-free failure safe to render at a trust boundary. */
export class ArtifactError extends Error {
  readonly code: ArtifactErrorCode;

  constructor(code: ArtifactErrorCode) {
    super(code);
    this.name = "ArtifactError";
    this.code = code;
    this.stack = `${this.name}: ${code}`;
    Object.freeze(this);
  }

  toJSON(): { readonly code: ArtifactErrorCode } {
    return Object.freeze({ code: this.code });
  }
}
