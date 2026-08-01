import { isAbsolute, join, normalize } from "node:path";
import { ArtifactError } from "./errors.js";

export interface ModelArtifactCandidate {
  readonly id: string;
  readonly sourceUrl: string;
  readonly revision: string;
  readonly filename: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly license: "Apache-2.0";
  readonly engine: "llamacpp-completion";
}

export const PINNED_MODEL_CANDIDATE: ModelArtifactCandidate = Object.freeze({
  id: "smollm2-360m-instruct-q8_0",
  sourceUrl:
    "https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/593b5a2e04c8f3e4ee880263f93e0bd2901ad47f/smollm2-360m-instruct-q8_0.gguf",
  revision: "593b5a2e04c8f3e4ee880263f93e0bd2901ad47f",
  filename: "smollm2-360m-instruct-q8_0.gguf",
  byteLength: 386_404_992,
  sha256: "48ab3034d0dd401fbc721eb1df3217902fee7dab9078992d66431f09b7750201",
  license: "Apache-2.0",
  engine: "llamacpp-completion",
});

export interface ArtifactDisclosure {
  readonly candidate: ModelArtifactCandidate;
  readonly destinationPath: string;
  readonly cachePolicy: "reuse-only-after-full-verification";
  readonly effects: readonly [
    "create-private-directory",
    "write-private-file",
    "download-exact-pinned-https-artifact-on-cache-miss",
  ];
}

export function createPinnedArtifactDisclosure(
  privateRoot: string,
): ArtifactDisclosure {
  if (
    typeof privateRoot !== "string" ||
    !isAbsolute(privateRoot) ||
    normalize(privateRoot) !== privateRoot ||
    privateRoot.length > 4_096
  ) {
    throw new ArtifactError("artifact-request-invalid");
  }
  return Object.freeze({
    candidate: PINNED_MODEL_CANDIDATE,
    destinationPath: join(privateRoot, PINNED_MODEL_CANDIDATE.filename),
    cachePolicy: "reuse-only-after-full-verification",
    effects: Object.freeze([
      "create-private-directory",
      "write-private-file",
      "download-exact-pinned-https-artifact-on-cache-miss",
    ] as const),
  });
}
