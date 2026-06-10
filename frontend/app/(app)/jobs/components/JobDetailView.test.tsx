/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { JobHeader } from './JobHeader';
import { DebateCard } from './DebateCard';
import { DebateCardList } from './DebateCardList';
import { DecisionSummary } from './DecisionSummary';
import { ResumePreview } from './ResumePreview';
import { CoverLetterEditor } from './CoverLetterEditor';
import { ApplicationMaterials } from './ApplicationMaterials';
import { ActionBar } from './ActionBar';
import { JobModalHeader } from './JobModalHeader';
import type { Job, VerdictSet, MasterDecision, Materials } from '@worksignal/shared';
import type { AgentCardData } from './agentTheme';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeJob(overrides: Partial<Job> = {}): Job {
    return {
        job_id: 'job-001',
        user_id: 'user-001',
        company: 'TechCorp Singapore',
        role_title: 'Senior Frontend Engineer',
        salary_min: 8000,
        salary_max: 12000,
        jd_text: 'We are looking for a senior frontend engineer...',
        posted_at: '2024-06-01T00:00:00.000Z',
        source_url: 'https://example.com/job/001',
        employer_email: 'hiring@techcorp.sg',
        employment_type: 'full_time',
        work_arrangement: 'hybrid_remote',
        location: 'Singapore',
        ep_sponsorship_signal: false,
        mcf_listing_days: 7,
        scanned_at: '2024-06-10T00:00:00.000Z',
        ...overrides,
    };
}

function makeVerdictSet(): VerdictSet {
    return {
        ambition: {
            verdict: 'apply',
            ambition_score: 85,
            reasoning: 'Strong career-ceiling lift with leadership scope.',
            key_argument: 'Role offers cross-functional leadership exposure.',
        },
        realism: {
            verdict: 'apply',
            match_score: 78,
            key_gaps: ['System design at scale'],
            work_life_flags: [],
            reasoning: 'Good match with minor skill gap.',
            key_argument: 'Transferable experience covers 80% of requirements.',
        },
        risk: {
            verdict: 'safe',
            risk_score: 25,
            red_flags: [{ flag: 'Recent layoffs', source: 'TechCrunch', severity: 'low' }],
            glassdoor_score: 4.2,
            reasoning: 'Company is stable with strong fundamentals.',
            key_argument: 'Well-funded with growing revenue.',
        },
        opportunity: {
            verdict: 'act_now',
            urgency_score: 90,
            timing_factors: ['Role posted 3 days ago', 'Few applicants'],
            reasoning: 'High urgency — early mover advantage.',
            key_argument: 'Listing is fresh with low competition.',
        },
    };
}

function makeDecision(overrides: Partial<MasterDecision> = {}): MasterDecision {
    return {
        decision: 'apply_consensus',
        summary: 'All agents recommend applying. Strong alignment with your career goals.',
        resume_instructions: 'Emphasise leadership and system design experience.',
        cover_letter_angle: 'Focus on cross-functional collaboration wins.',
        agents_for: ['ambition', 'realism', 'risk', 'opportunity'],
        agents_against: [],
        user_action_required: false,
        ...overrides,
    };
}

