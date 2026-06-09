/** Extract a display-friendly filename from an S3 key or path. */
export function resumeFileName(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return 'resume.pdf';
  const parts = trimmed.split('/');
  return parts[parts.length - 1] || trimmed;
}
