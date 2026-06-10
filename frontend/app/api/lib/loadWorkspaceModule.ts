import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let tsxRegistered = false;

async function ensureTsxRegistered(): Promise<void> {
  if (tsxRegistered) return;
  const { register } = await import(/* webpackIgnore: true */ 'tsx/esm/api');
  register();
  tsxRegistered = true;
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

export async function loadBackendModule<T>(relativePath: string): Promise<T> {
  await ensureTsxRegistered();
  const root = getMonorepoRoot();
  const abs = path.join(root, 'backend/src', relativePath);
  if (!existsSync(abs)) {
    throw new Error(
      `Agent backend not found at ${abs}. Run the app from the monorepo with backend/ present, or set WORKSIGNAL_ROOT.`,
    );
  }
  return import(/* webpackIgnore: true */ pathToFileURL(abs).href) as Promise<T>;
}
