import type { ProjectEntry, WorkExperienceEntry } from '@/app/types/shared';

function isBullet(line: string): boolean {
  return /^[•\-*]\s/.test(line);
}

function stripBullet(line: string): string {
  return line.replace(/^[•\-*]\s*/, '').trim();
}

/** "CallBridge - Accessibility App" or "TravelLah! - Group Travel Web App" */
function looksLikeProjectHeader(line: string): boolean {
  if (isBullet(line)) return false;
  if (/^tech stack:/i.test(line)) return false;

  if (/^[A-Z][A-Za-z0-9!'&\s]+?\s+-\s+[A-Z]/.test(line)) {
    return true;
  }

  // Standalone title (may include parentheses), not a sentence fragment
  if (
    /^[A-Z][A-Za-z0-9!'"(),&\s-]{4,120}$/.test(line) &&
    !/\.\s*$/.test(line)
  ) {
    return true;
  }

  return false;
}

/** PDF line-wrap continuation of a bullet or sentence fragment. */
function isContinuationLine(line: string): boolean {
  if (isBullet(line) || looksLikeProjectHeader(line)) return false;

  if (/^[a-z(["']/.test(line)) return true;

  // Sentence fragment ending with a period, not a titled header
  if (/\.\s*$/.test(line) && !/\s-\s/.test(line) && line.length < 100) {
    return true;
  }

  return false;
}

function appendContinuation(bullets: string[], line: string): void {
  if (bullets.length === 0) {
    bullets.push(line);
    return;
  }
  bullets[bullets.length - 1] = `${bullets[bullets.length - 1]} ${line}`.trim();
}

export function parseProjects(projectBlock: string): ProjectEntry[] {
  const lines = projectBlock.split('\n').map((l) => l.trim()).filter(Boolean);
  const projects: ProjectEntry[] = [];
  let current: ProjectEntry | null = null;
  const bullets: string[] = [];

  function flush() {
    if (!current) return;
    current.description = bullets.join('\n');
    projects.push(current);
    current = null;
    bullets.length = 0;
  }

  for (const line of lines) {
    if (isBullet(line)) {
      bullets.push(stripBullet(line));
      continue;
    }

    if (/^tech stack:/i.test(line)) {
      bullets.push(line);
      continue;
    }

    if (current && isContinuationLine(line)) {
      appendContinuation(bullets, line);
      continue;
    }

    if (!looksLikeProjectHeader(line)) {
      if (current) {
        appendContinuation(bullets, line);
      }
      continue;
    }

    flush();
    current = {
      project_name: line,
      title: '',
      start: '',
      end: '',
      url: '',
      description: '',
    };
  }

  flush();
  return projects;
}

function normalizeCompanyToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Drop projects that duplicate a company already listed in work or internships. */
export function dedupeProjectsAgainstJobs(
  projects: ProjectEntry[],
  work: WorkExperienceEntry[],
  internships: WorkExperienceEntry[],
): ProjectEntry[] {
  const companyTokens = new Set<string>();
  for (const entry of [...work, ...internships]) {
    const token = normalizeCompanyToken(entry.company);
    if (token) companyTokens.add(token);
  }

  return projects.filter((project) => {
    const prefix = project.project_name.split(/\s+-\s+/)[0]?.trim() ?? project.project_name;
    const nameToken = normalizeCompanyToken(prefix);

    for (const company of companyTokens) {
      if (nameToken === company || nameToken.startsWith(company)) {
        return false;
      }
    }

    return true;
  });
}
