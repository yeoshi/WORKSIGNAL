# Requirements Document

## Introduction

WORKSIGNAL is an AI-powered multi-agent job search platform for early-career Singaporeans. Rather than maximising application volume, WORKSIGNAL uses six specialised AI agents that debate whether a user should apply to each job, research company health, track callbacks, learn from outcomes, upskill the user, and surface networking connections. The platform discovers jobs from MyCareersFuture, evaluates them through a four-agent debate orchestrated by AWS Step Functions and AWS Bedrock, applies hard non-negotiable filters and Singapore work-pass guardrails, prepares customised application materials, sends applications, and monitors the user's inbox for replies. The system recalibrates agent behaviour weekly based on real outcomes.

This document specifies the functional requirements for the Minimum Viable Product covering onboarding, the agent debate engine, the job detail review screen, the application pipeline tracker, the Growth Agent, the Network Agent, and the weekly recalibration brief, together with the edge-case adjustments, guardrails, and failure-handling behaviours that span those features.

## Glossary

- **WORKSIGNAL**: The complete multi-agent job search platform, encompassing the web application, backend services, and agent orchestration.
- **User**: An early-career job seeker who has created an account and completed onboarding.
- **Onboarding_Service**: The component that collects and stores the user's profile, calibration settings, and non-negotiables during initial setup.
- **Auth_Service**: The NextAuth-based component that performs Google OAuth sign-in and obtains Gmail read authorisation.
- **Resume_Parser**: The component that extracts a structured profile from an uploaded resume using AWS Bedrock.
- **Opportunity_Scanner**: The component that discovers candidate jobs from the MyCareersFuture API and Exa research, distinct from the debate-stage Opportunity Agent.
- **Pre_Filter**: The non-negotiable hard-filter component that runs before the agent debate and silently discards non-compliant jobs.
- **Debate_Engine**: The AWS Step Functions workflow that coordinates the four debate agents and the Master Orchestrator for each candidate job.
- **Ambition_Agent**: The debate agent that evaluates a job's potential to raise the user's career ceiling.
- **Realism_Agent**: The debate agent that evaluates the user's realistic callback probability for a job.
- **Risk_Agent**: The debate agent that researches company red flags via Exa and assesses application risk.
- **Opportunity_Agent**: The debate agent that evaluates timing advantages and urgency for a job.
- **Master_Orchestrator**: The component that resolves the four agent verdicts into a single decision via override rules and a decision tree.
- **Growth_Agent**: The background agent that produces upskilling roadmaps when a skill gap is flagged repeatedly.
- **Network_Agent**: The background agent that surfaces networking connections and outreach drafts.
- **Recalibration_Engine**: The component that analyses outcomes weekly and adjusts agent thresholds.
- **Application_Tracker**: The component that records sent applications and their statuses.
- **Gmail_Monitor**: The component that polls the user's inbox and classifies replies.
- **Application_Sender**: The component that sends application emails via AWS SES.
- **Career_Stage**: A user attribute with one of the values fresh_grad, early_career, mid_career, senior, or career_switcher.
- **Residency_Status**: A user attribute with one of the values citizen, pr, ep_holder, or need_sponsorship.
- **Non_Negotiable**: A hard constraint set by the user that the Pre_Filter enforces and that no agent may override.
- **Verdict**: A structured JSON evaluation output produced by a single debate agent.
- **Decision**: The Master_Orchestrator's resolved outcome, one of apply_consensus, apply_with_caveat, skip_consensus, deadlock_escalate, or veto_skip.
- **EP_Salary_Floor**: The Employment Pass minimum monthly salary, 5600 SGD for general roles and 6200 SGD for financial-services roles.
- **FCF_Rule**: The Fair Consideration Framework requirement that a role be advertised on MyCareersFuture for 14 days before a foreigner is hired.
- **Classification_Confidence**: A numeric score from 0 to 100 indicating the Gmail_Monitor's certainty when classifying an email reply.
- **Filter_Relaxation_Suggestion**: A concrete proposed adjustment to a Non_Negotiable that WORKSIGNAL derives from recently scanned jobs and presents to the User for explicit approval before any change is applied.

