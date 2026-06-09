'use client';

/**
 * Step 3 — About you (Req 3.1, 3.2, 3.3).
 *
 * Collects exactly one Career_Stage and exactly one Residency_Status. When the
 * user selects `career_switcher`, the source ("from") and target ("to") fields
 * become required (Req 3.3) and are validated before the step can advance.
 */
import { useState } from 'react';
import type { CareerStage, ResidencyStatus } from '@worksignal/shared';
import {
  Button,
  Field,
  RadioGroup,
  TextInput,
} from '../../components/onboarding/controls';
import { validateCareerSwitch } from '../validation';
import { saveCareerProfile } from '../api';

const CAREER_STAGES: ReadonlyArray<{
  value: CareerStage;
  label: string;
  description: string;
}> = [
  { value: 'fresh_grad', label: 'Fresh graduate', description: 'Just finished studying' },
  { value: 'early_career', label: 'Early career', description: '1–4 years of experience' },
  { value: 'mid_career', label: 'Mid career', description: '5–9 years of experience' },
  { value: 'senior', label: 'Senior', description: '10+ years of experience' },
  {
    value: 'career_switcher',
    label: 'Career switcher',
    description: 'Moving into a new field',
  },
];

const RESIDENCY_OPTIONS: ReadonlyArray<{
  value: ResidencyStatus;
  label: string;
  description: string;
}> = [
  { value: 'citizen', label: 'Singapore citizen', description: '' },
  { value: 'pr', label: 'Permanent resident', description: '' },
  { value: 'ep_holder', label: 'Employment Pass holder', description: '' },
  {
    value: 'need_sponsorship',
    label: 'Need sponsorship',
    description: 'Requires an Employment Pass to work in Singapore',
  },
];

export interface AboutYouValue {
  career_stage: CareerStage;
  residency_status: ResidencyStatus;
  career_switch_context?: { from: string; to: string };
}

export function AboutYouStep({
  onComplete,
  onBack,
}: {
  onComplete: (value: AboutYouValue) => void;
  onBack: () => void;
}) {
  const [stage, setStage] = useState<CareerStage | null>(null);
  const [residency, setResidency] = useState<ResidencyStatus | null>(null);
  const [switchFrom, setSwitchFrom] = useState('');
  const [switchTo, setSwitchTo] = useState('');
  const [errors, setErrors] = useState<{
    stage?: string;
    residency?: string;
    switch?: string;
    submit?: string;
  }>({});
  const [busy, setBusy] = useState(false);

  const isSwitcher = stage === 'career_switcher';

  async function handleContinue() {
    const nextErrors: typeof errors = {};
    if (!stage) nextErrors.stage = 'Select your career stage.';
    if (!residency) nextErrors.residency = 'Select your residency status.';

    if (stage) {
      const switchResult = validateCareerSwitch(stage, switchFrom, switchTo);
      if (!switchResult.ok) nextErrors.switch = switchResult.message;
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !stage || !residency) return;

    const value: AboutYouValue = {
      career_stage: stage,
      residency_status: residency,
      ...(isSwitcher
        ? { career_switch_context: { from: switchFrom.trim(), to: switchTo.trim() } }
        : {}),
    };

    setBusy(true);
    const result = await saveCareerProfile(value);
    setBusy(false);

    if (!result.ok) {
      setErrors((e) => ({
        ...e,
        submit: result.message,
      }));
      return;
    }

    onComplete(value);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-gray-900">About you</h2>
        <p className="text-sm text-gray-500">
          This calibrates how the agents evaluate jobs for your situation.
        </p>
      </div>

      <Field label="Career stage" error={errors.stage}>
        <RadioGroup
          name="career-stage"
          value={stage}
          options={CAREER_STAGES}
          onChange={(v) => {
            setStage(v);
            setErrors((e) => ({ ...e, stage: undefined }));
          }}
        />
      </Field>

      {isSwitcher && (
        <div className="grid gap-4 rounded-lg border border-indigo-100 bg-indigo-50/50 p-4 sm:grid-cols-2">
          <Field
            label="Switching from"
            htmlFor="switch-from"
            hint="Your current or previous field"
            error={errors.switch && switchFrom.trim() === '' ? errors.switch : undefined}
          >
            <TextInput
              id="switch-from"
              value={switchFrom}
              onChange={(v) => {
                setSwitchFrom(v);
                setErrors((e) => ({ ...e, switch: undefined }));
              }}
              placeholder="e.g. Accounting"
              invalid={Boolean(errors.switch) && switchFrom.trim() === ''}
            />
          </Field>
          <Field
            label="Switching to"
            htmlFor="switch-to"
            hint="The field you want to move into"
            error={errors.switch && switchTo.trim() === '' ? errors.switch : undefined}
          >
            <TextInput
              id="switch-to"
              value={switchTo}
              onChange={(v) => {
                setSwitchTo(v);
                setErrors((e) => ({ ...e, switch: undefined }));
              }}
              placeholder="e.g. Data Analytics"
              invalid={Boolean(errors.switch) && switchTo.trim() === ''}
            />
          </Field>
          {errors.switch && (
            <p role="alert" className="text-xs font-medium text-red-600 sm:col-span-2">
              {errors.switch}
            </p>
          )}
        </div>
      )}

      <Field label="Residency status" error={errors.residency}>
        <RadioGroup
          name="residency-status"
          value={residency}
          options={RESIDENCY_OPTIONS}
          onChange={(v) => {
            setResidency(v);
            setErrors((e) => ({ ...e, residency: undefined }));
          }}
        />
      </Field>

      {errors.submit && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {errors.submit}
        </p>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleContinue} disabled={busy}>
          {busy ? 'Saving…' : 'Continue'}
        </Button>
      </div>
    </div>
  );
}
