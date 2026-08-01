export interface ParentIpcProcess {
  readonly pid: number;
  readonly platform: NodeJS.Platform;
  readonly connected: boolean;
  once(event: "disconnect", listener: () => void): unknown;
  off(event: "disconnect", listener: () => void): unknown;
  kill(pid: number, signal: "SIGKILL"): boolean;
  exit(code: number): never;
}

/**
 * Arm a last-resort child-side containment boundary across and after IPC
 * bootstrap.
 *
 * The executor child is a POSIX process-group leader. If its supervising parent
 * disappears, SIGKILL the complete group atomically so QVAC/Bare descendants
 * cannot survive the child. A normal lifecycle must disarm this listener before
 * deliberately closing IPC.
 */
export function installParentDisconnectFailSafe(
  host: ParentIpcProcess,
): () => void {
  if (host.platform === "win32") return () => {};

  let armed = true;
  const onDisconnect = (): void => {
    if (!armed) return;
    armed = false;
    try {
      host.kill(-host.pid, "SIGKILL");
    } catch {
      // The production launcher makes this process the group leader. If that
      // invariant was unexpectedly lost, at least fail closed in this process.
      try {
        host.kill(host.pid, "SIGKILL");
      } catch {
        host.exit(1);
      }
    }
  };

  host.once("disconnect", onDisconnect);
  // Register before checking so a disconnect racing installation cannot fall
  // between the state check and listener registration.
  if (!host.connected) onDisconnect();
  return () => {
    if (!armed) return;
    armed = false;
    host.off("disconnect", onDisconnect);
  };
}
