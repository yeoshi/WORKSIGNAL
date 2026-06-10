'use client';

/**
 * Step 4 — Targets + Non-negotiables (Req 4.1, 4.2, 5.1, 5.3).
 */

import { forwardRef, useImperativeHandle, useState } from 'react';
import {
  PRIORITY_FACTORS,
  type EmploymentType,
  type NonNegotiables,
  type PriorityFactor,
  type WorkArrangement,
} from '@worksignal/shared';
import {
  Button,
  CheckboxGroup,
  Field,
  RadioGroup,
  TagInput,
  TextInput,
} from '../../components/onboarding/controls';
import { PriorityRanking } from '../../components/onboarding/PriorityRanking';
import type {
  ProfileSaveResult,
  ProfileSectionHandle,
} from '../lib/profileSectionHandle';
import { validateMinSalary, validatePriorityRanking } from '../validation';
import { saveTargets, type TargetsPayload } from '../api';

const EMPLOYMENT_TYPES: ReadonlyArray<{ value: EmploymentType; label: string }> = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'part_time', label: 'Part-time' },
];

/** Whole SGD/month — salary inputs are integers, not floats. */
function parseMinSalary(raw: string): number {
  return Math.round(Number(raw.trim()));
}

const WORK_ARRANGEMENTS: ReadonlyArray<{
  value: WorkArrangement;
  label: string;
  description: string;
}> = [
  { value: 'any', label: 'Any', description: 'No preference' },
  { value: 'hybrid_remote', label: 'Hybrid / remote', description: 'Some remote days' },
  { value: 'fully_remote', label: 'Fully remote', description: 'Remote only' },
];

export interface TargetsStepProps {
  requiresSponsorship: boolean;
  onComplete: (payload: TargetsPayload) => void;
  onBack: () => void;
  initialValue?: Partial<TargetsPayload>;
  submitLabel?: string;
  embedded?: boolean;
  hideFooter?: boolean;
}

