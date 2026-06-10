/** Extract the filename segment from an S3 object key (last path segment). */
export function deriveFileNameFromS3Key(key?: string): string | undefined {
  if (!key) return undefined;
  const segment = key.split('/').pop()?.trim();
  return segment || undefined;
}
