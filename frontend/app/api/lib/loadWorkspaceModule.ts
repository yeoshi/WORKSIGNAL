import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let tsxRegistered = false;

function getStagedRoot(): string {
  return path.join(process.cwd(), '.worksignal');
}

function getStagedBackendSrc(): string {
  return path.join(getStagedRoot(), 'backend/src');
}

function getStagedTsconfig(): string {
  return path.join(getStagedRoot(), 'tsconfig.json');
}

function getMonorepoRoot(): string {
  if (process.env.WORKSIGNAL_ROOT) {
    return process.env.WORKSIGNAL_ROOT;
  }

  const candidates = [
    path.resolve(process.cwd(), '..'),
    process.cwd(),
    path.resolve(process.cwd(), '../..'),
  ];

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'backend/src'))) {
      return candidate;
    }
  }

  return path.resolve(process.cwd(), '..');
}

function getBackendSrcRoot(): string {
  const staged = getStagedBackendSrc();
  if (existsSync(staged)) {
    return staged;
  }
  return path.join(getMonorepoRoot(), 'backend/src');
}

async function ensureTsxRegistered(): Promise<void> {
  if (tsxRegistered) return;
  const { register } = await import(/* webpackIgnore: true */ 'tsx/esm/api');
  const tsconfig = getStagedTsconfig();
  if (existsSync(tsconfig)) {
    register({ tsconfig });
  } else {
    register();
  }
  tsxRegistered = true;
}

export async function loadBackendModule<T>(relativePath: string): Promise<T> {
  await ensureTsxRegistered();
  const abs = path.join(getBackendSrcRoot(), relativePath);
  if (!existsSync(abs)) {
    throw new Error(
      `Agent backend not found at ${abs}. Rebuild the frontend so agent sources are staged, or run from the monorepo locally.`,
    );
  }
  return import(/* webpackIgnore: true */ pathToFileURL(abs).href) as Promise<T>;
}
