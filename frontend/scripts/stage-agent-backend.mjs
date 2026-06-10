/**
 * Copy backend + shared TypeScript sources into frontend/.worksignal so the
 * agent pipeline is available on Vercel (where ../backend is not deployed).
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(frontendRoot, '..');
const outRoot = path.join(frontendRoot, '.worksignal');

const backendSrc = path.join(repoRoot, 'backend/src');
const sharedSrc = path.join(repoRoot, 'shared/src');

if (!existsSync(backendSrc)) {
  console.error(`[stage-agent-backend] Missing ${backendSrc}`);
  console.error('Deploy from the monorepo root so backend/ is available at build time.');
  process.exit(1);
}

if (!existsSync(sharedSrc)) {
  console.error(`[stage-agent-backend] Missing ${sharedSrc}`);
  process.exit(1);
}

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });

cpSync(backendSrc, path.join(outRoot, 'backend/src'), { recursive: true });
cpSync(sharedSrc, path.join(outRoot, 'shared/src'), { recursive: true });

writeFileSync(
  path.join(outRoot, 'tsconfig.json'),
  JSON.stringify(
    {
      compilerOptions: {
        module: 'ESNext',
        moduleResolution: 'Bundler',
        target: 'ES2022',
        paths: {
          '@worksignal/shared': ['./shared/src/index.ts'],
          '@worksignal/shared/*': ['./shared/src/*'],
        },
      },
    },
    null,
    2,
  ),
);

console.log(`[stage-agent-backend] Staged agent sources → ${outRoot}`);
