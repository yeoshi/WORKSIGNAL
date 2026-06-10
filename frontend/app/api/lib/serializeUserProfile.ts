import type { OnboardingRecord } from '../../onboarding/lib/onboardingStatus';

/** Serialize onboarding / user profile for LLM generation prompts. */
export function serializeUserProfile(record: OnboardingRecord | null): string {
  const profile = record?.profile;
  if (!profile) return 'Profile not available';

  const lines: string[] = [];
  const name = profile.basic_info?.full_name?.trim();
  if (name) lines.push(`Name: ${name}`);
  if (profile.current_role?.trim()) {
    lines.push(`Current role: ${profile.current_role.trim()}`);
  }
  if (typeof profile.years_experience === 'number') {
    lines.push(`Years of experience: ${profile.years_experience}`);
  }
  if (profile.skills?.length) {
    lines.push(`Skills: ${profile.skills.join(', ')}`);
  }
  if (profile.education || profile.university) {
    lines.push(
      `Education: ${[profile.education, profile.university].filter(Boolean).join(' — ')}`,
    );
  }

  const workEntries = [
    ...(profile.work_experience ?? []),
    ...(profile.internships ?? []),
  ];
  if (workEntries.length) {
    lines.push('Work history:');
    for (const entry of workEntries.slice(0, 5)) {
      lines.push(
        `- ${entry.title} at ${entry.company}${entry.description ? `: ${entry.description.slice(0, 120)}` : ''}`,
      );
    }
  }

  if (profile.projects?.length) {
    lines.push('Projects:');
    for (const project of profile.projects.slice(0, 3)) {
      const label = project.project_name || project.title;
      lines.push(
        `- ${label}${project.description ? `: ${project.description.slice(0, 120)}` : ''}`,
      );
    }
  }

  return lines.length ? lines.join('\n') : 'Profile not available';
}

/** Build the same profile string from a raw Users DynamoDB record. */
export function serializeUserProfileFromRecord(
  user: Record<string, unknown> | null | undefined,
): string {
  if (!user) return 'Profile not available';

  const profile = user.profile as OnboardingRecord['profile'] | undefined;
  const name = (user.name as string | undefined)?.trim();

  return serializeUserProfile({
    profile: profile
      ? {
          ...profile,
          basic_info: {
            ...profile.basic_info,
            full_name: profile.basic_info?.full_name ?? name ?? '',
          },
        }
      : undefined,
  } as OnboardingRecord);
}
