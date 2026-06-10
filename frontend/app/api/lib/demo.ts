/**
 * Demo mode mock data. Used by all BFF routes when DEMO_MODE=true.
 * No auth, no DynamoDB, no AWS calls.
 */

export const DEMO_MODE = process.env.DEMO_MODE === 'true';

export const DEMO_USER = {
    userId: 'demo-user-001',
    email: 'e1398303@u.nus.edu',
    name: 'Randall Koh',
};

export const DEMO_PIPELINE = [
    {
        application_id: 'app-001',
        user_id: 'demo-user-001',
        job_id: 'job-001',
        verdict_id: 'verdict-001',
        company: 'Grab',
        role_title: 'Product Analyst',
        customised_resume_s3_key: 'demo/resume-001.pdf',
        customisation_applied: true,
        cover_letter_text: 'Dear Hiring Manager, I am excited to apply for the Product Analyst role at Grab...',
        sent_at: '2026-06-01T08:00:00Z',
        recipient_email: 'careers@grab.com',
        email_thread_id: 'thread-001',
        status: 'callback',
        redirect_source_url: null,
        redirected_at: null,
        status_updated_at: '2026-06-03T10:30:00Z',
        classification_confidence: 92,
    },
    {
        application_id: 'app-002',
        user_id: 'demo-user-001',
        job_id: 'job-002',
        verdict_id: 'verdict-002',
        company: 'Sea Limited',
        role_title: 'Data Analyst',
        customised_resume_s3_key: 'demo/resume-002.pdf',
        customisation_applied: true,
        cover_letter_text: 'Dear Hiring Manager, I am writing to express my interest in the Data Analyst position at Sea...',
        sent_at: '2026-06-02T09:15:00Z',
        recipient_email: 'talent@sea.com',
        email_thread_id: 'thread-002',
        status: 'opened',
        redirect_source_url: null,
        redirected_at: null,
        status_updated_at: '2026-06-02T14:22:00Z',
        classification_confidence: 85,
    },
    {
        application_id: 'app-003',
        user_id: 'demo-user-001',
        job_id: 'job-003',
        verdict_id: 'verdict-003',
        company: 'GovTech',
        role_title: 'Associate Product Manager',
        customised_resume_s3_key: 'demo/resume-003.pdf',
        customisation_applied: true,
        cover_letter_text: 'I am eager to contribute to Singapore\'s digital government transformation...',
        sent_at: '2026-06-03T10:00:00Z',
        recipient_email: 'careers@tech.gov.sg',
        email_thread_id: null,
        status: 'sent',
        redirect_source_url: null,
        redirected_at: null,
        status_updated_at: '2026-06-03T10:01:00Z',
        classification_confidence: 0,
    },
    {
        application_id: 'app-004',
        user_id: 'demo-user-001',
        job_id: 'job-004',
        verdict_id: 'verdict-004',
        company: 'Shopee',
        role_title: 'Business Intelligence Analyst',
        customised_resume_s3_key: 'demo/resume-004.pdf',
        customisation_applied: false,
        cover_letter_text: '',
        sent_at: '2026-05-28T11:00:00Z',
        recipient_email: 'recruit@shopee.com',
        email_thread_id: 'thread-004',
        status: 'rejected',
        redirect_source_url: null,
        redirected_at: null,
        status_updated_at: '2026-06-05T09:00:00Z',
        classification_confidence: 88,
    },
    {
        application_id: 'app-005',
        user_id: 'demo-user-001',
        job_id: 'job-005',
        verdict_id: 'verdict-005',
        company: 'Grab',
        role_title: 'Growth Analyst',
        customised_resume_s3_key: 'demo/resume-005.pdf',
        customisation_applied: true,
        cover_letter_text: 'Following up on my previous application, I am also interested in the Growth Analyst role...',
        sent_at: '2026-06-04T08:30:00Z',
        recipient_email: 'careers@grab.com',
        email_thread_id: null,
        status: 'sent',
        redirect_source_url: null,
        redirected_at: null,
        status_updated_at: '2026-06-04T08:31:00Z',
        classification_confidence: 0,
    },
    {
        application_id: 'app-006',
        user_id: 'demo-user-001',
        job_id: 'job-008',
        verdict_id: 'verdict-008',
        company: 'Wise',
        role_title: 'Product Operations Associate',
        customised_resume_s3_key: 'demo/resume-006.pdf',
        customisation_applied: true,
        cover_letter_text: 'Dear Wise team, I am following up on my application...',
        sent_at: '2026-05-20T08:00:00Z',
        recipient_email: 'jobs@wise.com',
        email_thread_id: 'thread-wise-001',
        status: 'ghosted',
        redirect_source_url: null,
        redirected_at: null,
        status_updated_at: '2026-06-01T08:00:00Z',
        classification_confidence: 0,
    },
];