## Requirements

### Requirement 1: Google OAuth Sign-In and Gmail Authorisation

**User Story:** As a job seeker, I want to sign in with my Google account and grant inbox read access, so that WORKSIGNAL can identify me and monitor my job-application replies.

#### Acceptance Criteria

1. WHEN a User initiates sign-in, THE Auth_Service SHALL request Google OAuth authentication with the gmail.readonly scope.
2. WHEN Google OAuth authentication completes successfully, THE Auth_Service SHALL create or retrieve a User record keyed by the Google OAuth subject identifier.
3. WHEN Google OAuth authentication completes successfully, THE Auth_Service SHALL store the user's email address and display name in the User record.
4. WHEN the User grants Gmail read authorisation, THE Auth_Service SHALL store the resulting OAuth token in encrypted form in the User record.
5. IF the User declines Gmail read authorisation, THEN THE Auth_Service SHALL complete sign-in and record that inbox monitoring is unavailable.
6. IF Google OAuth authentication fails, THEN THE Auth_Service SHALL return an authentication-error message and SHALL NOT create a User record.

### Requirement 2: Resume Upload and Parsing

**User Story:** As a job seeker, I want to upload my resume and have it parsed automatically, so that the agents can evaluate jobs against my actual background.

#### Acceptance Criteria

1. WHEN a User uploads a resume file in PDF format, THE Onboarding_Service SHALL store the file in a private S3 bucket and record the S3 key in the User record.
2. WHEN a resume file is stored, THE Resume_Parser SHALL extract current role, years of experience, skills, education, and university into the structured User profile.
3. IF an uploaded file is not in PDF format, THEN THE Onboarding_Service SHALL reject the upload and return a message stating that only PDF files are accepted.
4. IF the Resume_Parser fails to extract a structured profile, THEN THE Onboarding_Service SHALL notify the User that parsing failed and SHALL allow the User to enter profile fields manually.

### Requirement 3: Career Stage and Residency Calibration

**User Story:** As a job seeker, I want to declare my career stage and residency status, so that the agents adjust their evaluation to my situation.

#### Acceptance Criteria

1. THE Onboarding_Service SHALL require the User to select exactly one Career_Stage from fresh_grad, early_career, mid_career, senior, and career_switcher.
2. THE Onboarding_Service SHALL require the User to select exactly one Residency_Status from citizen, pr, ep_holder, and need_sponsorship.
3. WHERE the User selects career_switcher, THE Onboarding_Service SHALL require the User to provide a source field and a target field for the intended career switch.
4. WHEN the User submits Career_Stage and Residency_Status, THE Onboarding_Service SHALL persist both values in the User record.

### Requirement 4: Targets and Priority Ranking

**User Story:** As a job seeker, I want to set my target roles, industries, dream companies, and what matters most to me, so that the agents evaluate jobs against my goals.

#### Acceptance Criteria

1. THE Onboarding_Service SHALL allow the User to enter one or more target roles, target industries, and dream companies.
2. THE Onboarding_Service SHALL allow the User to rank the six priority factors salary, growth, balance, brand, purpose, and stability into an ordered list.
3. WHEN the User submits a priority ranking that contains each of the six factors exactly once, THE Onboarding_Service SHALL persist the ranking as an ordered list of all six factors in the User profile.
4. IF the User submits a priority ranking that omits or duplicates any of the six factors, THEN THE Onboarding_Service SHALL reject the submission, SHALL NOT persist the ranking, and SHALL return a message identifying the missing or duplicated factors.

### Requirement 5: Non-Negotiable Constraints

**User Story:** As a job seeker, I want to set hard filters the agents can never override, so that I never see jobs that violate my deal-breakers.

#### Acceptance Criteria

1. THE Onboarding_Service SHALL allow the User to set a minimum monthly salary, one or more employment types, a work arrangement preference, and zero or more custom dealbreakers as Non_Negotiables.
2. WHEN the User submits Non_Negotiables, THE Onboarding_Service SHALL persist the Non_Negotiables in the User record.
3. WHEN the User sets a minimum monthly salary, THE Onboarding_Service SHALL require the value to be a positive number.
4. WHERE the User has completed onboarding, THE Onboarding_Service SHALL allow the User to edit the User's profile, calibration settings, targets, priority ranking, and Non_Negotiables at any time.
5. WHEN the User saves edited onboarding information, THE Onboarding_Service SHALL persist the updated information and SHALL treat the most recently saved onboarding information as the source of truth for all subsequent agent evaluations and Pre_Filter filtering.

