export const CANCELLATION_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

export type CancellationSignal = (typeof CANCELLATION_SIGNALS)[number];

export interface CancellationSignalHost {
  on(signal: CancellationSignal, listener: () => void): unknown;
  off(signal: CancellationSignal, listener: () => void): unknown;
}

/**
 * Keep every cancellation handler installed until the caller explicitly
 * removes it. Repeated signals therefore remain handled while asynchronous
 * child cleanup is still settling instead of restoring default termination.
 */
export function installCancellationSignalHandlers(
  host: CancellationSignalHost,
  listener: () => void,
): () => void {
  for (const signal of CANCELLATION_SIGNALS) host.on(signal, listener);

  let installed = true;
  return () => {
    if (!installed) return;
    installed = false;
    for (const signal of CANCELLATION_SIGNALS) host.off(signal, listener);
  };
}
