import type { Snapshot } from './dashboard';
export function fetchHeadlines(): Promise<Snapshot['sources']['headlines']>;