### Requirement 6: Edge-Case Auto-Adjustment

**User Story:** As a job seeker with a specific career situation, I want the agents to adjust their evaluation thresholds automatically, so that recommendations fit my circumstances without manual tuning.

#### Acceptance Criteria

1. WHERE the User's Career_Stage is fresh_grad, THE Onboarding_Service SHALL set the Realism_Agent match threshold to 70 percent for that User.
2. WHERE the User's Career_Stage is senior, THE Onboarding_Service SHALL set the Realism_Agent match threshold to 85 percent for that User.
3. WHERE the User's Residency_Status is need_sponsorship AND the User's target industries do not include financial services, THE Onboarding_Service SHALL set the User's minimum salary floor to 5600 SGD.
4. WHERE the User's Residency_Status is need_sponsorship AND the User's target industries include financial services, THE Onboarding_Service SHALL set the User's minimum salary floor to 6200 SGD.
5. WHERE the User's Career_Stage is career_switcher, THE Master_Orchestrator SHALL weight transferable skills more heavily than direct-field experience when resolving decisions for that User.

### Requirement 7: Scheduled Job Discovery

**User Story:** As a job seeker, I want the platform to find new jobs for me continuously, so that I do not have to search manually.

#### Acceptance Criteria

1. WHEN three hours have elapsed since the previous scan for a User, THE Opportunity_Scanner SHALL query the MyCareersFuture API for jobs matching the User's target roles and industries.
2. WHEN the Opportunity_Scanner retrieves a job, THE Opportunity_Scanner SHALL store the job's company, role title, salary range, description, posting date, source URL, and employer contact email in the Jobs table.
3. WHEN a scan completes for a User, THE Opportunity_Scanner SHALL update the User's last scan timestamp.
4. IF the MyCareersFuture API returns an error or does not respond, THEN THE Opportunity_Scanner SHALL fall back to Exa-based job discovery for that scan.

### Requirement 8: Singapore Geographic Filtering

**User Story:** As a Singapore-based job seeker, I want only Singapore jobs surfaced, so that I never review roles I cannot take.

#### Acceptance Criteria

1. IF a discovered job's location is not Singapore, THEN THE Pre_Filter SHALL discard the job before the agent debate.
2. WHERE a discovered job is fully remote, THE Pre_Filter SHALL retain the job only when the employer is Singapore-based or the role specifies a Singapore time zone.
3. WHEN the Opportunity_Scanner issues an Exa research query, THE Opportunity_Scanner SHALL append the term Singapore to the query.

### Requirement 9: Non-Negotiable Pre-Filter

**User Story:** As a job seeker, I want jobs that violate my hard constraints removed before any agent debate, so that no compute is wasted and I never see invalid matches.

#### Acceptance Criteria

1. WHEN a job enters the Pre_Filter for a User, THE Pre_Filter SHALL evaluate the job against the User's minimum salary, employment type, work arrangement, location, and custom dealbreakers.
2. IF a job violates any of the User's Non_Negotiables, THEN THE Pre_Filter SHALL discard the job without invoking the Debate_Engine and without recording a user-visible entry, while permitting internal logging of the discarded job for analytics.
3. WHERE the User's Residency_Status is need_sponsorship, THE Pre_Filter SHALL discard any job whose maximum salary is below the applicable EP_Salary_Floor.
4. WHERE the User's Residency_Status is need_sponsorship, THE Pre_Filter SHALL retain only jobs that indicate Employment Pass sponsorship is available.
5. WHEN a Pre_Filter run for a User discards every discovered job, THE WORKSIGNAL SHALL notify the User that the configured Non_Negotiables may be too strict.
6. WHEN a Pre_Filter run for a User discards every discovered job, THE WORKSIGNAL SHALL derive a Filter_Relaxation_Suggestion from the jobs scanned in that run that proposes a specific adjustment to a Non_Negotiable and SHALL present the Filter_Relaxation_Suggestion to the User.
7. WHERE a Filter_Relaxation_Suggestion has been presented to the User, THE WORKSIGNAL SHALL apply the suggested adjustment to the User's Non_Negotiables only after the User explicitly approves the Filter_Relaxation_Suggestion.
8. WHILE a Filter_Relaxation_Suggestion is awaiting User approval, THE WORKSIGNAL SHALL leave the User's Non_Negotiables unchanged.