const DEMO_COVER_LETTER = `Dear Hiring Manager,

I am excited to apply for the Product Analyst role at Grab. As a fresh graduate with strong SQL skills and hands-on experience building dashboards during my internship at DBS, I am ready to contribute to Grab's data-driven product decisions from day one.

During my final year project, I analysed ride-hailing demand patterns using Python and presented findings to industry mentors — an experience that mirrors what this role requires. I am drawn to Grab's regional scale and the opportunity to work across markets.

I would welcome the chance to discuss how I can add value to the product team.

Best regards,
Alex Tan`;

export const DEMO_JOB_DETAIL = {
    job: {
        job_id: 'job-001',
        user_id: 'demo-user-001',
        company: 'Grab',
        role_title: 'Product Analyst',
        salary_min: 4500,
        salary_max: 6000,
        posted_at: '2026-05-28T00:00:00Z',
        source_url: 'https://careers.grab.com/jobs/product-analyst',
        employer_email: 'careers@grab.com',
        jd_text: `About the Role\n\nWe are looking for a Product Analyst to join Grab's regional product team. You will work with cross-functional teams to analyse user behaviour, define KPIs, and support product decisions with data.\n\nResponsibilities\n- Build dashboards and reports using SQL and BI tools\n- Partner with Product Managers to define success metrics\n- Conduct A/B test analysis and interpret results\n- Present findings to senior stakeholders\n\nRequirements\n- Degree in any discipline; STEM preferred\n- Strong SQL skills and experience with data visualisation tools\n- Analytical mindset with good communication skills\n- Fresh graduates welcome`,
        employment_type: 'full_time',
        work_arrangement: 'hybrid_remote',
        location: 'Singapore',
        ep_sponsorship_signal: false,
        mcf_listing_days: 7,
        scanned_at: '2026-06-01T00:00:00Z',
    },
    verdicts: {
        ambition: {
            verdict: 'apply',
            ambition_score: 87,
            reasoning:
                "I'd say Grab is a tier-1 regional tech company with strong brand value for an early-career resume.",
            key_argument: 'Product Analyst is a well-trodden path into PM roles.',
        },
        realism: {
            verdict: 'apply',
            match_score: 74,
            key_gaps: ['High applicant volume for Grab roles'],
            work_life_flags: [],
            reasoning:
                "I'd note the salary range aligns with your minimum and the requirements match your SQL skills.",
            key_argument: "I'd say your profile is competitive despite high competition.",
        },
        risk: {
            verdict: 'safe',
            risk_score: 19,
            red_flags: [],
            glassdoor_score: 4.1,
            reasoning:
                "I don't see significant red flags — Grab is a stable employer with established career frameworks.",
            key_argument: 'Permanent full-time contract with clear progression.',
        },
        opportunity: {
            verdict: 'act_now',
            urgency_score: 90,
            timing_factors: ['Listing is recent', 'Strong regional exposure'],
            reasoning:
                "I'd highlight that regional exposure and cross-functional work are high-value for career development.",
            key_argument: 'Clear progression path to Senior Analyst or PM.',
        },
    },
    decision: {
        decision: 'apply_consensus',
        summary:
            'All four agents recommend applying. Strong brand, aligned salary, and good skill match make this a high-priority application.',
        resume_instructions:
            'Lead with CallBridge (accessibility app, Build for Good) and Cynapse AI/CV work. Add SQL/Python analytics from NUS Fintech Society; trim coursework.',
        cover_letter_angle:
            'Emphasise full-stack product builds plus data-driven experimentation for regional product teams.',
        agents_for: ['ambition', 'realism', 'risk', 'opportunity'],
        agents_against: [],
        user_action_required: false,
    },
    materials: {
        resume_s3_key: 'demo/resume-001.pdf',
        cover_letter_text: DEMO_COVER_LETTER,
        customisation_applied: true,
    },
    coverLetter: DEMO_COVER_LETTER,
    tailoringNotes: '- Open with product leadership\n- Tie Grab mission to your fintech experience',
    resumeUrl: '/api/demo/resume?file=resume-001.pdf',
    baseResumeS3Key: 'demo/randall-koh-resume.pdf',
    baseResumeUrl: '/api/demo/resume?file=randall-koh-resume.pdf',
};

