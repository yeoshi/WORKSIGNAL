export type ProfileSaveResult =
  | { ok: true }
  | { ok: false; message: string };

export type ProfileSectionHandle = {
  validateAndSave: () => Promise<ProfileSaveResult>;
};