### Requirement 10: Four-Agent Parallel Debate

**User Story:** As a job seeker, I want four agents to evaluate each viable job in parallel, so that I get multiple perspectives quickly.

#### Acceptance Criteria

1. WHEN a job passes the Pre_Filter, THE Debate_Engine SHALL invoke the Ambition_Agent, Realism_Agent, Risk_Agent, and Opportunity_Agent in parallel for that job.
2. WHEN the Ambition_Agent evaluates a job, THE Ambition_Agent SHALL produce a Verdict containing a verdict value, an ambition score from 0 to 100, reasoning, and a key argument.
3. WHEN the Realism_Agent evaluates a job, THE Realism_Agent SHALL produce a Verdict containing a verdict value, a match score from 0 to 100, identified gaps, work-life-balance flags, reasoning, and a key argument.
4. WHEN the Risk_Agent evaluates a job, THE Risk_Agent SHALL research the company via Exa and produce a Verdict containing a verdict value, a risk score from 0 to 100, red flags with sources, a Glassdoor score or a null value, reasoning, and a key argument.
5. WHEN the Opportunity_Agent evaluates a job, THE Opportunity_Agent SHALL produce a Verdict containing a verdict value, an urgency score from 0 to 100, timing factors, reasoning, and a key argument.
6. WHEN all four agents produce Verdicts for a job, THE Debate_Engine SHALL store the four Verdicts in the AgentVerdicts table keyed by the job and User.
7. WHERE the User's Residency_Status is need_sponsorship, THE Opportunity_Agent SHALL include the duration the job has been listed on MyCareersFuture relative to the FCF_Rule in the timing factors.

### Requirement 11: Verdict Output Validity

**User Story:** As a developer, I want every agent verdict to conform to its defined schema, so that the Master Orchestrator can resolve decisions reliably.

#### Acceptance Criteria

1. WHEN any debate agent produces a Verdict, THE Debate_Engine SHALL accept the Verdict only when the Verdict is valid JSON conforming to that agent's defined schema.
2. WHEN any debate agent emits a numeric score, THE Debate_Engine SHALL accept the score only when the value is within the range 0 to 100 inclusive.
3. IF a debate agent produces output that does not conform to its defined schema, THEN THE Debate_Engine SHALL treat that agent's evaluation as failed and apply the agent-failure recovery behaviour.
4. IF invalid agent output is detected after that agent's evaluation has been marked complete, THEN THE Debate_Engine SHALL log the invalid output and preserve the completed evaluation status.

### Requirement 12: Master Orchestrator Resolution

**User Story:** As a job seeker, I want a single clear decision drawn from the four agent verdicts, so that I know whether to apply, skip, or break a tie.

#### Acceptance Criteria

1. IF the Risk_Agent Verdict value is avoid, THEN THE Master_Orchestrator SHALL produce the Decision veto_skip and SHALL NOT permit any override of that Decision.
2. IF the Risk_Agent Verdict value is not avoid AND all four agents return an apply-equivalent verdict, THEN THE Master_Orchestrator SHALL produce the Decision apply_consensus.
3. IF the Risk_Agent Verdict value is not avoid AND exactly three agents return an apply-equivalent verdict, THEN THE Master_Orchestrator SHALL produce the Decision apply_with_caveat and SHALL record the dissenting agent's flagged concern.
4. IF the Risk_Agent Verdict value is not avoid AND exactly two agents return an apply-equivalent verdict, THEN THE Master_Orchestrator SHALL produce the Decision deadlock_escalate.
5. IF the Risk_Agent Verdict value is not avoid AND one or zero agents return an apply-equivalent verdict, THEN THE Master_Orchestrator SHALL produce the Decision skip_consensus.
6. IF the Realism_Agent match score is below 50 AND the resolved Decision would otherwise be an apply-equivalent decision, THEN THE Master_Orchestrator SHALL require explicit User confirmation before any application proceeds.
7. WHEN the Master_Orchestrator produces an apply-equivalent Decision, THE Master_Orchestrator SHALL output resume customisation instructions and a cover-letter angle.
8. WHEN the Master_Orchestrator produces a Decision, THE Master_Orchestrator SHALL record the Decision, a summary, the supporting agents, the opposing agents, and any dissent note in the AgentVerdicts table.