export const DEMO_GROWTH = {
    skills: [
        {
            skill: 'SQL & Data Analysis',
            times_flagged: 3,
            roadmap: {
                projected_match_improvement: '61% -> 79%',
                networking_opportunities: [
                    {
                        name: 'Tech in Asia Singapore 2026',
                        date: '2026-06-20',
                        url: 'https://www.techinasia.com/events',
                        type: 'event' as const,
                        week: 2,
                    },
                ],
                weeks: [
                    {
                        week: 1,
                        action: 'Complete Mode Analytics SQL Tutorial and practise window functions',
                        resource_url: 'https://mode.com/sql-tutorial/',
                        cost: 'Free',
                        time_hours: 6,
                        type: 'course' as const,
                    },
                    {
                        week: 2,
                        action: 'Solve LeetCode SQL Top 50 — focus on aggregations and joins',
                        resource_url: 'https://leetcode.com/studyplan/top-sql-50/',
                        cost: 'Free',
                        time_hours: 5,
                        type: 'project' as const,
                    },
                    {
                        week: 3,
                        action: 'Build a Tableau dashboard using a Singapore open dataset and publish it on Tableau Public',
                        resource_url: 'https://public.tableau.com',
                        cost: 'Free',
                        time_hours: 6,
                        type: 'project' as const,
                    },
                    {
                        week: 4,
                        action: 'Complete the Google Data Analytics Certificate capstone project and add it to your LinkedIn',
                        resource_url: 'https://www.coursera.org/professional-certificates/google-data-analytics',
                        cost: 'S$59/mo',
                        time_hours: 8,
                        type: 'certification' as const,
                    },
                ],
            },
        },
        {
            skill: 'A/B Testing',
            times_flagged: 2,
            roadmap: {
                projected_match_improvement: '55% -> 71%',
                networking_opportunities: [
                    {
                        name: 'SG Product Hunt Meetup',
                        date: '2026-06-25',
                        url: 'https://www.meetup.com/singapore-product',
                        type: 'event' as const,
                        week: 3,
                    },
                ],
                weeks: [
                    {
                        week: 1,
                        action: 'Complete Udacity A/B Testing free course — focus on hypothesis testing and p-values',
                        resource_url: 'https://www.udacity.com/course/ab-testing--ud257',
                        cost: 'Free',
                        time_hours: 6,
                        type: 'course' as const,
                    },
                    {
                        week: 2,
                        action: 'Implement a simulated A/B test in Python using a public e-commerce dataset from Kaggle',
                        resource_url: 'https://www.kaggle.com/datasets',
                        cost: 'Free',
                        time_hours: 5,
                        type: 'project' as const,
                    },
                    {
                        week: 3,
                        action: 'Run a free Optimizely trial experiment on a personal project or portfolio site',
                        resource_url: 'https://www.optimizely.com/free-trial/',
                        cost: 'Free',
                        time_hours: 4,
                        type: 'project' as const,
                    },
                    {
                        week: 4,
                        action: 'Write a 500-word case study documenting your A/B test results and publish it on Medium or Substack',
                        resource_url: 'https://medium.com',
                        cost: 'Free',
                        time_hours: 4,
                        type: 'project' as const,
                    },
                ],
            },
        },
    ],
};

