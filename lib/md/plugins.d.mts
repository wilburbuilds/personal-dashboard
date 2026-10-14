import type { Plugin } from 'unified';
export const IMG: RegExp;
export function wikiKey(t: string): string;
export const remarkWikilinks: Plugin;
export const remarkCallouts: Plugin;
export function splitFrontmatter(body?: string): { meta: { key: string; values: string[] }[]; content: string };
export function referencedTargets(body?: string): { links: string[]; embeds: string[] };
