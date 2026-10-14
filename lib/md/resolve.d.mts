import type { Refs } from '@/components/home/markdown';
export function resolveTarget(target: string, fromVault?: string): { vault: string; path: string } | null;
export function readVaultFile(vaultId: string, rel: string, opts?: { image?: boolean }): string | Buffer | null;
export function resolveRefs(body: string, fromVault: string, depth?: number): Refs;