### Requirement 13: Decision Routing

**User Story:** As a job seeker, I want each decision to lead to the right next step, so that I only get notified when action is needed.

#### Acceptance Criteria

1. WHEN the Master_Orchestrator produces apply_consensus or apply_with_caveat, THE Debate_Engine SHALL generate a customised resume and cover letter and queue the application for User review.
2. WHEN the Master_Orchestrator produces deadlock_escalate, THE Debate_Engine SHALL save the debate and notify the User that a tie needs breaking.
3. WHEN the Master_Orchestrator produces skip_consensus, THE Debate_Engine SHALL log the outcome for recalibration without notifying the User.
4. WHEN the Master_Orchestrator produces veto_skip, THE Debate_Engine SHALL log the outcome and SHALL NOT surface the job to the User.
5. WHERE the Opportunity_Agent Verdict value is act_now AND at least two other agents return an apply-equivalent verdict, THE Debate_Engine SHALL place the queued application at the top of the User's review queue.

### Requirement 14: Application Material Generation

**User Story:** As a job seeker, I want a tailored resume and cover letter prepared for each recommended job, so that I can apply with strong materials in one step.

#### Acceptance Criteria

1. WHEN the Debate_Engine generates a customised resume for a job, THE Debate_Engine SHALL apply the Master_Orchestrator's resume customisation instructions and store the resulting resume in S3.
2. WHEN the Debate_Engine generates a cover letter for a job, THE Debate_Engine SHALL apply the Master_Orchestrator's cover-letter angle and store the cover-letter text with the application record.
3. WHERE the User's Residency_Status is need_sponsorship, THE Debate_Engine SHALL include the User's work-authorisation status in the generated cover letter.
4. IF resume customisation fails, THEN THE Debate_Engine SHALL attach the User's base resume to the application and record that customisation was not applied.
5. IF storing a generated resume in S3 fails, THEN THE Debate_Engine SHALL attach the User's base resume to the application and record that customisation was not applied.
6. IF application material generation fails, THEN THE Debate_Engine SHALL queue the application for User review with the available documents.

### Requirement 15: Job Detail Review Screen

**User Story:** As a job seeker, I want a single screen showing the full debate and prepared materials, so that I can decide and act with full context.

#### Acceptance Criteria

1. WHEN a User opens the job detail screen for a queued application, THE WORKSIGNAL SHALL display the job's company, role, salary, and posting time.
2. WHEN a User opens the job detail screen, THE WORKSIGNAL SHALL display one debate card per debate agent showing that agent's verdict, score, reasoning, and key argument.
3. WHEN a User opens the job detail screen, THE WORKSIGNAL SHALL display the Master_Orchestrator decision summary.
4. WHEN a User opens the job detail screen, THE WORKSIGNAL SHALL display the customised resume preview and an editable cover-letter field.
5. WHEN a User opens the job detail screen, THE WORKSIGNAL SHALL display an action bar offering Send, Skip, and Save actions.
6. WHEN a User edits the cover-letter field and triggers Send, THE Application_Sender SHALL use the edited cover-letter text.

### Requirement 16: Sending Applications

**User Story:** As a job seeker, I want to send a prepared application with one action, so that applying is fast and reliable.

#### Acceptance Criteria

