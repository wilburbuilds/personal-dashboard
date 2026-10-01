import type { Snapshot } from './dashboard';
export function healthSource(bundle: unknown, program?: string, log?: string, now?: Date): Snapshot['sources']['health'];
export function readHealthSource(root?: string): Promise<Snapshot['sources']['health']>;
