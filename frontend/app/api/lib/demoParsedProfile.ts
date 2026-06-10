import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ParsedProfile } from '@/app/types/shared';
import { parseResumeText } from './localResumeParser';

export { emptyParsedProfile } from '../../onboarding/lib/parsedProfileDefaults';

function loadRandallProfile(): ParsedProfile {
  const fixturePath = join(
    process.cwd(),
    'app/api/lib/fixtures/randall-koh-resume.txt',
  );
  const text = readFileSync(fixturePath, 'utf-8');
  const parsed = parseResumeText(text);
  if (!parsed) {
    throw new Error('Failed to parse randall-koh-resume.txt fixture');
  }
  return parsed;
}

/** Randall Koh's parsed resume — used as the local demo profile. */
export const DEMO_PARSED_PROFILE: ParsedProfile = loadRandallProfile();