function makeMaterials(overrides: Partial<Materials> = {}): Materials {
    return {
        resume_s3_key: 'resumes/user-001/job-001-customised.pdf',
        cover_letter_text: 'Dear Hiring Manager, I am excited to apply...',
        customisation_applied: true,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Req 15.1: JobHeader — company, role, salary, posting time
// ---------------------------------------------------------------------------

describe('JobHeader (Req 15.1)', () => {
    it('renders the company name', () => {
        render(<JobHeader job={makeJob()} />);
        expect(screen.getByText('TechCorp Singapore')).toBeDefined();
    });

    it('renders the role title', () => {
        render(<JobHeader job={makeJob()} />);
        expect(screen.getByText('Senior Frontend Engineer')).toBeDefined();
    });

    it('renders the formatted salary range', () => {
        render(<JobHeader job={makeJob({ salary_min: 8000, salary_max: 12000 })} />);
        const salaryEl = screen.getByTestId('job-salary');
        // Intl.NumberFormat renders with narrow currency symbol in jsdom
        expect(salaryEl.textContent).toContain('8,000');
        expect(salaryEl.textContent).toContain('12,000');
        expect(salaryEl.textContent).toContain('/ month');
    });

    it('renders posting time', () => {
        render(<JobHeader job={makeJob()} />);
        const postingEl = screen.getByTestId('job-posting-time');
        expect(postingEl.textContent).toContain('Posted');
    });

    it('renders "Salary not disclosed" when both min and max are 0', () => {
        render(<JobHeader job={makeJob({ salary_min: 0, salary_max: 0 })} />);
        const salaryEl = screen.getByTestId('job-salary');
        expect(salaryEl.textContent).toBe('Salary not disclosed');
    });

    it('renders the location when available', () => {
        render(<JobHeader job={makeJob({ location: 'Singapore CBD' })} />);
        expect(screen.getByText('Singapore CBD')).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// Req 15.2: DebateCard — verdict, score, reasoning, key argument
// ---------------------------------------------------------------------------

describe('DebateCard (Req 15.2)', () => {
    const card: AgentCardData = {
        agent: 'ambition',
        label: 'Ambition Agent',
        color: '#DC2626',
        verdict: 'apply',
        score: 85,
        scoreLabel: 'Ambition score',
        reasoning: 'Strong career-ceiling lift with leadership scope.',
        keyArgument: 'Role offers cross-functional leadership exposure.',
        details: [],
        failed: false,
    };

    it('renders the agent label', () => {
        render(<DebateCard card={card} />);
        expect(screen.getByText('Ambition Agent')).toBeDefined();
    });

    it('renders the verdict badge', () => {
        render(<DebateCard card={card} />);
        const verdict = screen.getByTestId('debate-card-ambition-verdict');
        expect(verdict.textContent).toBe('Apply');
    });

    it('renders the score with /100', () => {
        render(<DebateCard card={card} />);
        const scoreEl = screen.getByTestId('debate-card-ambition-score');
        expect(scoreEl.textContent).toContain('85/100');
    });

    it('renders key argument as tldr and reasoning in collapsible speech', () => {
        render(<DebateCard card={card} />);
        expect(screen.getByTestId('debate-card-ambition-tldr').textContent).toContain(
            'cross-functional leadership exposure'
        );
        fireEvent.click(screen.getByTestId('debate-card-ambition-toggle'));
        const speech = screen.getByTestId('debate-card-ambition-speech');
        expect(speech.textContent).toContain('Strong career-ceiling lift');
    });

    it('does not render score section when failed is true', () => {
        const failedCard: AgentCardData = { ...card, failed: true };
        render(<DebateCard card={failedCard} />);
        expect(screen.queryByTestId('debate-card-ambition-score')).toBeNull();
    });

    it('renders details when present', () => {
        const cardWithDetails: AgentCardData = {
            ...card,
            agent: 'risk',
            details: [{ label: 'Red flags', values: ['Recent layoffs (TechCrunch)'] }],
        };
        render(<DebateCard card={cardWithDetails} />);
        expect(screen.getByText('Red flags')).toBeDefined();
        expect(screen.getByText('Recent layoffs (TechCrunch)')).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// Req 15.2: DebateCardList — renders 4 cards (one per agent)
// ---------------------------------------------------------------------------

describe('DebateCardList (Req 15.2)', () => {
    it('renders exactly 4 debate cards', () => {
        render(<DebateCardList verdicts={makeVerdictSet()} />);
        const list = screen.getByTestId('debate-card-list');
        expect(list).toBeDefined();

        expect(screen.getByTestId('debate-card-ambition')).toBeDefined();
        expect(screen.getByTestId('debate-card-realism')).toBeDefined();
        expect(screen.getByTestId('debate-card-risk')).toBeDefined();
        expect(screen.getByTestId('debate-card-opportunity')).toBeDefined();
    });

    it('renders each card with its verdict', () => {
        render(<DebateCardList verdicts={makeVerdictSet()} />);
        expect(screen.getByTestId('debate-card-ambition-verdict').textContent).toBe('Apply');
        expect(screen.getByTestId('debate-card-realism-verdict').textContent).toBe('Apply');
        expect(screen.getByTestId('debate-card-risk-verdict').textContent).toBe('Safe');
        expect(screen.getByTestId('debate-card-opportunity-verdict').textContent).toBe('Act Now');
    });

    it('renders each card with its score', () => {
        render(<DebateCardList verdicts={makeVerdictSet()} />);
        expect(screen.getByTestId('debate-card-ambition-score').textContent).toContain('85/100');
        expect(screen.getByTestId('debate-card-realism-score').textContent).toContain('78/100');
        expect(screen.getByTestId('debate-card-risk-score').textContent).toContain('25/100');
        expect(screen.getByTestId('debate-card-opportunity-score').textContent).toContain('90/100');
    });

    it('renders each card with speech blocks', () => {
        render(<DebateCardList verdicts={makeVerdictSet()} />);
        fireEvent.click(screen.getByTestId('debate-card-ambition-toggle'));
        fireEvent.click(screen.getByTestId('debate-card-opportunity-toggle'));
        expect(screen.getByTestId('debate-card-ambition-speech').textContent).toContain(
            'Strong career-ceiling lift'
        );
        expect(screen.getByTestId('debate-card-opportunity-speech').textContent).toContain(
            'High urgency'
        );
    });

    it('handles partially missing verdicts (degraded mode)', () => {
        const partial: VerdictSet = {
            ambition: makeVerdictSet().ambition,
            realism: makeVerdictSet().realism,
            // risk and opportunity missing
        };
        render(<DebateCardList verdicts={partial} />);
        // Should still render 4 cards (2 with data, 2 failed)
        expect(screen.getByTestId('debate-card-ambition')).toBeDefined();
        expect(screen.getByTestId('debate-card-realism')).toBeDefined();
        expect(screen.getByTestId('debate-card-risk')).toBeDefined();
        expect(screen.getByTestId('debate-card-opportunity')).toBeDefined();

        // Failed cards show 'unavailable' verdict
        expect(screen.getByTestId('debate-card-risk-verdict').textContent).toBe('Unavailable');
        expect(screen.getByTestId('debate-card-opportunity-verdict').textContent).toBe('Unavailable');
    });
});

// ---------------------------------------------------------------------------
// Req 15.3: DecisionSummary — Master Orchestrator decision
// ---------------------------------------------------------------------------

describe('DecisionSummary (Req 15.3)', () => {
    it('renders Orchestrator Decision title', () => {
        render(<DecisionSummary decision={makeDecision()} />);
        expect(screen.getByText('Orchestrator Decision')).toBeDefined();
    });

    it('renders the decision badge', () => {
        render(<DecisionSummary decision={makeDecision()} />);
        const badge = screen.getByTestId('decision-badge');
        expect(badge.textContent).toBe('Apply — consensus');
    });

    it('applies green tier styling for apply decisions', () => {
        render(<DecisionSummary decision={makeDecision()} />);
        const section = screen.getByTestId('decision-summary');
        expect(section.getAttribute('data-decision-tier')).toBe('green');
        expect(section.className).toContain('bg-emerald-50');
    });

    it('applies yellow tier styling for deadlock', () => {
        render(
            <DecisionSummary decision={makeDecision({ decision: 'deadlock_escalate' })} />
        );
        const section = screen.getByTestId('decision-summary');
        expect(section.getAttribute('data-decision-tier')).toBe('yellow');
        expect(section.className).toContain('bg-amber-50');
    });

    it('applies red tier styling for skip decisions', () => {
        render(
            <DecisionSummary decision={makeDecision({ decision: 'skip_consensus' })} />
        );
        const section = screen.getByTestId('decision-summary');
        expect(section.getAttribute('data-decision-tier')).toBe('red');
        expect(section.className).toContain('bg-rose-50');
    });

    it('renders the decision summary text', () => {
        render(<DecisionSummary decision={makeDecision()} />);
        const text = screen.getByTestId('decision-text');
        expect(text.textContent).toContain('All agents recommend applying');
    });

    it('renders supporting agents', () => {
        render(<DecisionSummary decision={makeDecision()} />);
        const forSection = screen.getByTestId('agents-for');
        expect(forSection.textContent).toContain('Ambition Agent');
        expect(forSection.textContent).toContain('Realism Agent');
        expect(forSection.textContent).toContain('Risk Agent');
        expect(forSection.textContent).toContain('Opportunity Agent');
    });

    it('renders opposing agents when present', () => {
        render(
            <DecisionSummary
                decision={makeDecision({
                    decision: 'apply_with_caveat',
                    agents_for: ['ambition', 'realism', 'opportunity'],
                    agents_against: ['risk'],
                    dissent_note: 'Risk agent flagged recent layoffs.',
                })}
            />
        );
        const againstSection = screen.getByTestId('agents-against');
        expect(againstSection.textContent).toContain('Risk Agent');
    });

    it('renders dissent note when present', () => {
        render(
            <DecisionSummary
                decision={makeDecision({
                    dissent_note: 'Risk agent flagged recent layoffs.',
                })}
            />
        );
        const dissent = screen.getByTestId('dissent-note');
        expect(dissent.textContent).toContain('Risk agent flagged recent layoffs.');
    });

    it('shows user action required banner when user_action_required is true', () => {
        render(
            <DecisionSummary decision={makeDecision({ user_action_required: true })} />
        );
        const banner = screen.getByTestId('decision-action-required');
        expect(banner.textContent).toContain('explicit confirmation is required');
    });

    it('does not show user action required banner when false', () => {
        render(
            <DecisionSummary decision={makeDecision({ user_action_required: false })} />
        );
        expect(screen.queryByTestId('decision-action-required')).toBeNull();
    });

    it('renders agent failures when present', () => {
        render(
            <DecisionSummary
                decision={makeDecision({ agent_failures: ['risk', 'opportunity'] })}
            />
        );
        const failures = screen.getByTestId('agent-failures');
        expect(failures.textContent).toContain('Risk Agent');
        expect(failures.textContent).toContain('Opportunity Agent');
    });
});

// ---------------------------------------------------------------------------
// Req 15.4: ResumePreview and CoverLetterEditor
// ---------------------------------------------------------------------------

describe('ResumePreview (Req 15.4)', () => {
    it('renders the resume preview section', () => {
        render(
            <ResumePreview
                materials={makeMaterials()}
                decision={makeDecision()}
                resumeS3Key="resumes/user-001/job-001-customised.pdf"
            />
        );
        expect(screen.getByTestId('resume-preview')).toBeDefined();
        expect(screen.getByText('Customised resume')).toBeDefined();
    });

    it('renders resume instructions from the Master decision', () => {
        render(
            <ResumePreview
                materials={makeMaterials()}
                decision={makeDecision()}
                resumeS3Key="resumes/user-001/job-001-customised.pdf"
            />
        );
        const instructions = screen.getByTestId('resume-instructions');
        expect(instructions.textContent).toContain('Emphasise leadership');
    });

    it('renders a download link when resumeUrl is provided', () => {
        render(
            <ResumePreview
                materials={makeMaterials()}
                decision={makeDecision()}
                resumeUrl="https://s3.example.com/resume.pdf"
                resumeS3Key="resumes/user-001/job-001-customised.pdf"
            />
        );
        const link = screen.getByTestId('resume-download');
        expect(link.getAttribute('href')).toBe('https://s3.example.com/resume.pdf');
        expect(link.textContent).toContain('Download resume');
    });

    it('shows disabled download when no resumeUrl', () => {
        render(
            <ResumePreview
                materials={makeMaterials()}
                decision={makeDecision()}
                resumeS3Key="resumes/user-001/job-001-customised.pdf"
            />
        );
        const download = screen.getByTestId('resume-download') as HTMLButtonElement;
        expect(download.disabled).toBe(true);
    });

    it('shows use original resume toggle when editable', () => {
        render(
            <ResumePreview
                materials={makeMaterials()}
                decision={makeDecision()}
                resumeS3Key="resumes/user-001/job-001-customised.pdf"
                editable
                canUseOriginalResume
                onUseOriginalResume={() => {}}
            />
        );
        expect(screen.getByTestId('resume-use-original')).toBeDefined();
    });

    it('shows base resume fallback badge when customisation_applied is false', () => {
        render(
            <ResumePreview
                materials={makeMaterials({ customisation_applied: false })}
                decision={makeDecision()}
                resumeS3Key="resumes/user-001/job-001-customised.pdf"
            />
        );
        const badge = screen.getByTestId('resume-base-fallback');
        expect(badge.textContent).toContain('Base resume');
    });

    it('shows tailoring loading state while resume streams', () => {
        render(
            <ResumePreview
                materials={makeMaterials()}
                decision={makeDecision()}
                resumeS3Key="resumes/user-001/job-001-customised.pdf"
                resumeLoading
            />
        );
        expect(screen.getByTestId('resume-loading').textContent).toContain(
            'Tailoring your resume',
        );
    });

    it('renders embedded PDF preview when resumeUrl is available', () => {
        render(
            <ResumePreview
                materials={makeMaterials()}
                decision={makeDecision()}
                resumeS3Key="resumes/user-001/job-001-customised.pdf"
                resumeUrl="https://example.com/resume.pdf"
            />
        );
        const preview = screen.getByTestId('resume-preview-pdf');
        const iframe = preview.querySelector('iframe');
        expect(iframe).toBeTruthy();
        expect(iframe?.getAttribute('src')).toContain('https://example.com/resume.pdf');
    });
});

describe('CoverLetterEditor (Req 15.4)', () => {
    it('renders the cover letter editor section', () => {
        render(
            <CoverLetterEditor
                value="Dear Hiring Manager..."
                onChange={() => { }}
                decision={makeDecision()}
            />
        );
        expect(screen.getByTestId('cover-letter-editor')).toBeDefined();
        expect(screen.getByText('Cover letter')).toBeDefined();
    });

    it('renders the textarea with the provided value', () => {
        render(
            <CoverLetterEditor
                value="My cover letter text"
                onChange={() => { }}
                decision={makeDecision()}
            />
        );
        const textarea = screen.getByTestId('cover-letter-textarea') as HTMLTextAreaElement;
        expect(textarea.value).toBe('My cover letter text');
    });

    it('calls onChange when the textarea is edited', () => {
        const onChange = vi.fn();
        render(
            <CoverLetterEditor
                value="Initial"
                onChange={onChange}
                decision={makeDecision()}
            />
        );
        const textarea = screen.getByTestId('cover-letter-textarea');
        fireEvent.change(textarea, { target: { value: 'Updated text' } });
        expect(onChange).toHaveBeenCalledWith('Updated text');
    });

    it('renders the suggested cover letter angle from the decision', () => {
        render(
            <CoverLetterEditor
                value=""
                onChange={() => { }}
                decision={makeDecision()}
            />
        );
        const angle = screen.getByTestId('cover-letter-angle');
        expect(angle.textContent).toContain('cross-functional collaboration');
    });

    it('disables textarea when disabled prop is true', () => {
        render(
            <CoverLetterEditor
                value="text"
                onChange={() => { }}
                decision={makeDecision()}
                disabled={true}
            />
        );
        const textarea = screen.getByTestId('cover-letter-textarea') as HTMLTextAreaElement;
        expect(textarea.disabled).toBe(true);
    });

    it('renders download in editable mode', () => {
        render(
            <CoverLetterEditor
                value="My cover letter"
                onChange={() => { }}
                decision={makeDecision()}
                editable={true}
            />
        );
        expect(screen.getByTestId('cover-letter-download-btn')).toBeDefined();
        expect(
            screen.getByTestId('cover-letter-download-btn').getAttribute('aria-label'),
        ).toBe('Download cover letter');
    });

    it('renders download-only mode when editable is false', () => {
        render(
            <CoverLetterEditor
                value="My cover letter"
                onChange={() => { }}
                decision={makeDecision()}
                editable={false}
            />
        );
        expect(screen.getByTestId('cover-letter-download')).toBeDefined();
        expect(screen.getByTestId('cover-letter-download-btn')).toBeDefined();
        expect(screen.queryByTestId('cover-letter-textarea')).toBeNull();
    });

    it('renders streamed tailoring notes', () => {
        render(
            <CoverLetterEditor
                value="Dear Hiring Manager..."
                onChange={() => { }}
                decision={makeDecision()}
                tailoringNotes={'- Emphasise React experience\n- Move leadership bullets up'}
                company="TechCorp Singapore"
            />
        );
        const notes = screen.getByTestId('tailoring-notes-text');
        expect(notes.textContent).toContain('Emphasise React experience');
    });

    it('shows tailoring notes loading state', () => {
        render(
            <CoverLetterEditor
                value=""
                onChange={() => { }}
                decision={makeDecision()}
                tailoringLoading={true}
                company="TechCorp Singapore"
            />
        );
        expect(screen.getByTestId('tailoring-notes-loading')).toBeDefined();
        expect(screen.getByTestId('tailoring-notes-loading').textContent).toContain(
            'TechCorp Singapore',
        );
    });

    it('shows cover letter streaming overlay before first tokens arrive', () => {
        render(
            <CoverLetterEditor
                value=""
                onChange={() => { }}
                decision={makeDecision()}
                isLoading={true}
            />
        );
        expect(screen.getByTestId('cover-letter-loading')).toBeDefined();
        expect(screen.getByTestId('cover-letter-textarea')).toBeDefined();
    });

    it('shows streaming tokens in the textarea without clearing', () => {
        render(
            <CoverLetterEditor
                value="Dear Hiring"
                onChange={() => { }}
                decision={makeDecision()}
                isLoading={true}
            />
        );
        const textarea = screen.getByTestId('cover-letter-textarea') as HTMLTextAreaElement;
        expect(textarea.value).toBe('Dear Hiring');
        expect(screen.queryByTestId('cover-letter-loading')).toBeNull();
    });
});

describe('ApplicationMaterials', () => {
    it('renders wider cover-letter two-column layout', () => {
        render(
            <ApplicationMaterials
                job={makeJob()}
                materials={makeMaterials()}
                decision={makeDecision()}
                baseResumeS3Key="resumes/user-001/base.pdf"
                coverLetter="Hello"
                onCoverLetterChange={() => {}}
                originalCoverLetter="Hello"
                editable={true}
            />
        );
        const grid = screen.getByTestId('application-materials');
        expect(grid.className).toContain('2.25fr');
        expect(screen.getByTestId('resume-preview')).toBeDefined();
        expect(screen.getByTestId('cover-letter-editor')).toBeDefined();
    });
});

describe('JobModalHeader', () => {
    it('renders company, role, salary, and location', () => {
        render(<JobModalHeader job={makeJob()} />);
        expect(screen.getByTestId('job-modal-header')).toBeDefined();
        const header = screen.getByTestId('job-modal-header');
        expect(header.textContent).toContain('TechCorp Singapore');
        expect(header.textContent).toContain('Senior Frontend Engineer');
        expect(screen.getByTestId('job-modal-salary').textContent).toContain('8,000');
        expect(screen.getByText('Singapore')).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// Req 15.5: ActionBar — Send, Skip, Save actions
// ---------------------------------------------------------------------------

describe('ActionBar (Req 15.5)', () => {
    it('renders the action bar', () => {
        render(
            <ActionBar
                hasEmployerEmail={true}
                sourceUrl="https://example.com/job"
                onSend={() => { }}
                onSkip={() => { }}
                onSave={() => { }}
            />
        );
        expect(screen.getByTestId('action-bar')).toBeDefined();
    });

    it('renders Send button when employer email exists', () => {
        render(
            <ActionBar
                hasEmployerEmail={true}
                sourceUrl="https://example.com/job"
                onSend={() => { }}
                onSkip={() => { }}
                onSave={() => { }}
            />
        );
        const sendBtn = screen.getByTestId('action-send');
        expect(sendBtn.textContent).toContain('Send application');
    });

    it('renders Save button', () => {
        render(
            <ActionBar
                hasEmployerEmail={true}
                sourceUrl="https://example.com/job"
                onSend={() => { }}
                onSkip={() => { }}
                onSave={() => { }}
            />
        );
        const saveBtn = screen.getByTestId('action-save');
        expect(saveBtn.textContent).toContain('Save');
    });

    it('renders Skip button', () => {
        render(
            <ActionBar
                hasEmployerEmail={true}
                sourceUrl="https://example.com/job"
                onSend={() => { }}
                onSkip={() => { }}
                onSave={() => { }}
            />
        );
        const skipBtn = screen.getByTestId('action-skip');
        expect(skipBtn.textContent).toContain('Skip');
    });

    it('calls onSend when Send button is clicked', () => {
        const onSend = vi.fn();
        render(
            <ActionBar
                hasEmployerEmail={true}
                sourceUrl="https://example.com/job"
                onSend={onSend}
                onSkip={() => { }}
                onSave={() => { }}
            />
        );
        fireEvent.click(screen.getByTestId('action-send'));
        expect(onSend).toHaveBeenCalledOnce();
    });

    it('calls onSkip when Skip button is clicked', () => {
        const onSkip = vi.fn();
        render(
            <ActionBar
                hasEmployerEmail={true}
                sourceUrl="https://example.com/job"
                onSend={() => { }}
                onSkip={onSkip}
                onSave={() => { }}
            />
        );
        fireEvent.click(screen.getByTestId('action-skip'));
        expect(onSkip).toHaveBeenCalledOnce();
    });

    it('calls onSave when Save button is clicked', () => {
        const onSave = vi.fn();
        render(
            <ActionBar
                hasEmployerEmail={true}
                sourceUrl="https://example.com/job"
                onSend={() => { }}
                onSkip={() => { }}
                onSave={onSave}
            />
        );
        fireEvent.click(screen.getByTestId('action-save'));
        expect(onSave).toHaveBeenCalledOnce();
    });

    it('renders redirect link instead of Send when no employer email', () => {
        render(
            <ActionBar
                hasEmployerEmail={false}
                sourceUrl="https://employer.com/apply"
                onSend={() => { }}
                onSkip={() => { }}
                onSave={() => { }}
            />
        );
        expect(screen.queryByTestId('action-send')).toBeNull();
        const redirect = screen.getByTestId('action-redirect');
        expect(redirect.getAttribute('href')).toBe('https://employer.com/apply');
        expect(redirect.textContent).toContain('Apply on employer site');
    });

    it('shows redirect note when no employer email', () => {
        render(
            <ActionBar
                hasEmployerEmail={false}
                sourceUrl="https://employer.com/apply"
                onSend={() => { }}
                onSkip={() => { }}
                onSave={() => { }}
            />
        );
        const note = screen.getByTestId('redirect-note');
        expect(note.textContent).toContain('No employer email found');
    });

    it('hides Save when showSave is false', () => {
        render(
            <ActionBar
                hasEmployerEmail={true}
                sourceUrl="https://example.com/job"
                onSend={() => { }}
                onSkip={() => { }}
                onSave={() => { }}
                showSave={false}
            />
        );
        expect(screen.queryByTestId('action-save')).toBeNull();
    });

    it('disables buttons when busy', () => {
        render(
            <ActionBar
                hasEmployerEmail={true}
                sourceUrl="https://example.com/job"
                onSend={() => { }}
                onSkip={() => { }}
                onSave={() => { }}
                busy={true}
            />
        );
        const sendBtn = screen.getByTestId('action-send') as HTMLButtonElement;
        const saveBtn = screen.getByTestId('action-save') as HTMLButtonElement;
        const skipBtn = screen.getByTestId('action-skip') as HTMLButtonElement;
        expect(sendBtn.disabled).toBe(true);
        expect(saveBtn.disabled).toBe(true);
        expect(skipBtn.disabled).toBe(true);
    });
});
