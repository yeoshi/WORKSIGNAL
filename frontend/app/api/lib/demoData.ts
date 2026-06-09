/**
 * Demo/mock data for local development and UI iteration.
 *
 * When DEMO_MODE=true is set in .env.local, all API routes return this
 * realistic sample data instead of hitting DynamoDB.
 */

export const DEMO_MODE = process.env.DEMO_MODE === 'true';

// --- Pipeline (Req 17) ---

export const demoPipeline = [
    {
        application_id: 'app-001',
        user_id: 'demo-user',
        job_id: 'job-001',
        verdict_id: 'verdict-001',
        company: 'Grab Singapore',
        role_title: 'Software Engineer, Platform',
        customised_resume_s3_key: 'resumes/demo/grab-platform.pdf',
        customisation_applied: true,
        cover_letter_text: 'Dear Hiring Manager, I am excited to apply for the Platform Engineer role at Grab...',
        sent_at: '2025-06-02T10:30:00.000Z',
        recipient_email: 'talent@grab.com',
        email_thread_id: 'thread-grab-001',
        status: 'callback',
        redirect_source_url: null,
        redirected_at: null,
        status_updated_at: '2025-06-05T14:00:00.000Z',
        classification_confidence: 92,
    },
    {
        application_id: 'app-002',
        user_id: 'demo-user',
        job_id: 'job-002',
        verdict_id: 'verdict-002',
        company: 'Shopee',
        role_title: 'Frontend Engineer',
        customised_resume_s3_key: 'resumes/demo/shopee-fe.pdf',
        customisation_applied: true,
        cover_letter_text: 'Dear Shopee Talent Team, I am writing to express my interest...',
        sent_at: '2025-06-03T09:00:00.000Z',
        recipient_email: 'careers@shopee.sg',
        email_thread_id: 'thread-shopee-001',
        status: 'sent',
        redirect_source_url: null,
        redirected_at: null,
        status_updated_at: '2025-06-03T09:00:00.000Z',
        classification_confidence: 0,
    },
    {
        application_id: 'app-003',
        user_id: 'demo-user',
        job_id: 'job-003',
        verdict_id: 'verdict-003',
        company: 'Stripe Singapore',
        role_title: 'Full Stack Engineer',
        customised_resume_s3_key: 'resumes/demo/stripe-fs.pdf',
        customisation_applied: true,
        cover_letter_text: 'Dear Stripe Team, With my background in TypeScript and distributed systems...',
        sent_at: '2025-05-28T11:00:00.000Z',
        recipient_email: 'hiring@stripe.com',
        email_thread_id: 'thread-stripe-001',
        status: 'rejected',
        redirect_source_url: null,
        redirected_at: null,
        status_updated_at: '2025-06-04T16:30:00.000Z',
        classification_confidence: 88,
    },
    {
        application_id: 'app-004',
        user_id: 'demo-user',
        job_id: 'job-004',
        verdict_id: 'verdict-004',
        company: 'GovTech Singapore',
        role_title: 'Software Engineer (Cloud)',
        customised_resume_s3_key: 'resumes/demo/govtech-cloud.pdf',
        customisation_applied: true,
        cover_letter_text: 'Dear GovTech Hiring Team, I am keen to contribute to Singapore digital government...',
        sent_at: '2025-05-20T08:30:00.000Z',
        recipient_email: null,
        email_thread_id: null,
        status: 'redirected_external',
        redirect_source_url: 'https://www.mycareersfuture.gov.sg/job/govtech-cloud-001',
        redirected_at: '2025-05-20T08:30:00.000Z',
        status_updated_at: '2025-05-20T08:30:00.000Z',
        classification_confidence: 0,
    },
    {
        application_id: 'app-005',
        user_id: 'demo-user',
        job_id: 'job-005',
        verdict_id: 'verdict-005',
        company: 'Wise (TransferWise)',
        role_title: 'Backend Engineer',
        customised_resume_s3_key: 'resumes/demo/wise-be.pdf',
        customisation_applied: false,
        cover_letter_text: 'Dear Wise Team, I am passionate about making international finance accessible...',
        sent_at: '2025-05-15T14:00:00.000Z',
        recipient_email: 'jobs@wise.com',
        email_thread_id: 'thread-wise-001',
        status: 'ghosted',
        redirect_source_url: null,
        redirected_at: null,
        status_updated_at: '2025-05-29T14:00:00.000Z',
        classification_confidence: 0,
    },
    {
        application_id: 'app-006',
        user_id: 'demo-user',
        job_id: 'job-006',
        verdict_id: 'verdict-006',
        company: 'Grab Singapore',
        role_title: 'Senior Backend Engineer',
        customised_resume_s3_key: 'resumes/demo/grab-be.pdf',
        customisation_applied: true,
        cover_letter_text: 'Dear Grab Engineering, Building on my platform experience...',
        sent_at: '2025-06-05T10:00:00.000Z',
        recipient_email: 'talent@grab.com',
        email_thread_id: 'thread-grab-002',
        status: 'sent',
        redirect_source_url: null,
        redirected_at: null,
        status_updated_at: '2025-06-05T10:00:00.000Z',
        classification_confidence: 0,
    },
];

