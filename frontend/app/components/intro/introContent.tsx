import type { ExtendedAgentName } from '@/app/lib/agentAvatars';
import type { SegmentIntroKey } from '@/app/lib/segmentIntroStorage';

export interface IntroAgentCard {
  agent: ExtendedAgentName;
  name: string;
  role: string;
  description: string;
}

export interface IntroSlide {
  title: string;
  body?: string;
  bullets?: string[];
  agents?: IntroAgentCard[];
}

export interface SegmentIntroContent {
  title: string;
  slides: IntroSlide[];
}

export const SEGMENT_INTROS: Record<SegmentIntroKey, SegmentIntroContent> = {
  dashboard: {
    title: 'Meet your job-search team',
    slides: [
      {
        title: 'Five agents, one mission',
        body: 'WorkSignal runs a panel of AI agents that debate every role before it enters your pipeline. Each agent brings a different lens so you only pursue jobs that fit your goals, skills, and risk tolerance.',
        agents: [
          {
            agent: 'ambition',
            name: 'Ambition',
            role: 'Career ceiling',
            description: 'Scores how much a role lifts your long-term trajectory.',
          },
          {
            agent: 'realism',
            name: 'Realism',
            role: 'Profile match',
            description: 'Checks whether your skills and experience actually fit the listing.',
          },
          {
            agent: 'opportunity',
            name: 'Opportunity',
            role: 'Timing & urgency',
            description: 'Flags roles where acting now matters — before the window closes.',
          },
          {
            agent: 'risk',
            name: 'Risk',
            role: 'Red flags',
            description: 'Surfaces layoffs, churn, and other signals from live research.',
          },
          {
            agent: 'orchestrator',
            name: 'Orchestrator',
            role: 'Final decision',
            description: 'Breaks deadlocks and decides what moves forward into your pipeline.',
          },
        ],
      },
      {
        title: 'Try it with Run Agent',
        body: 'For this demo, tap Run Agent on your dashboard to scrape ten jobs and watch the full debate live.',
        bullets: [
          'Roles the agents approve with a hiring email are sent automatically.',
          'Approved roles without an email land in Pending Send — apply on the job site yourself.',
          'Roles that still need your judgment appear in Needs Decision.',
          'Companies that never replied live under the Ghosted tab.',
        ],
      },
    ],
  },
  brief: {
    title: 'Your weekly report',
    slides: [
      {
        title: 'What the Weekly Brief shows',
        body: 'Each week, WorkSignal summarises how your applications performed — callbacks, rejections, and what your agents learned from the results.',
        agents: [
          {
            agent: 'recalibration',
            name: 'Recalibration Agent',
            role: 'Agent weighting',
            description:
              'Reviews past performance and adjusts how much Ambition, Realism, Risk, and Opportunity influence future debates — so callback success improves over time.',
          },
        ],
      },
    ],
  },
  growth: {
    title: 'Growth roadmap',
    slides: [
      {
        title: 'Close skill gaps before the next scan',
        body: 'The Growth Agent studies your application history and debate verdicts to find recurring weaknesses holding you back.',
        agents: [
          {
            agent: 'growth',
            name: 'Growth Agent',
            role: 'Skill roadmaps',
            description:
              'Builds week-by-week plans to close gaps, updates your resume as you progress, and makes you more hireable for the roles you want.',
          },
        ],
      },
    ],
  },
  network: {
    title: 'Network intelligence',
    slides: [
      {
        title: 'Warm intros beat cold applications',
        body: 'The Network Agent maps your target companies and dream roles to people you should reach out to — alumni, peers, and second-degree connections who can refer you in.',
        agents: [
          {
            agent: 'network',
            name: 'Network Agent',
            role: 'Outreach targets',
            description:
              'Suggests who to contact at each company so you increase your odds of getting hired, especially when you already share a connection.',
          },
        ],
      },
    ],
  },
};