1. WHEN a User triggers the Send action for an application AND an employer contact email address is available for the job, THE Application_Sender SHALL send an email to the employer contact address via AWS SES with the customised resume attached and the cover-letter text in the body.
2. WHEN a User triggers the Send action for an application whose Master_Orchestrator Decision was not an apply-equivalent Decision, THE Application_Sender SHALL send the application using the same send behaviour as for an apply-equivalent Decision.
3. WHEN a User triggers the Send action for an application that is not in the queued state, THE Application_Sender SHALL send the application using the same send behaviour as for a queued application.
4. WHEN an application email is sent, THE Application_Sender SHALL set the recipient address to the employer contact address, set the reply-to address to the User's email, and copy the User on the message.
5. WHEN an application email is sent successfully, THE Application_Tracker SHALL create an Application record with status sent, the recipient address, the send timestamp, and the email thread identifier.
6. IF no employer contact email address is available for the job WHEN a User triggers the Send action, THEN THE WORKSIGNAL SHALL display a link that redirects the User to the job's source URL and SHALL make the customised resume and the cover letter available to the User for manual submission through the employer's application form.
7. WHEN the User is redirected to an external job listing because no employer contact email address is available, THE Application_Tracker SHALL create an Application record with status redirected_external, the source URL, and the redirect timestamp.
8. IF AWS SES reports that the application email bounced, THEN THE Application_Tracker SHALL set the Application status to delivery_failed and notify the User.

### Requirement 17: Application Pipeline Tracking

**User Story:** As a job seeker, I want to see all my applications and their current statuses, so that I can track my search at a glance.

#### Acceptance Criteria

1. WHEN a User opens the pipeline view, THE Application_Tracker SHALL display each Application's company, role, send date, and status.
2. IF the pipeline view fails to load Application information, THEN THE Application_Tracker SHALL retry loading automatically in the background without notifying the User.
3. THE Application_Tracker SHALL represent each Application status as exactly one of sent, opened, callback, rejected, ghosted, or redirected_external.
4. WHEN a User selects an Application in the pipeline view, THE WORKSIGNAL SHALL display the original agent debate associated with that Application.

### Requirement 18: Inbox Monitoring and Reply Classification

**User Story:** As a job seeker, I want replies from employers detected and categorised automatically, so that my pipeline stays current without manual updates.

#### Acceptance Criteria

1. WHEN thirty minutes have elapsed since the previous inbox poll for a User, THE Gmail_Monitor SHALL query the User's inbox for replies that may be associated with sent applications.
2. WHEN the Gmail_Monitor evaluates an incoming email, THE Gmail_Monitor SHALL determine whether the email originates from a company associated with a sent application using fuzzy matching across the sender domain, the company name, and the thread identifier, without requiring an exact match to the employer contact address the application was sent to.
3. WHERE a User has more than one sent Application to the same company, THE Gmail_Monitor SHALL determine which specific Application a reply corresponds to using the role title referenced in the reply, the thread identifier, and the application thread the reply belongs to.
4. WHEN the Gmail_Monitor associates a reply with a specific Application, THE Gmail_Monitor SHALL classify the reply as one of acknowledgement, callback, rejection, or other and produce a Classification_Confidence value.
5. WHEN a reply is classified with a Classification_Confidence of 60 or above, THE Application_Tracker SHALL update the corresponding Application status from the classification.
6. IF a reply is classified with a Classification_Confidence below 60, THEN THE Application_Tracker SHALL set the Application status to needs_review.
7. WHEN a new reply is associated with an Application that already has a classified status AND the new reply is classified with a Classification_Confidence of 60 or above, THE Application_Tracker SHALL update the Application status from the new reply's classification regardless of any earlier classification of that Application.
8. IF the User's Gmail OAuth token has expired, THEN THE Gmail_Monitor SHALL prompt the User to re-authorise and SHALL queue the poll for retry.
9. WHEN a sent application has received no reply for 14 days, THE Application_Tracker SHALL set the Application status to ghosted.

### Requirement 19: Growth Agent Roadmaps

**User Story:** As a job seeker, I want a learning plan when the same skill gap keeps blocking me, so that I can become eligible for jobs I currently miss.

#### Acceptance Criteria

