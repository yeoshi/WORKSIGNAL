'use client';

/**
 * Confirm parsed or manually entered resume profile before continuing (Req 2.2, 2.4).
 */

import { forwardRef, useImperativeHandle, useState } from 'react';
import type {
  EducationEntry,
  HonorAwardEntry,
  LanguageSkillEntry,
  ParsedProfile,
  ProjectEntry,
  ResumeBasicInfo,
  SnsLinkEntry,
  WorkExperienceEntry,
  WorkSampleEntry,
} from '@worksignal/shared';
import {
  Button,
  DateRangeFields,
  Field,
  RepeatableSection,
  Select,
  TagInput,
  Textarea,
  TextInput,
} from '../../components/onboarding/controls';
import { saveResumeProfile } from '../api';
import type {
  ProfileSaveResult,
  ProfileSectionHandle,
} from '../lib/profileSectionHandle';
import {
  deriveLegacyEducation,
  emptyEducationEntry,
  emptyHonorAwardEntry,
  emptyLanguageSkillEntry,
  emptyParsedProfile,
  emptyProjectEntry,
  emptySnsLinkEntry,
  emptyWorkExperienceEntry,
  emptyWorkSampleEntry,
} from '../lib/parsedProfileDefaults';
import {
  deriveHeadlineRole,
  deriveYearsExperience,
  hasValidWorkExperience,
} from '../lib/resumeProfileDerivation';

export interface ResumeConfirmStepProps {
  initialProfile?: ParsedProfile | null;
  resumeS3Key?: string;
  manualEntry?: boolean;
  onBack: () => void;
  onComplete: () => void;
  submitLabel?: string;
  embedded?: boolean;
  hideFooter?: boolean;
  /** When false, work experience may be left blank (profile edit). */
  requireWorkExperience?: boolean;
}

const LANGUAGE_PROFICIENCY_OPTIONS = [
  { value: 'native_or_bilingual', label: 'Native or bilingual' },
  { value: 'professional_working', label: 'Professional working' },
  { value: 'limited_working', label: 'Limited working' },
  { value: 'elementary', label: 'Elementary' },
] as const;

const SNS_PLATFORM_OPTIONS = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'github', label: 'GitHub' },
  { value: 'portfolio', label: 'Portfolio' },
  { value: 'twitter', label: 'Twitter / X' },
  { value: 'other', label: 'Other' },
] as const;