// --- Growth Roadmap (Req 19.5) ---

export const demoGrowth = {
    skill: 'System Design at Scale',
    times_flagged: 5,
    roadmap: {
        projected_match_improvement: '68% to 84%',
        weeks: [
            {
                week: 1,
                action: 'Complete Designing Data-Intensive Applications chapters 1-4',
                resource_url: 'https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/',
                cost: 'Free (library)',
                time_hours: 8,
                type: 'course',
            },
            {
                week: 2,
                action: 'Build a URL shortener with rate limiting and caching layers',
                resource_url: 'https://github.com/donnemartin/system-design-primer',
                cost: 'Free',
                time_hours: 10,
                type: 'project',
            },
            {
                week: 3,
                action: 'Attend NUS-ISS System Architecture workshop (Singapore)',
                resource_url: 'https://www.iss.nus.edu.sg/executive-education/course/detail/software-architecture',
                cost: 'SGD 500',
                time_hours: 16,
                type: 'event',
            },
            {
                week: 4,
                action: 'Complete AWS Solutions Architect Associate practice exam',
                resource_url: 'https://aws.amazon.com/certification/certified-solutions-architect-associate/',
                cost: 'SGD 200',
                time_hours: 12,
                type: 'certification',
            },
        ],
        networking_opportunities: [
            {
                name: 'Singapore System Design Meetup',
                date: '2025-06-20',
                url: 'https://www.meetup.com/singapore-system-design/',
            },
            {
                name: 'AWS Community Day Singapore',
                date: '2025-07-12',
                url: 'https://aws.amazon.com/events/community-day-singapore/',
            },
        ],
    },
};

// --- Network Suggestions (Req 20.5) ---

export const demoNetwork = {
    company: 'Grab Singapore',
    application_count: 2,
    suggestions: [
        {
            type: 'alumni',
            name: 'Wei Lin Tan',
            context: 'NUS Computer Science 2021, Senior Engineer at Grab Platform team',
            outreach_draft: 'Hi Wei Lin! I am a fellow NUS CS grad (2023) and I have applied to Grab Platform Engineering team. I noticed you have been there for 2 years - would love to hear about your experience with the team culture and the distributed systems challenges you work on. Happy to buy you a coffee at the Grab office if you are open to a quick chat!',
        },
        {
            type: 'community',
            name: 'Priya Sharma',
            context: 'Organiser of Singapore Backend Engineers, Connected via Tech in Asia meetup',
            outreach_draft: 'Hi Priya! I saw you spoke at the recent Singapore Backend Engineers event about microservices at scale. I am currently interviewing with Grab and would value your perspective on the engineering culture there. Would you have 15 minutes for a virtual chat this week?',
        },
        {
            type: 'cold',
            name: 'James Ong',
            context: 'Engineering Manager, Grab Payments, Previously at Stripe Singapore',
            outreach_draft: 'Hi James, I came across your profile while researching Grab Payments team. Your move from Stripe to Grab caught my attention as someone interested in fintech infrastructure. I have applied to Grab and would appreciate any insights into what the team looks for in candidates. Thank you for considering!',
        },
    ],
    upcoming_events: [
        {
            name: 'Grab Engineering Open House',
            date: '2025-06-25',
            url: 'https://www.grab.com/sg/events/engineering-open-house/',
        },
        {
            name: 'Singapore Tech Careers Fair',
            date: '2025-07-05',
            url: 'https://www.techcareers.sg/fair-2025',
        },
    ],
};

// --- Weekly Brief (Req 21.5) ---