1. WHEN the Realism_Agent flags the same skill gap for a User across three or more distinct jobs, THE Growth_Agent SHALL be triggered for that skill gap.
2. WHEN the Growth_Agent is triggered for a skill gap, THE Growth_Agent SHALL search Exa for courses, projects, certifications, and Singapore events relevant to that skill gap.
3. WHEN the Growth_Agent completes research for a skill gap, THE Growth_Agent SHALL produce a four-week roadmap in which each week specifies an action, a resource URL, a cost, a time estimate, and a resource type.
4. WHEN the Growth_Agent produces a roadmap, THE Growth_Agent SHALL store the roadmap in the SkillGaps table with the skill, the times flagged, and a projected match-score improvement.
5. WHEN a User opens the growth roadmap view, THE WORKSIGNAL SHALL display the identified skill gap, the four-week plan with linked resources, and the projected match-score improvement.

### Requirement 20: Network Agent Suggestions

**User Story:** As a job seeker, I want relevant people and events suggested when I show interest in a company, so that I can build connections that improve my chances.

#### Acceptance Criteria

1. WHEN a User sends two or more applications to the same company, THE Network_Agent SHALL be triggered for that company.
2. WHEN the Network_Agent is triggered for a company, THE Network_Agent SHALL search Exa for relevant people, alumni from the User's university, community members, and upcoming Singapore networking events.
3. WHEN the Network_Agent produces connection suggestions, THE Network_Agent SHALL provide at most three suggestions and SHALL order them with alumni first, community members second, and cold contacts last.
4. WHEN the Network_Agent produces a connection suggestion, THE Network_Agent SHALL include a personalised outreach draft for that connection.
5. WHEN a User opens the network suggestions view, THE WORKSIGNAL SHALL display the target company, the connection cards, the draft outreach messages, and the relevant upcoming events.

### Requirement 21: Weekly Recalibration and Brief

**User Story:** As a job seeker, I want the agents to learn from my outcomes each week, so that recommendations improve the longer I use the platform.

#### Acceptance Criteria

1. WHEN the weekly recalibration schedule fires for a User, THE Recalibration_Engine SHALL fetch all applications sent in the previous seven days and their current statuses.
2. WHEN the Recalibration_Engine processes outcomes, THE Recalibration_Engine SHALL compute per-agent accuracy by comparing each agent's verdict against the resulting Application status.
3. WHEN per-agent accuracy indicates a threshold adjustment is warranted, THE Recalibration_Engine SHALL update the affected thresholds in the User's agent weights and record each adjustment with its prior value, new value, and reason.
4. WHEN the Recalibration_Engine completes a weekly run, THE Recalibration_Engine SHALL store the metrics, agent performance, and adjustments in the RecalibrationLog table, and SHALL store the generated brief when brief generation succeeds.
5. WHEN a User opens the weekly brief view, THE WORKSIGNAL SHALL display the applications sent, callbacks, callback rate, per-agent accuracy, and threshold adjustments for the most recent recalibration.
6. IF a User has received zero callbacks across the three most recent weekly recalibrations, THEN THE Recalibration_Engine SHALL perform an emergency recalibration and alert the User.

### Requirement 22: Debate Engine Failure Handling

**User Story:** As a job seeker, I want the platform to degrade gracefully when an external service fails, so that the debate still produces usable results.

#### Acceptance Criteria

1. IF a Bedrock invocation returns a rate-limit response, THEN THE Debate_Engine SHALL retry the invocation with exponential backoff up to three attempts.
2. IF an Exa research query returns no results for the Risk_Agent, THEN THE Risk_Agent SHALL produce a Verdict noting insufficient data and a caution verdict value.
3. IF the Debate_Engine execution exceeds its time limit, THEN THE Debate_Engine SHALL alert the operator and retry the run with a smaller batch of jobs.
4. IF a single debate agent fails to produce a valid Verdict after retries AND at least one other agent produced a valid Verdict, THEN THE Master_Orchestrator SHALL resolve the Decision using the remaining agents and record that an agent verdict was unavailable.
5. IF no debate agent produces a valid Verdict for a job, THEN THE Debate_Engine SHALL abort resolution for that job and log the failure without producing a Decision.