export const ResumeConfirmStep = forwardRef<ProfileSectionHandle, ResumeConfirmStepProps>(
  function ResumeConfirmStep(
    {
      initialProfile,
      resumeS3Key,
      manualEntry = false,
      onBack,
      onComplete,
      submitLabel = 'Confirm & continue',
      embedded = false,
      hideFooter = false,
      requireWorkExperience = true,
    },
    ref,
  ) {
  const empty = emptyParsedProfile();
  const seed: ParsedProfile = {
    ...empty,
    ...initialProfile,
    basic_info: { ...empty.basic_info!, ...initialProfile?.basic_info },
  };

  const [skills, setSkills] = useState<string[]>(seed.skills);
  const [basicInfo, setBasicInfo] = useState<ResumeBasicInfo>(seed.basic_info!);
  const [educationHistory, setEducationHistory] = useState<EducationEntry[]>(seed.education_history!);
  const [workExperience, setWorkExperience] = useState<WorkExperienceEntry[]>(seed.work_experience!);
  const [internships, setInternships] = useState<WorkExperienceEntry[]>(seed.internships!);
  const [projects, setProjects] = useState<ProjectEntry[]>(seed.projects!);
  const [workSamples, setWorkSamples] = useState<WorkSampleEntry[]>(seed.work_samples!);
  const [honorsAwards, setHonorsAwards] = useState<HonorAwardEntry[]>(seed.honors_awards!);
  const [languages, setLanguages] = useState<LanguageSkillEntry[]>(seed.languages!);
  const [selfIntroduction, setSelfIntroduction] = useState(seed.self_introduction ?? '');
  const [snsLinks, setSnsLinks] = useState<SnsLinkEntry[]>(seed.sns_links!);
  const [errors, setErrors] = useState<{ work?: string; submit?: string }>({});
  const [busy, setBusy] = useState(false);

  function validate(): { ok: true } | { ok: false; message: string } {
    const nextErrors: typeof errors = {};
    if (
      requireWorkExperience &&
      !hasValidWorkExperience(workExperience)
    ) {
      nextErrors.work = 'Add at least one work experience entry with company and title.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return {
        ok: false,
        message:
          nextErrors.work ?? 'Complete the parsed profile details section.',
      };
    }

    return { ok: true };
  }

  async function persist(): Promise<ProfileSaveResult> {
    const { education, university } = deriveLegacyEducation(educationHistory);
    const currentRole = deriveHeadlineRole(workExperience, internships, projects);
    const years = deriveYearsExperience(workExperience, internships);

    setBusy(true);
    const result = await saveResumeProfile({
      current_role: currentRole,
      years_experience: years,
      skills,
      education,
      university,
      basic_info: { ...basicInfo, preferred_location: 'Singapore' },
      education_history: educationHistory,
      work_experience: workExperience,
      internships,
      projects,
      work_samples: workSamples,
      honors_awards: honorsAwards,
      languages,
      self_introduction: selfIntroduction,
      sns_links: snsLinks,
      resume_s3_key: resumeS3Key,
    });
    setBusy(false);

    if (!result.ok) {
      setErrors((e) => ({ ...e, submit: result.message }));
      return { ok: false, message: result.message };
    }

    return { ok: true };
  }

  useImperativeHandle(ref, () => ({
    async validateAndSave() {
      const validation = validate();
      if (!validation.ok) return validation;
      return persist();
    },
  }));

  async function handleConfirm() {
    const validation = validate();
    if (!validation.ok) return;

    const saveResult = await persist();
    if (!saveResult.ok) return;

    onComplete();
  }

  return (
    <div className="flex flex-col gap-6">
      {!embedded && (
        <div className="flex flex-col gap-2">
          <h2 className="font-wordmark text-2xl font-semibold text-ws-ink">Confirm your details</h2>
          <p className="text-sm text-ws-muted">
            {manualEntry
              ? 'Enter your background so the agents can evaluate jobs against your experience.'
              : 'Review what we extracted from your resume. Edit anything that looks off before continuing.'}
          </p>
        </div>
      )}

      {/* Basic Information */}
      <div className="flex flex-col gap-3">
        <h3 className="ws-section-label">Basic Information</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="basic-full-name">
            <TextInput
              id="basic-full-name"
              value={basicInfo.full_name}
              onChange={(v) => setBasicInfo((b) => ({ ...b, full_name: v }))}
              placeholder="e.g. Alex Tan"
            />
          </Field>
          <Field label="Mobile number" htmlFor="basic-mobile">
            <TextInput
              id="basic-mobile"
              value={basicInfo.mobile}
              onChange={(v) => setBasicInfo((b) => ({ ...b, mobile: v }))}
              placeholder="e.g. +65 9123 4567"
            />
          </Field>
          <Field label="Email" htmlFor="basic-email">
            <TextInput
              id="basic-email"
              value={basicInfo.email}
              onChange={(v) => setBasicInfo((b) => ({ ...b, email: v }))}
              placeholder="e.g. alex@example.com"
            />
          </Field>
        </div>
      </div>

      {/* Education */}
      <div className="flex flex-col gap-3">
        <h3 className="ws-section-label">Education</h3>
        <RepeatableSection<EducationEntry>
          items={educationHistory}
          onChange={setEducationHistory}
          createItem={emptyEducationEntry}
          addLabel="Add education"
          renderItem={(item, update, index) => (
            <>
              <Field label="School" htmlFor={`edu-school-${index}`}>
                <TextInput
                  id={`edu-school-${index}`}
                  value={item.school}
                  onChange={(v) => update({ school: v })}
                  placeholder="e.g. National University of Singapore"
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Faculty" htmlFor={`edu-faculty-${index}`}>
                  <TextInput
                    id={`edu-faculty-${index}`}
                    value={item.faculty}
                    onChange={(v) => update({ faculty: v })}
                    placeholder="e.g. School of Computing"
                  />
                </Field>
                <Field label="Degree" htmlFor={`edu-degree-${index}`}>
                  <TextInput
                    id={`edu-degree-${index}`}
                    value={item.degree}
                    onChange={(v) => update({ degree: v })}
                    placeholder="e.g. Bachelor of Science"
                  />
                </Field>
              </div>
              <Field label="Field of study" htmlFor={`edu-field-${index}`}>
                <TextInput
                  id={`edu-field-${index}`}
                  value={item.field_of_study}
                  onChange={(v) => update({ field_of_study: v })}
                  placeholder="e.g. Computer Science"
                />
              </Field>
              <Field label="Duration">
                <DateRangeFields
                  start={item.start}
                  end={item.end}
                  onChangeStart={(v) => update({ start: v })}
                  onChangeEnd={(v) => update({ end: v })}
                />
              </Field>
            </>
          )}
        />
      </div>

      {/* Work Experience */}
      <div className="flex flex-col gap-3">
        <h3 className="ws-section-label">
          Work Experience
          {!requireWorkExperience && (
            <span className="ml-1 font-normal text-ws-muted">(optional)</span>
          )}
        </h3>
        {errors.work && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {errors.work}
          </p>
        )}
        <RepeatableSection<WorkExperienceEntry>
          items={workExperience}
          onChange={(items) => {
            setWorkExperience(items);
            setErrors((e) => ({ ...e, work: undefined }));
          }}
          createItem={emptyWorkExperienceEntry}
          addLabel="Add work experience"
          renderItem={(item, update, index) => (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Company" htmlFor={`work-company-${index}`}>
                  <TextInput
                    id={`work-company-${index}`}
                    value={item.company}
                    onChange={(v) => update({ company: v })}
                    placeholder="e.g. Razer Inc."
                  />
                </Field>
                <Field label="Title" htmlFor={`work-title-${index}`}>
                  <TextInput
                    id={`work-title-${index}`}
                    value={item.title}
                    onChange={(v) => update({ title: v })}
                    placeholder="e.g. Product Manager"
                  />
                </Field>
              </div>
              <Field label="Duration">
                <DateRangeFields
                  start={item.start}
                  end={item.end}
                  onChangeStart={(v) => update({ start: v })}
                  onChangeEnd={(v) => update({ end: v })}
                />
              </Field>
              <Field label="Description" htmlFor={`work-desc-${index}`}>
                <Textarea
                  id={`work-desc-${index}`}
                  value={item.description}
                  onChange={(v) => update({ description: v })}
                  rows={3}
                  placeholder="What did you do and what was the impact?"
                />
              </Field>
            </>
          )}
        />
      </div>

      {/* Internship Experience */}
      <div className="flex flex-col gap-3">
        <h3 className="ws-section-label">Internship Experience</h3>
        <RepeatableSection<WorkExperienceEntry>
          items={internships}
          onChange={setInternships}
          createItem={emptyWorkExperienceEntry}
          addLabel="Add internship"
          renderItem={(item, update, index) => (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Company" htmlFor={`intern-company-${index}`}>
                  <TextInput
                    id={`intern-company-${index}`}
                    value={item.company}
                    onChange={(v) => update({ company: v })}
                    placeholder="e.g. SGAG Media Pte. Ltd."
                  />
                </Field>
                <Field label="Title" htmlFor={`intern-title-${index}`}>
                  <TextInput
                    id={`intern-title-${index}`}
                    value={item.title}
                    onChange={(v) => update({ title: v })}
                    placeholder="e.g. Product Management Intern"
                  />
                </Field>
              </div>
              <Field label="Duration">
                <DateRangeFields
                  start={item.start}
                  end={item.end}
                  onChangeStart={(v) => update({ start: v })}
                  onChangeEnd={(v) => update({ end: v })}
                />
              </Field>
              <Field label="Description" htmlFor={`intern-desc-${index}`}>
                <Textarea
                  id={`intern-desc-${index}`}
                  value={item.description}
                  onChange={(v) => update({ description: v })}
                  rows={3}
                  placeholder="What did you do and what was the impact?"
                />
              </Field>
            </>
          )}
        />
      </div>

      {/* Project Experience */}
      <div className="flex flex-col gap-3">
        <h3 className="ws-section-label">Project Experience</h3>
        <RepeatableSection<ProjectEntry>
          items={projects}
          onChange={setProjects}
          createItem={emptyProjectEntry}
          addLabel="Add project"
          renderItem={(item, update, index) => (
            <>
              <Field label="Project name" htmlFor={`proj-name-${index}`}>
                <TextInput
                  id={`proj-name-${index}`}
                  value={item.project_name}
                  onChange={(v) => update({ project_name: v })}
                  placeholder="e.g. Campus Marketplace"
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Your role" htmlFor={`proj-title-${index}`}>
                  <TextInput
                    id={`proj-title-${index}`}
                    value={item.title}
                    onChange={(v) => update({ title: v })}
                    placeholder="e.g. Full-stack Developer"
                  />
                </Field>
                <Field label="Project URL" htmlFor={`proj-url-${index}`}>
                  <TextInput
                    id={`proj-url-${index}`}
                    value={item.url}
                    onChange={(v) => update({ url: v })}
                    placeholder="https://…"
                  />
                </Field>
              </div>
              <Field label="Duration">
                <DateRangeFields
                  start={item.start}
                  end={item.end}
                  onChangeStart={(v) => update({ start: v })}
                  onChangeEnd={(v) => update({ end: v })}
                />
              </Field>
              <Field label="Description" htmlFor={`proj-desc-${index}`}>
                <Textarea
                  id={`proj-desc-${index}`}
                  value={item.description}
                  onChange={(v) => update({ description: v })}
                  rows={3}
                  placeholder="What did you build and what was the outcome?"
                />
              </Field>
            </>
          )}
        />
      </div>

      {/* Work Samples */}
      <div className="flex flex-col gap-3">
        <h3 className="ws-section-label">Work Samples</h3>
        <RepeatableSection<WorkSampleEntry>
          items={workSamples}
          onChange={setWorkSamples}
          createItem={emptyWorkSampleEntry}
          addLabel="Add work sample"
          emptyHint="Link to a portfolio, writing sample, or project demo."
          renderItem={(item, update, index) => (
            <>
              <Field label="URL" htmlFor={`sample-url-${index}`}>
                <TextInput
                  id={`sample-url-${index}`}
                  value={item.url}
                  onChange={(v) => update({ url: v })}
                  placeholder="https://…"
                />
              </Field>
              <Field label="Description" htmlFor={`sample-desc-${index}`}>
                <Textarea
                  id={`sample-desc-${index}`}
                  value={item.description}
                  onChange={(v) => update({ description: v })}
                  rows={2}
                  placeholder="What does this sample show?"
                />
              </Field>
            </>
          )}
        />
      </div>

      {/* Honors and Awards */}
      <div className="flex flex-col gap-3">
        <h3 className="ws-section-label">Honors and Awards</h3>
        <RepeatableSection<HonorAwardEntry>
          items={honorsAwards}
          onChange={setHonorsAwards}
          createItem={emptyHonorAwardEntry}
          addLabel="Add honor or award"
          renderItem={(item, update, index) => (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Title" htmlFor={`honor-title-${index}`}>
                  <TextInput
                    id={`honor-title-${index}`}
                    value={item.title}
                    onChange={(v) => update({ title: v })}
                    placeholder="e.g. Dean's List"
                  />
                </Field>
                <Field label="Date" htmlFor={`honor-date-${index}`}>
                  <TextInput
                    id={`honor-date-${index}`}
                    value={item.date}
                    onChange={(v) => update({ date: v })}
                    placeholder="e.g. 2023"
                  />
                </Field>
              </div>
              <Field label="Description" htmlFor={`honor-desc-${index}`}>
                <Textarea
                  id={`honor-desc-${index}`}
                  value={item.description}
                  onChange={(v) => update({ description: v })}
                  rows={2}
                  placeholder="Optional details"
                />
              </Field>
            </>
          )}
        />
      </div>

      {/* Language Skills */}
      <div className="flex flex-col gap-3">
        <h3 className="ws-section-label">Language Skills</h3>
        <RepeatableSection<LanguageSkillEntry>
          items={languages}
          onChange={setLanguages}
          createItem={emptyLanguageSkillEntry}
          addLabel="Add language"
          renderItem={(item, update, index) => (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Language" htmlFor={`lang-name-${index}`}>
                <TextInput
                  id={`lang-name-${index}`}
                  value={item.language}
                  onChange={(v) => update({ language: v })}
                  placeholder="e.g. English"
                />
              </Field>
              <Field label="Proficiency" htmlFor={`lang-prof-${index}`}>
                <Select
                  id={`lang-prof-${index}`}
                  value={item.proficiency}
                  onChange={(v) => update({ proficiency: v })}
                  options={LANGUAGE_PROFICIENCY_OPTIONS}
                />
              </Field>
            </div>
          )}
        />
      </div>

      {/* Skills */}
      <div className="flex flex-col gap-3">
        <h3 className="ws-section-label">Skills</h3>
        <Field label="Skills" htmlFor="skills" hint="Press Enter to add each skill">
          <TagInput id="skills" values={skills} onChange={setSkills} placeholder="e.g. SQL" />
        </Field>
      </div>

      {/* Self Introduction */}
      <div className="flex flex-col gap-3">
        <h3 className="ws-section-label">Self Introduction</h3>
        <Field label="About you" htmlFor="self-introduction">
          <Textarea
            id="self-introduction"
            value={selfIntroduction}
            onChange={setSelfIntroduction}
            rows={5}
            placeholder="Tell employers a bit about yourself…"
          />
        </Field>
      </div>

      {/* Links */}
      <div className="flex flex-col gap-3">
        <h3 className="ws-section-label">Links</h3>
        <RepeatableSection<SnsLinkEntry>
          items={snsLinks}
          onChange={setSnsLinks}
          createItem={emptySnsLinkEntry}
          addLabel="Add link"
          renderItem={(item, update, index) => (
            <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
              <Field label="Platform" htmlFor={`sns-platform-${index}`}>
                <Select
                  id={`sns-platform-${index}`}
                  value={item.platform}
                  onChange={(v) => update({ platform: v })}
                  options={SNS_PLATFORM_OPTIONS}
                />
              </Field>
              <Field label="URL" htmlFor={`sns-url-${index}`}>
                <TextInput
                  id={`sns-url-${index}`}
                  value={item.url}
                  onChange={(v) => update({ url: v })}
                  placeholder="https://…"
                />
              </Field>
            </div>
          )}
        />
      </div>

      {errors.submit && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {errors.submit}
        </p>
      )}

      {!hideFooter && (
        <div
          className={
            embedded ? 'flex justify-end' : 'flex items-center justify-between'
          }
        >
          {!embedded && (
            <Button variant="ghost" onClick={onBack}>
              Back
            </Button>
          )}
          <Button onClick={handleConfirm} disabled={busy}>
            {busy ? 'Saving…' : submitLabel}
          </Button>
        </div>
      )}
    </div>
  );
},
);
