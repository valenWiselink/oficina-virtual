/**
 * Which run of the office server this page belongs to: the `serverHello` id
 * of its first connection (server/src/serverBoot.ts). The terminal sockets
 * carry it so a restarted server refuses them, and a later connection that
 * names another run means every agent id this page holds is stale.
 */
let known: string | null = null;

export type BootVerdict = 'first' | 'same' | 'restarted';

/** Judge a connection's run against the one this page knows (and learn the
 *  first). A restarted verdict leaves the old one: the page is about to go. */
export function meetServerRun(bootId: string): BootVerdict {
  if (known === null) {
    known = bootId;
    return 'first';
  }
  return bootId === known ? 'same' : 'restarted';
}

/** The run this page belongs to, or null before the first hello (or with a
 *  server too old to say). */
export function knownServerRun(): string | null {
  return known;
}

/** Tests only: forget the run. */
export function resetServerRunForTests(): void {
  known = null;
}