export const demoBrief = {
    recalibration_id: 'recal-demo-001',
    user_id: 'demo-user',
    week_of: '2025-06-02',
    metrics: {
        applications_sent: 6,
        callbacks: 2,
        callback_rate: 0.333,
    },
    agent_performance: {
        ambition: { correct: 5, incorrect: 1 },
        realism: { correct: 4, incorrect: 2 },
        risk: { correct: 6, incorrect: 0 },
        opportunity: { correct: 3, incorrect: 3 },
    },
    adjustments_made: [
        {
            agent: 'realism',
            parameter: 'match_threshold',
            old_value: 80,
            new_value: 75,
            reason: 'Callback rate exceeds expectations - relaxing threshold to surface more opportunities',
        },
        {
            agent: 'opportunity',
            parameter: 'urgency_weight',
            old_value: 1.0,
            new_value: 1.2,
            reason: 'Act-now predictions underperforming - increasing urgency signal weight',
        },
    ],
    emergency: false,
    brief_text: 'Strong week with 2 callbacks from 6 applications (33% rate). Grab responded positively to your Platform Engineer application - the debate agents correctly predicted this as a high-match role. The Risk agent maintained perfect accuracy by correctly vetoing two companies with recent layoff announcements. Realism threshold lowered from 80 to 75 given your above-average callback rate, which should surface 2-3 more roles per scan cycle. The Opportunity agent needs recalibration as its act_now predictions showed only 50% accuracy.',
    created_at: '2025-06-09T09:00:00.000Z',
};

// --- Job Detail (Req 15) ---

export const demoJobDetail = {
    job: {
        job_id: 'job-001',
        company: 'Grab Singapore',
        role_title: 'Software Engineer, Platform',
        salary_min: 8000,
        salary_max: 12000,
        posted_at: '2025-05-30T08:00:00.000Z',
        source_url: 'https://www.mycareersfuture.gov.sg/job/grab-platform-001',
        employer_email: 'talent@grab.com',
        jd_text: 'Join Grab Platform Engineering team to build and scale the infrastructure powering Southeast Asia leading super-app. You will work on distributed systems handling millions of requests per second, design fault-tolerant architectures, and collaborate with cross-functional teams to deliver reliable services.',
    },
    debate: {
        ambition: {
            verdict: 'apply',
            ambition_score: 88,
            reasoning: "I'd say this role at Grab offers significant career-ceiling lift. Platform engineering at this scale is a rare opportunity in Singapore that directly leads to Staff/Principal-level positions. The super-app context means exposure to payments, logistics, and ride-hailing infrastructure.",
            key_argument: 'Platform team at a regional tech leader - clear path to Staff Engineer.',
        },
        realism: {
            verdict: 'apply',
            match_score: 76,
            key_gaps: ['Kubernetes orchestration at scale', 'Kafka stream processing'],
            work_life_flags: [],
            reasoning: "I see a strong match on TypeScript, AWS, and distributed systems fundamentals. Minor gaps in container orchestration and stream processing can be bridged within the first quarter given your microservices background.",
            key_argument: '76% match with bridgeable gaps — realistic callback probability.',
        },
        risk: {
            verdict: 'safe',
            risk_score: 18,
            red_flags: [
                { flag: 'Recent 5% workforce reduction in non-core divisions', source: 'TechCrunch, Mar 2025', severity: 'low' },
            ],
            glassdoor_score: 4.1,
            reasoning: "I'd say Grab is financially stable post-profitability with strong market position in SEA. The recent workforce reduction was limited to non-engineering functions, and the engineering team is actively hiring with increased headcount targets.",
            key_argument: 'Profitable super-app with growing engineering team - low risk.',
        },
        opportunity: {
            verdict: 'act_now',
            urgency_score: 91,
            timing_factors: ['Posted 3 days ago', 'Only 12 applicants on MCF', 'Q3 headcount cycle opening'],
            reasoning: "I'd move on this fresh posting — low applicant count during a headcount expansion cycle gives you first-mover advantage before more senior candidates arrive.",
            key_argument: 'Fresh listing + low competition + active hiring cycle.',
        },
    },
    masterDecision: {
        decision: 'apply_consensus',
        summary: 'All four agents recommend applying. Strong alignment between your platform engineering background and Grab requirements, with manageable skill gaps and excellent timing.',
        resume_instructions: 'Emphasise distributed systems experience, AWS infrastructure projects, and any work on high-throughput systems. Highlight TypeScript expertise and microservices architecture.',
        cover_letter_angle: 'Lead with your passion for building reliable infrastructure at scale. Connect your experience to Grab mission of serving millions across Southeast Asia.',
        agents_for: ['ambition', 'realism', 'risk', 'opportunity'],
        agents_against: [],
        user_action_required: false,
    },
    coverLetterText: 'Dear Grab Engineering Team,\n\nI am excited to apply for the Software Engineer, Platform role. With 2 years of experience building distributed TypeScript services on AWS, I am drawn to the challenge of scaling infrastructure that serves millions of users across Southeast Asia.\n\nIn my current role, I designed and implemented a microservices architecture handling 50K requests per second with 99.9% uptime. I am eager to bring this experience to Grab platform team and grow my expertise in container orchestration and stream processing.\n\nI am particularly motivated by Grab mission to drive Southeast Asia forward, and I believe my background in building fault-tolerant systems aligns well with your team focus on reliability at scale.\n\nBest regards,\nRose Lin',
    resumeUrl: null,
};