export const TargetsStep = forwardRef<ProfileSectionHandle, TargetsStepProps>(
  function TargetsStep(
    {
      requiresSponsorship,
      onComplete,
      onBack,
      initialValue,
      submitLabel = 'Finish onboarding',
      embedded = false,
      hideFooter = false,
    },
    ref,
  ) {
    const nn = initialValue?.non_negotiables;
    const [roles, setRoles] = useState<string[]>(initialValue?.target_roles ?? []);
    const [industries, setIndustries] = useState<string[]>(
      initialValue?.target_industries ?? [],
    );
    const [dreamCompanies, setDreamCompanies] = useState<string[]>(
      initialValue?.dream_companies ?? [],
    );
    const [ranking, setRanking] = useState<PriorityFactor[]>(
      initialValue?.priority_ranking ?? [...PRIORITY_FACTORS],
    );
    const [minSalary, setMinSalary] = useState(
      nn?.min_salary != null ? String(nn.min_salary) : '',
    );
    const [employmentTypes, setEmploymentTypes] = useState<EmploymentType[]>(
      nn?.employment_type?.length ? nn.employment_type : ['full_time'],
    );
    const [workArrangement, setWorkArrangement] = useState<WorkArrangement>(
      nn?.work_arrangement ?? 'any',
    );
    const [custom, setCustom] = useState<string[]>(nn?.custom ?? []);

    const [errors, setErrors] = useState<{
      roles?: string;
      ranking?: string;
      salary?: string;
      employment?: string;
      submit?: string;
    }>({});
    const [busy, setBusy] = useState(false);

    function buildPayload(): TargetsPayload {
      return {
        target_roles: roles,
        target_industries: industries,
        dream_companies: dreamCompanies,
        priority_ranking: ranking,
        non_negotiables: {
          min_salary: parseMinSalary(minSalary),
          employment_type: employmentTypes,
          work_arrangement: workArrangement,
          custom,
          ep_sponsorship_required: requiresSponsorship,
        },
      };
    }

    function validate(): { ok: true } | { ok: false; message: string } {
      const nextErrors: typeof errors = {};

      if (roles.length === 0) {
        nextErrors.roles = 'Add at least one target role.';
      }

      const rankingResult = validatePriorityRanking(ranking);
      if (!rankingResult.ok) nextErrors.ranking = rankingResult.message;

      const salaryResult = validateMinSalary(minSalary);
      if (!salaryResult.ok) nextErrors.salary = salaryResult.message;

      if (employmentTypes.length === 0) {
        nextErrors.employment = 'Select at least one employment type.';
      }

      setErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) {
        const message =
          nextErrors.roles ??
          nextErrors.ranking ??
          nextErrors.salary ??
          nextErrors.employment ??
          'Complete the Targets section.';
        return { ok: false, message };
      }

      return { ok: true };
    }

    async function persist(payload: TargetsPayload): Promise<ProfileSaveResult> {
      setBusy(true);
      const result = await saveTargets(payload);
      setBusy(false);

      if (!result.ok) {
        setErrors((e) => ({ ...e, submit: result.message }));
        return { ok: false, message: result.message };
      }

      const savedMinSalary = result.data?.min_salary;
      const requestedMinSalary = payload.non_negotiables.min_salary;
      if (
        typeof savedMinSalary === 'number' &&
        savedMinSalary !== requestedMinSalary
      ) {
        const message = `Minimum salary saved as $${savedMinSalary.toLocaleString()} instead of $${requestedMinSalary.toLocaleString()}.`;
        setErrors((e) => ({ ...e, submit: message }));
        return { ok: false, message };
      }

      return { ok: true, savedMinSalary: savedMinSalary ?? requestedMinSalary };
    }

    useImperativeHandle(ref, () => ({
      async validateAndSave() {
        const validation = validate();
        if (!validation.ok) return validation;
        return persist(buildPayload());
      },
    }));

    async function handleSubmit() {
      const validation = validate();
      if (!validation.ok) return;

      const payload = buildPayload();
      const saveResult = await persist(payload);
      if (!saveResult.ok) return;

      onComplete(payload);
    }

    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="font-wordmark text-2xl font-semibold text-ws-ink">
            Targets &amp; non-negotiables
          </h2>
          <p className="text-sm text-ws-muted">
            Tell the agents what you&apos;re aiming for and the hard limits they can
            never cross.
          </p>
        </div>

        <Field
          label="Target roles"
          htmlFor="target-roles"
          hint="Press Enter to add each role"
          error={errors.roles}
        >
          <TagInput
            id="target-roles"
            values={roles}
            onChange={(v) => {
              setRoles(v);
              setErrors((e) => ({ ...e, roles: undefined }));
            }}
            placeholder="e.g. Product Manager"
          />
        </Field>

        <Field label="Target industries" htmlFor="target-industries">
          <TagInput
            id="target-industries"
            values={industries}
            onChange={setIndustries}
            placeholder="e.g. Fintech"
          />
        </Field>

        <Field label="Dream companies" htmlFor="dream-companies">
          <TagInput
            id="dream-companies"
            values={dreamCompanies}
            onChange={setDreamCompanies}
            placeholder="e.g. Grab"
          />
        </Field>

        <Field
          label="What matters most"
          hint="Drag rows to rank the six factors from most to least important"
          error={errors.ranking}
        >
          <PriorityRanking ranking={ranking} onChange={setRanking} />
        </Field>

        <Field
          label="Minimum monthly salary (SGD)"
          htmlFor="min-salary"
          error={errors.salary}
        >
          <TextInput
            id="min-salary"
            type="text"
            inputMode="numeric"
            value={minSalary}
            onChange={(v) => {
              setMinSalary(v.replace(/[^\d]/g, ''));
              setErrors((e) => ({ ...e, salary: undefined }));
            }}
            placeholder="e.g. 5000"
            invalid={Boolean(errors.salary)}
          />
        </Field>

        <Field label="Employment types" error={errors.employment}>
          <CheckboxGroup
            name="employment-types"
            values={employmentTypes}
            options={EMPLOYMENT_TYPES}
            onChange={(v) => {
              setEmploymentTypes(v);
              setErrors((e) => ({ ...e, employment: undefined }));
            }}
          />
        </Field>

        <Field label="Work arrangement">
          <RadioGroup
            name="work-arrangement"
            value={workArrangement}
            options={WORK_ARRANGEMENTS}
            onChange={setWorkArrangement}
          />
        </Field>

        <Field
          label="Custom dealbreakers"
          htmlFor="custom-dealbreakers"
          hint="Optional — anything that should always disqualify a job"
        >
          <TagInput
            id="custom-dealbreakers"
            values={custom}
            onChange={setCustom}
            placeholder="e.g. No commission-only roles"
          />
        </Field>

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
            <Button onClick={handleSubmit} disabled={busy}>
              {busy ? 'Saving…' : submitLabel}
            </Button>
          </div>
        )}
      </div>
    );
  },
);