export const DEMO_NETWORK_GRAB = {
    company: 'Grab',
    application_count: 2,
    suggestions: [
        {
            name: 'Li Wei',
            type: 'alumni',
            context: 'Product Analyst, Grab · NUS Business Analytics 2023',
            outreach_draft:
                'Hi Li Wei, I noticed we both graduated from NUS Business Analytics. I recently applied for the Product Analyst role at Grab and would love to hear about your experience on the team.',
            linkedin_url: 'https://www.linkedin.com/in/liwei-tan',
        },
        {
            name: 'Sarah Koh',
            type: 'community',
            context: 'Senior Product Manager, Grab Deliveries',
            outreach_draft:
                'Hi Sarah, I have been following your posts in the SG Product community and admire the work your team is doing on Grab Deliveries. I applied for a Product Analyst role and would appreciate any advice.',
            linkedin_url: 'https://www.linkedin.com/in/sarah-koh',
        },
        {
            name: 'Marcus Lim',
            type: 'cold',
            context: 'Data Analyst, Grab Financial',
            outreach_draft:
                'Hi Marcus, I am exploring opportunities at Grab Financial and recently applied for a Product Analyst role. Would you be open to a brief chat about the team culture?',
            email: 'marcus.lim@example.com',
        },
    ],
    upcoming_events: [
        {
            name: 'Tech in Asia Singapore 2026',
            date: '2026-06-20',
            url: 'https://www.techinasia.com/events',
            type: 'event',
        },
        {
            name: 'SG Product Hunt Meetup',
            date: '2026-06-25',
            url: 'https://www.meetup.com/singapore-product',
            type: 'event',
        },
    ],
};

/** @deprecated Use DEMO_NETWORK_GRAB */
export const DEMO_NETWORK = DEMO_NETWORK_GRAB;

export const DEMO_NETWORK_GOVTECH = {
    company: 'GovTech',
    application_count: 2,
    suggestions: [
        {
            name: 'Priya Nair',
            type: 'alumni',
            context: 'Associate Product Manager, GovTech · NUS CS 2022',
            outreach_draft:
                'Hi Priya, I noticed we both studied at NUS. I recently applied for the Associate Product Manager role at GovTech and would love to hear what the product team culture is like.',
            linkedin_url: 'https://www.linkedin.com/in/priya-nair',
        },
        {
            name: 'David Wong',
            type: 'community',
            context: 'Product Lead, GovTech Open Government Products',
            outreach_draft:
                'Hi David, I have been following OGP\'s work on public digital services and recently applied to GovTech. Would you be open to a short chat about breaking into product there?',
            linkedin_url: 'https://www.linkedin.com/in/david-wong',
        },
    ],
    upcoming_events: [],
};

export const DEMO_NETWORK_BY_COMPANY: Record<string, typeof DEMO_NETWORK_GRAB> = {
    Grab: DEMO_NETWORK_GRAB,
    GovTech: DEMO_NETWORK_GOVTECH,
};

export const DEMO_BRIEF = {
    recalibration_id: 'recal-001',
    user_id: 'demo-user-001',
    week_of: '2026-06-02',
    metrics: {
        applications_sent: 5,
        callbacks: 1,
        rejections: 1,
        ghosted: 0,
        callback_rate: 0.2,
    },
    agent_performance: {
        ambition:    { correct: 4, incorrect: 1 },
        realism:     { correct: 4, incorrect: 1 },
        risk:        { correct: 5, incorrect: 0 },
        opportunity: { correct: 3, incorrect: 1 },
    },
    adjustments_made: [
        {
            agent: 'opportunity',
            parameter: 'confidence_threshold',
            old_value: 0.75,
            new_value: 0.70,
            reason: 'Callback rate above baseline — loosening opportunity gate slightly.',
        },
    ],
    emergency: false,
    growth_activities: [
        {
            skill: 'SQL & Data Analysis',
            times_flagged: 3,
            projected_match_improvement: '61% → 79%',
            reason:
                'Realism Agent flagged this skill gap across 3 distinct job matches — Growth Agent activates at 3+.',
            summary:
                'Researched courses, projects, and certifications, then built a four-week roadmap with linked resources and a projected match-score lift.',
        },
        {
            skill: 'A/B Testing',
            times_flagged: 2,
            projected_match_improvement: '55% → 71%',
            reason:
                'Realism Agent flagged A/B testing on 2 roles this week — Growth Agent is tracking it as an emerging gap.',
            summary:
                'Drafted a four-week practice plan covering hypothesis testing, a Python experiment, and a published case study.',
        },
    ],
    network_activities: [
        {
            company: 'Grab',
            application_count: 2,
            suggestion_count: 3,
            reason:
                'You sent 2 applications to Grab this week — Network Agent activates when interest in a company hits 2+.',
            summary:
                'Found 3 connection paths (alumni, community, cold) and drafted personalised outreach for each, plus 2 relevant Singapore events.',
        },
        {
            company: 'GovTech',
            application_count: 2,
            suggestion_count: 2,
            reason:
                'GovTech crossed the 2-application threshold — networking can shorten the wait on in-flight applications.',
            summary:
                'Surfaced 2 warm introductions (NUS alumni and SG product community) with ready-to-send outreach drafts.',
        },
    ],
    brief_text: `Week of 2 Jun 2026\n\nYou sent 5 applications this week and received 1 callback (Grab — Product Analyst). That's a 20% callback rate, well above the 8% Singapore tech market baseline.\n\nAgent Accuracy\nAll four debate agents performed well. Opportunity Agent was slightly under-calling — its confidence threshold was nudged down. Growth Agent built roadmaps for SQL and A/B Testing; Network Agent drafted outreach for Grab and GovTech.\n\nNext Week\n• Prep for your Grab Product Analyst callback — review the JD and your tailored resume before they reach out.\n• Start Week 1 of your SQL & Data Analysis roadmap — block 6 hours for the Mode Analytics tutorial.\n• Send the Grab alumni outreach draft Network Agent prepared for Li Wei.\n• Check in on in-flight applications (GovTech, Grab Growth Analyst) if you haven't heard back by Thursday.`,
    created_at: '2026-06-09T06:00:00Z',
};

