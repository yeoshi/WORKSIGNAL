export type ProfileSaveResult =
  | { ok: true; savedMinSalary?: number }
  | { ok: false; message: string };

export type ProfileSectionHandle = {
  validateAndSave: () => Promise<ProfileSaveResult>;
};
