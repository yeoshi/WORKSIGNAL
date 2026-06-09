'use client';

/**
 * Step 4 — Targets + Non-negotiables (Req 4.1, 4.2, 5.1, 5.3).
 *
 * Collects target roles / industries / dream companies, the six-factor priority
 * ranking (Req 4.2), and the hard non-negotiable constraints: minimum monthly
 * salary (validated positive, Req 5.3), accepted employment types, and a work
 * arrangement preference, plus optional custom dealbreakers (Req 5.1).
 */
import { useState } from 'react';
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
import { validateMinSalary, validatePriorityRanking } from '../validation';
import { saveTargets, type TargetsPayload } from '../api';

const EMPLOYMENT_TYPES: ReadonlyArray<{ value: EmploymentType; label: string }> = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'part_time', label: 'Part-time' },
];

const WORK_ARRANGEMENTS: ReadonlyArray<{
  value: WorkArrangement;
  label: string;
  description: string;
}> = [
  { value: 'any', label: 'Any', description: 'No preference' },
  { value: 'hybrid_remote', label: 'Hybrid / remote', description: 'Some remote days' },
  { value: 'fully_remote', label: 'Fully remote', description: 'Remote only' },
];

export function TargetsStep({
  requiresSponsorship,
  onComplete,
  onBack,
}: {
  /** Derived from residency = need_sponsorship; sets ep_sponsorship_required. */
  requiresSponsorship: boolean;
  onComplete: (payload: TargetsPayload) => void;
  onBack: () => void;
}) {
  const [roles, setRoles] = useState<string[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [dreamCompanies, setDreamCompanies] = useState<string[]>([]);
  const [ranking, setRanking] = useState<PriorityFactor[]>([...PRIORITY_FACTORS]);
  const [minSalary, setMinSalary] = useState('');
  const [employmentTypes, setEmploymentTypes] = useState<EmploymentType[]>([
    'full_time',
  ]);
  const [workArrangement, setWorkArrangement] = useState<WorkArrangement>('any');
  const [custom, setCustom] = useState<string[]>([]);

  const [errors, setErrors] = useState<{
    roles?: string;
    ranking?: string;
    salary?: string;
    employment?: string;
    submit?: string;
  }>({});
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
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
    if (Object.keys(nextErrors).length > 0) return;

    const nonNegotiables: NonNegotiables = {
      min_salary: Number(minSalary.trim()),
      employment_type: employmentTypes,
      work_arrangement: workArrangement,
      custom,
      ep_sponsorship_required: requiresSponsorship,
    };

    const payload: TargetsPayload = {
      target_roles: roles,
      target_industries: industries,
      dream_companies: dreamCompanies,
      priority_ranking: ranking,
      non_negotiables: nonNegotiables,
    };

    setBusy(true);
    const result = await saveTargets(payload);
    setBusy(false);

    if (!result.ok) {
      setErrors((e) => ({
        ...e,
        submit: result.message,
      }));
      return;
    }

    onComplete(payload);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-gray-900">
          Targets &amp; non-negotiables
        </h2>
        <p className="text-sm text-gray-500">
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
        hint="Rank the six factors from most to least important"
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
          type="number"
          value={minSalary}
          onChange={(v) => {
            setMinSalary(v);
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

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleSubmit} disabled={busy}>
          {busy ? 'Saving…' : 'Finish onboarding'}
        </Button>
      </div>
    </div>
  );
}
