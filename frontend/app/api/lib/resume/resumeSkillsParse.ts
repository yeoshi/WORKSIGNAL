const SKILL_STOPWORDS =
  /^(director|manager|mentor|intern|founder|creator|analyst|lead|coordinator|assistant|programming|frameworks|tools|product|analytics|certifications|technical competencies|languages|others|advanced|intermediate|beginner)$/i;

function isRelevantSkill(skill: string): boolean {
  const trimmed = skill.trim();
  if (trimmed.length < 2 || trimmed.length > 40) return false;
  if (/^\d{4}$/.test(trimmed)) return false;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return false;
  if (SKILL_STOPWORDS.test(trimmed)) return false;
  if (/\b(director|manager|mentor|intern|founder)\b/i.test(trimmed)) return false;
  if (!/^[A-Za-z#+.][A-Za-z0-9.+#/\s-]*$/.test(trimmed)) return false;
  return true;
}

function parseCategoryColonLine(line: string, collected: string[]): void {
  const colonMatch = line.match(/^([^:]+):\s*(.+)$/);
  if (!colonMatch) return;

  const category = colonMatch[1].trim();
  const values = colonMatch[2];

  if (SKILL_STOPWORDS.test(category) || /languages?|frameworks?|tools?|libraries?/i.test(category)) {
    for (const token of values.split(/[,;|/]/)) {
      const skill = token.trim();
      if (isRelevantSkill(skill)) collected.push(skill);
    }
  }
}

function parseParentheses(line: string, collected: string[]): void {
  for (const match of line.matchAll(/\(([^)]+)\)/g)) {
    for (const token of match[1].split(/[,|/]/)) {
      const skill = token.trim();
      if (isRelevantSkill(skill)) collected.push(skill);
    }
  }
}

const KNOWN_TECH = [
  'Python',
  'Java',
  'JavaScript',
  'TypeScript',
  'SQL',
  'React',
  'React Native',
  'Node.js',
  'NextJS',
  'Next.js',
  'FastAPI',
  'Tailwind',
  'TailwindCSS',
  'Tailwind CSS',
  'AWS',
  'Tableau',
  'Figma',
  'MongoDB',
  'PostgreSQL',
  'Supabase',
  'Prisma',
  'PHP',
  'Flask',
  'Springboot',
  'Firebase',
  'Salesforce',
  'Jira',
  'Spotfire',
  'Vue.js',
  'Docker',
  'Git',
  'Bootstrap',
  'NumPy',
  'Pandas',
  'Matplotlib',
  'Expo',
  'HTML',
  'CSS',
  'ExpressJS',
  'Express.js',
];

export function parseSkills(skillsBlock: string): string[] {
  if (!skillsBlock) return [];

  const collected: string[] = [];

  for (const line of skillsBlock.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const bulletContent = line.replace(/^[•\-*]\s*/, '').trim();

    parseCategoryColonLine(bulletContent, collected);
    parseParentheses(bulletContent, collected);

    const certMatch = bulletContent.match(/Certifications?:\s*(.+)/i);
    if (certMatch) {
      const cert = certMatch[1].replace(/\.$/, '').trim();
      if (cert.length >= 2 && cert.length <= 80) collected.push(cert);
    }

    // Bullet with "Category: skills" after bullet char
    if (/:/.test(bulletContent)) {
      parseCategoryColonLine(bulletContent, collected);
    }
  }

  for (const skill of KNOWN_TECH) {
    if (new RegExp(`\\b${skill.replace('.', '\\.')}\\b`, 'i').test(skillsBlock)) {
      collected.push(skill);
    }
  }

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const skill of collected) {
    const key = skill.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(skill);
    if (unique.length >= 20) break;
  }
  return unique;
}
