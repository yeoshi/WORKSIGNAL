'use client';

import { useEffect, useRef, useState } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface ProfileData {
  userId: string;
  email: string | null;
  name: string | null;
  resumeS3Key: string | null;
  resumeUrl: string | null;
  careerStage: string | null;
  residencyStatus: string | null;
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

function resumeFileName(s3Key: string | null): string {
  if (!s3Key) return 'resume.pdf';
  const parts = s3Key.split('/');
  return parts[parts.length - 1] ?? 'resume.pdf';
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [newResumeUrl, setNewResumeUrl] = useState<string | null>(null);
  const [newResumeKey, setNewResumeKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => r.json())
      .then((data: ProfileData) => setProfile(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      setUploadError('Only PDF files are accepted.');
      return;
    }

    setUploadState('uploading');
    setUploadError(null);

    const formData = new FormData();
    formData.append('resume', file);

    try {
      const res = await fetch('/api/onboarding/resume', {
        method: 'POST',
        body: formData,
      });
      const data = (await res.json()) as { ok?: boolean; s3Key?: string; message?: string };

      if (!res.ok || !data.ok) {
        throw new Error(data.message ?? 'Upload failed');
      }

      setNewResumeKey(data.s3Key ?? null);
      // Re-fetch profile to get fresh pre-signed URL
      const profileRes = await fetch('/api/profile');
      const profileData = (await profileRes.json()) as ProfileData;
      setProfile(profileData);
      setNewResumeUrl(profileData.resumeUrl);
      setUploadState('success');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
      setUploadState('error');
    } finally {
      // Reset file input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const activeResumeUrl = newResumeUrl ?? profile?.resumeUrl ?? null;
  const activeResumeKey = newResumeKey ?? profile?.resumeS3Key ?? null;
  const hasResume = Boolean(activeResumeKey);

  if (loading) {
    return (
      <div className="mx-auto flex max-w-2xl items-center justify-center px-4 py-24">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold text-gray-900">Profile</h1>
      <p className="mt-1 text-sm text-gray-500">
        Your default resume is shown on every job card. You can also upload a custom one per job.
      </p>

      {/* Account info */}
      <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">Account</h2>
        <dl className="mt-4 space-y-3 text-sm">
          {profile?.name ? (
            <div className="flex justify-between">
              <dt className="text-gray-500">Name</dt>
              <dd className="font-medium text-gray-900">{profile.name}</dd>
            </div>
          ) : null}
          {profile?.email ? (
            <div className="flex justify-between">
              <dt className="text-gray-500">Email</dt>
              <dd className="font-medium text-gray-900">{profile.email}</dd>
            </div>
          ) : null}
          {profile?.careerStage ? (
            <div className="flex justify-between">
              <dt className="text-gray-500">Career stage</dt>
              <dd className="font-medium capitalize text-gray-900">
                {profile.careerStage.replace(/_/g, ' ')}
              </dd>
            </div>
          ) : null}
          {profile?.residencyStatus ? (
            <div className="flex justify-between">
              <dt className="text-gray-500">Residency</dt>
              <dd className="font-medium capitalize text-gray-900">
                {profile.residencyStatus.replace(/_/g, ' ')}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      {/* Default resume */}
      <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Default resume</h2>
          {hasResume ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
              Uploaded
            </span>
          ) : (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
              Not set
            </span>
          )}
        </div>

        <p className="mt-2 text-xs text-gray-500">
          This PDF is displayed in the resume panel of every job card as your base resume.
        </p>

        {hasResume ? (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <FileText size={18} className="shrink-0 text-gray-400" />
            <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
              {resumeFileName(activeResumeKey)}
            </span>
            {activeResumeUrl ? (
              <a
                href={activeResumeUrl}
                download
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-xs font-medium text-indigo-600 hover:text-indigo-800"
              >
                Download
              </a>
            ) : null}
          </div>
        ) : null}

        {uploadState === 'success' ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
            <CheckCircle size={16} aria-hidden />
            Resume uploaded successfully — it will appear on all job cards.
          </div>
        ) : null}

        {uploadState === 'error' && uploadError ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">
            <AlertCircle size={16} aria-hidden />
            {uploadError}
          </div>
        ) : null}

        <div className="mt-4">
          <input
            ref={fileInputRef}
            id="resume-upload"
            type="file"
            accept=".pdf,application/pdf"
            className="sr-only"
            onChange={(e) => void handleFileChange(e)}
          />
          <label
            htmlFor="resume-upload"
            className={[
              'inline-flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition',
              uploadState === 'uploading'
                ? 'cursor-not-allowed border-gray-200 text-gray-400'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50',
            ].join(' ')}
          >
            {uploadState === 'uploading' ? (
              <>
                <Loader2 size={15} className="animate-spin" aria-hidden />
                Uploading…
              </>
            ) : (
              <>
                <Upload size={15} aria-hidden />
                {hasResume ? 'Replace resume' : 'Upload resume'} (PDF)
              </>
            )}
          </label>
        </div>
      </section>
    </div>
  );
}