export const DEMO_DASHBOARD = {
    agent_status: {
        scanning: false,
        last_scan_at: '2026-06-09T05:00:00Z',
        next_scan_at: '2026-06-09T17:00:00Z',
        jobs_in_review: 2,
    },
    action_needed: [
        {
            job_id: 'job-006',
            application_id: null,
            company: 'ByteDance',
            role_title: 'Data Analyst, TikTok SG',
            decision: 'deadlock_escalate',
            user_action_required: true,
            reason: 'Agents split 2-2. Ambition and Opportunity say apply; Realism and Risk flag low salary and high churn rate. Your call.',
            created_at: '2026-06-09T05:05:00Z',
            has_employer_email: false,
            source_url: 'https://jobs.bytedance.com/en/position/123456',
        },
    ],
    pending_send: [
        {
            job_id: 'job-007',
            application_id: null,
            company: 'Ninja Van',
            role_title: 'Operations Analyst',
            decision: 'apply_with_caveat',
            user_action_required: false,
            reason: 'Orchestrator approved — strong fit but apply via the company careers page.',
            created_at: '2026-06-09T05:10:00Z',
            has_employer_email: false,
            source_url: 'https://www.ninjavan.co/en-sg/careers/operations-analyst',
        },
    ],
    pipeline: {
        total: 5,
        by_status: {
            sent: 2,
            opened: 1,
            callback: 1,
            rejected: 1,
        },
    },
    growth: [
        {
            skill: 'SQL & Data Analysis',
            projected_match_improvement: '+18%',
            times_flagged: 3,
        },
        {
            skill: 'A/B Testing',
            projected_match_improvement: '+12%',
            times_flagged: 2,
        },
    ],
    network: [
        {
            company: 'Grab',
            application_count: 2,
            suggestion_count: 3,
        },
        {
            company: 'GovTech',
            application_count: 2,
            suggestion_count: 2,
        },
    ],
    intelligence: {
        callback_rate: 0.2,
        latest_recalibration: {
            recalibration_id: 'recal-001',
            user_id: 'demo-user-001',
            week_of: '2026-06-02',
            metrics: {
                applications_sent: 5,
                callbacks_received: 1,
                callback_rate: 0.2,
            },
            agent_performance: {},
            adjustments_made: [],
            emergency: false,
            brief_text: 'Strong week — 20% callback rate vs 8% market baseline.',
            created_at: '2026-06-09T06:00:00Z',
        },
    },
    relaxation_suggestions: [
        {
            suggestion_id: 'sug-001',
            user_id: 'demo-user-001',
            scan_run_id: 'scan-run-001',
            target_non_negotiable: 'min_salary',
            current_value: 4000,
            proposed_value: 3500,
            rationale: '14 additional jobs in your target roles are available between $3,500–$4,000. Your current 20% callback rate suggests you can afford to test a wider net.',
            evidence_job_ids: ['job-010', 'job-011', 'job-012', 'job-013'],
            approval_state: 'pending',
            created_at: '2026-06-09T06:00:00Z',
        },
    ],
};
