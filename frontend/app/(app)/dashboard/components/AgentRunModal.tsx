'use client';

import { type JSX, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AgentRunEvent } from '../../../api/agent/run/route';
import type { RunState } from '../hooks/useAgentRun';
import { AgentAvatar } from '../../../components/ui/AgentAvatar';
import { AGENT_THEME } from '../../jobs/components/agentTheme';
import type { AgentName } from '@/app/types/shared';
import {
  buildAgentDetails,
  DECISION_DISPLAY,
  getDisplayDecision,
  toBulletPoints,
  type OrchestratorReasoningEvent,
} from '../lib/agentRunDisplay';

// ── Shared UI primitives ──────────────────────────────────────────────────────

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-ws-line">
        <div
          className="h-1.5 rounded-full transition-all duration-700"
          style={{ width: `${Math.min(100, score)}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-8 text-right font-mono text-[11px] text-ws-muted">{score}</span>
    </div>
  );
}

function BulletList({
  items,
  color,
  emphasized = false,
}: {
  items: string[];
  color: string;
  emphasized?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1">
      {items.map((item, index) => (
        <li
          key={`${item}-${index}`}
          className={[
            'flex items-start gap-2 text-xs leading-relaxed',
            emphasized ? 'font-medium text-ws-ink' : 'text-ws-muted',
          ].join(' ')}
        >
          <span
            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function DetailGroups({
  groups,
  color,
}: {
  groups: Array<{ label: string; values: string[] }>;
  color: string;
}) {
  if (groups.length === 0) return null;
  return (
    <div className="mt-3 space-y-2 border-t border-ws-line pt-2">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ws-muted">
            {group.label}
          </p>
          <BulletList items={group.values} color={color} />
        </div>
      ))}
    </div>
  );
}

// ── Phase blocks ──────────────────────────────────────────────────────────────

function ScanBlock({
  jobs,
}: {
  jobs: Array<{ job_id: string; title: string; company: string; salary: string; days_old: number }>;
}) {
  return (
    <ul className="space-y-1.5">
      {jobs.map((job) => (
        <li key={job.job_id} className="flex items-baseline gap-2 text-sm">
          <span className="truncate font-medium text-ws-ink">{job.title}</span>
          <span className="shrink-0 text-ws-muted">@ {job.company}</span>
          <span className="ml-auto shrink-0 font-mono text-[11px] text-ws-muted">{job.salary}</span>
        </li>
      ))}
    </ul>
  );
}

function PrefilterRow({
  pass,
  title,
  company,
  reasons,
}: {
  pass: boolean;
  title: string;
  company: string;
  reasons: string[];
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className={pass ? 'shrink-0 text-emerald-600' : 'shrink-0 text-red-500'}>
        {pass ? '✓' : '✗'}
      </span>
      <span className="truncate font-medium text-ws-ink">{title}</span>
      <span className="shrink-0 text-ws-muted">@ {company}</span>
      {!pass && reasons.length > 0 && (
        <span className="ml-1 shrink-0 text-[11px] text-ws-muted">[{reasons.join(', ')}]</span>
      )}
    </div>
  );
}

function AgentCard({ event }: { event: Extract<AgentRunEvent, { type: 'agent_result' }> }) {
  const theme = AGENT_THEME[event.agent];
  const reasoningBullets = toBulletPoints(event.reasoning);
  const keyPoint = event.key_argument.trim();
  const details = buildAgentDetails(event);

  const verdictBg =
    event.verdict === 'apply' || event.verdict === 'act_now'
      ? 'bg-emerald-50 text-emerald-700'
      : event.verdict === 'skip'
        ? 'bg-ws-paper text-ws-muted'
        : event.verdict === 'caution'
          ? 'bg-amber-50 text-amber-700'
          : event.verdict === 'avoid'
            ? 'bg-red-50 text-red-700'
            : 'bg-ws-paper text-ws-muted';

  return (
    <article
      className="rounded-xl border border-ws-line bg-ws-paper p-3"
      style={{ borderTopColor: theme.color, borderTopWidth: 3 }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <AgentAvatar agent={event.agent} size={40} />
          <span className="text-sm font-semibold" style={{ color: theme.color }}>
            {theme.label}
          </span>
        </div>
        <span
          className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${verdictBg}`}
        >
          {event.verdict}
        </span>
      </div>

      <ScoreBar score={event.score} color={theme.color} />

      {keyPoint ? (
        <BulletList items={[keyPoint]} color={theme.color} emphasized />
      ) : null}

      <BulletList items={reasoningBullets} color={theme.color} />
      <DetailGroups groups={details} color={theme.color} />
    </article>
  );
}

function OrchestratorBlock({ event }: { event: OrchestratorReasoningEvent }) {
  const [expanded, setExpanded] = useState(false);
  const display = getDisplayDecision('deadlock_escalate', event);

  const actionLabel =
    event.action === 'apply'
      ? 'Apply now'
      : event.action === 'upskill'
        ? 'Build skills first'
        : 'Hold';

  return (
    <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AgentAvatar agent="orchestrator" size={40} />
          <div>
            <p className="text-sm font-semibold text-indigo-800">Orchestrator decision</p>
            <p className="text-[11px] text-indigo-600/80">{actionLabel}</p>
          </div>
        </div>
        <span
          className={`rounded border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${display.className}`}
        >
          {display.label}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[11px] text-ws-muted">
        {Object.entries(event.scores).map(([agent, score]) => (
          <div key={agent} className="flex items-center gap-1">
            <span className="capitalize text-ws-ink">{agent}</span>
            <span className="ml-auto text-[10px]">{score}</span>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-indigo-100">
          <div
            className="h-1.5 rounded-full bg-indigo-500 transition-all duration-700"
            style={{ width: `${event.confidence}%` }}
          />
        </div>
        <span className="w-8 text-right font-mono text-[11px] text-ws-muted">
          {event.confidence}%
        </span>
      </div>

      <BulletList items={[event.deciding_factor]} color="#4F46E5" emphasized />

      {event.apply_angle ? (
        <BulletList items={[`Application angle: ${event.apply_angle}`]} color="#4F46E5" />
      ) : null}

      {event.upskill_targets && event.upskill_targets.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {event.upskill_targets.map((skill) => (
            <span
              key={skill}
              className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800"
            >
              {skill}
            </span>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="mt-2 flex items-center gap-1 text-[11px] font-medium text-indigo-500 hover:text-indigo-700"
      >
        {expanded ? '▲ Hide full reasoning' : '▼ Full reasoning'}
      </button>
      {expanded ? (
        <BulletList items={toBulletPoints(event.holistic_summary)} color="#4F46E5" />
      ) : null}
    </div>
  );
}

function DecisionBadge({
  decision,
  summary,
  orchestrator,
}: {
  decision: string;
  summary: string | null;
  orchestrator?: OrchestratorReasoningEvent;
}) {
  const meta = getDisplayDecision(decision, orchestrator);
  return (
    <div className={`rounded-lg border px-3 py-2 ${meta.className}`}>
      <p className="text-sm font-semibold">{meta.label}</p>
      {summary ? <p className="mt-0.5 text-xs opacity-80">{summary}</p> : null}
    </div>
  );
}

function PhaseSegment({
  step,
  title,
  badge,
  children,
  empty,
}: {
  step: number;
  title: string;
  badge?: string;
  children: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <section className="rounded-xl border border-ws-line bg-ws-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ws-teal/10 text-[11px] font-bold text-ws-teal">
          {step}
        </span>
        <h3 className="text-sm font-semibold text-ws-ink">{title}</h3>
        {badge ? (
          <span className="ml-1 rounded-full border border-ws-line bg-ws-paper px-2 py-0.5 text-[11px] text-ws-muted">
            {badge}
          </span>
        ) : null}
      </div>
      {empty ? (
        <p className="text-xs text-ws-muted">Waiting for results…</p>
      ) : (
        children
      )}
    </section>
  );
}

// ── Event parsing ─────────────────────────────────────────────────────────────

type DebateResult = Extract<AgentRunEvent, { type: 'debate_result' }>;

interface DebateBlock {
  title: string;
  company: string;
  salary: string;
  agents: AgentRunEvent[];
  decision?: DebateResult;
  orchestratorReasoning?: OrchestratorReasoningEvent;
}

interface ParsedRun {
  scanJobs: Array<{
    job_id: string;
    title: string;
    company: string;
    salary: string;
    days_old: number;
  }>;
  prefilterRows: JSX.Element[];
  passCount: number;
  prefilterTotal: number;
  debates: DebateBlock[];
  scanStarted: boolean;
  prefilterStarted: boolean;
}

function parseEvents(events: AgentRunEvent[]): ParsedRun {
  let scanJobs: ParsedRun['scanJobs'] = [];
  const prefilterRows: JSX.Element[] = [];
  let passCount = 0;
  let prefilterTotal = 0;
  let currentDebate: DebateBlock | null = null;
  const debates: DebateBlock[] = [];
  let scanStarted = false;
  let prefilterStarted = false;

  for (const event of events) {
    if (event.type === 'scan_start') scanStarted = true;
    if (event.type === 'scan_complete') scanJobs = event.jobs;
    if (event.type === 'prefilter_result') {
      prefilterStarted = true;
      prefilterTotal += 1;
      if (event.pass) passCount += 1;
      prefilterRows.push(
        <PrefilterRow
          key={event.job_id}
          pass={event.pass}
          title={event.title}
          company={event.company}
          reasons={event.reasons}
        />,
      );
    } else if (event.type === 'debate_start') {
      currentDebate = {
        title: event.title,
        company: event.company,
        salary: event.salary,
        agents: [],
      };
    } else if (
      (event.type === 'agent_result' ||
        event.type === 'agent_failed' ||
        event.type === 'exa_research' ||
        event.type === 'db_persist') &&
      currentDebate
    ) {
      currentDebate.agents.push(event);
    } else if (event.type === 'orchestrator_reasoning' && currentDebate) {
      currentDebate.orchestratorReasoning = event;
    } else if (event.type === 'debate_result') {
      if (currentDebate) {
        currentDebate.decision = event;
        debates.push(currentDebate);
        currentDebate = null;
      }
    }
  }

  if (currentDebate) debates.push(currentDebate);

  return {
    scanJobs,
    prefilterRows,
    passCount,
    prefilterTotal,
    debates,
    scanStarted,
    prefilterStarted,
  };
}

function JobDebateCard({ debate }: { debate: DebateBlock }) {
  const agentResults = debate.agents.filter(
    (event): event is Extract<AgentRunEvent, { type: 'agent_result' }> =>
      event.type === 'agent_result',
  );
  const exaQueries = debate.agents.filter(
    (event): event is Extract<AgentRunEvent, { type: 'exa_research' }> =>
      event.type === 'exa_research',
  );
  const failedAgents = debate.agents.filter(
    (event): event is Extract<AgentRunEvent, { type: 'agent_failed' }> =>
      event.type === 'agent_failed',
  );
  const persistEvents = debate.agents.filter(
    (event): event is Extract<AgentRunEvent, { type: 'db_persist' }> =>
      event.type === 'db_persist',
  );
  const isRunning = !debate.decision && agentResults.length < 4;

  return (
    <div className="rounded-lg border border-ws-line bg-ws-paper p-3">
      <div className="mb-3 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ws-ink">{debate.title}</p>
          <p className="text-[11px] text-ws-muted">
            {debate.company}
            {debate.salary ? ` · ${debate.salary}` : ''}
          </p>
        </div>
        {isRunning ? (
          <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-ws-teal">
            <span className="h-2 w-2 animate-spin rounded-full border-2 border-ws-teal border-t-transparent" />
            Debating
          </span>
        ) : null}
      </div>

      {exaQueries.length > 0 ? (
        <ul className="mb-2 space-y-0.5">
          {exaQueries.map((query, index) => (
            <li key={index} className="text-[11px] text-ws-muted">
              <span className="text-amber-500">Exa</span> researching: {query.query}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid grid-cols-1 gap-2">
        {(['ambition', 'realism', 'risk', 'opportunity'] as AgentName[]).map((agent) => {
          const result = agentResults.find((entry) => entry.agent === agent);
          if (result) return <AgentCard key={agent} event={result} />;
          if (isRunning) {
            const theme = AGENT_THEME[agent];
            return (
              <div
                key={agent}
                className="flex items-center gap-2 rounded-xl border border-dashed border-ws-line bg-ws-card/50 p-3"
              >
                <AgentAvatar agent={agent} size={32} className="opacity-50" />
                <span className="text-xs text-ws-muted">{theme.label} — waiting…</span>
              </div>
            );
          }
          return null;
        })}
      </div>

      {failedAgents.length > 0 ? (
        <p className="mt-2 text-[11px] text-amber-600">
          Failed agents: {failedAgents.map((entry) => entry.agent).join(', ')}
        </p>
      ) : null}

      {debate.orchestratorReasoning ? (
        <OrchestratorBlock event={debate.orchestratorReasoning} />
      ) : debate.decision ? (
        <div className="mt-3">
          <DecisionBadge
            decision={debate.decision.decision}
            summary={debate.decision.summary}
          />
        </div>
      ) : null}

      {persistEvents.length > 0 ? (
        <div className="mt-2 space-y-0.5 border-t border-ws-line pt-2">
          {persistEvents.map((entry, index) => (
            <p key={index} className="flex items-center gap-1.5 font-mono text-[11px] text-ws-muted">
              <span className="text-ws-teal">✓</span>
              {entry.step === 'verdicts'
                ? 'Agent verdicts saved'
                : `Decision saved (${entry.decision ?? '?'})`}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

interface AgentRunModalProps {
  open: boolean;
  state: RunState;
  events: AgentRunEvent[];
  onClose: () => void;
}

export function AgentRunModal({ open, state, events, onClose }: AgentRunModalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!open) setCollapsed(false);
  }, [open]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || collapsed) return;
    const nearBottom =
      element.scrollTop > element.scrollHeight - element.clientHeight - 200;
    if (nearBottom) element.scrollTop = element.scrollHeight;
  }, [events.length, collapsed]);

  if (!open) return null;

  const startEvent = events.find(
    (event): event is Extract<AgentRunEvent, { type: 'start' }> => event.type === 'start',
  );
  const completeEvent = events.find(
    (event): event is Extract<AgentRunEvent, { type: 'run_complete' }> =>
      event.type === 'run_complete',
  );
  const errorEvent = events.find(
    (event): event is Extract<AgentRunEvent, { type: 'error' }> => event.type === 'error',
  );

  const parsed = parseEvents(events);
  const activeDebates = parsed.debates.filter((debate) => !debate.decision).length;
  const completedDebates = parsed.debates.length - activeDebates;

  const waitingMessage = (() => {
    const last = events[events.length - 1];
    if (!last) return 'Connecting to pipeline…';
    if (last.type === 'start') return 'Loading agent modules…';
    if (last.type === 'scan_start') return 'Scanning MyCareersFuture for matching roles…';
    if (last.type === 'scan_complete') {
      return last.count === 0
        ? 'No new jobs matched this scan. Wrapping up…'
        : 'Filtering jobs against your preferences…';
    }
    if (last.type === 'prefilter_summary') return 'Starting job analysis…';
    return 'Running pipeline…';
  })();

  const handleBackdropClick = () => {
    if (state === 'running') {
      setCollapsed(true);
      return;
    }
    onClose();
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="fixed right-0 top-1/2 z-50 flex -translate-y-1/2 flex-col items-center gap-2 rounded-l-2xl border border-r-0 border-ws-line bg-ws-card px-2.5 py-4 shadow-2xl transition hover:bg-ws-paper"
        aria-label="Expand agent run panel"
      >
        {state === 'running' ? (
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-ws-teal" />
        ) : state === 'complete' ? (
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
        ) : (
          <span className="h-2.5 w-2.5 rounded-full bg-ws-muted" />
        )}
        <ChevronLeft className="h-4 w-4 text-ws-muted" aria-hidden />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ws-muted [writing-mode:vertical-rl]">
          Agent
        </span>
        {parsed.debates.length > 0 ? (
          <span className="rounded-full bg-ws-teal/10 px-1.5 py-0.5 text-[10px] font-medium text-ws-teal">
            {completedDebates}/{parsed.debates.length}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end p-0 sm:items-start sm:justify-end sm:p-4"
      aria-modal
      role="dialog"
      aria-label="WorkSignal Agent Run"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleBackdropClick}
      />

      <div className="relative z-10 flex h-[92dvh] w-full flex-col rounded-t-2xl bg-ws-card shadow-2xl sm:h-[90vh] sm:w-[680px] sm:rounded-2xl">
        <div className="flex shrink-0 items-center gap-3 border-b border-ws-line px-5 py-4">
          <div className="flex min-w-0 items-center gap-2">
            {state === 'running' ? (
              <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-ws-teal" />
            ) : null}
            {state === 'complete' ? (
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
            ) : null}
            {state === 'error' ? (
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
            ) : null}
            {state === 'idle' ? (
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-ws-muted" />
            ) : null}
            <h2 className="font-semibold text-ws-ink">WorkSignal Agent</h2>
            {startEvent ? (
              <span className="truncate text-xs text-ws-muted">— {startEvent.user_name}</span>
            ) : null}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {state === 'running' ? (
              <span className="animate-pulse text-xs text-ws-muted">Running pipeline…</span>
            ) : null}
            {state === 'complete' && completeEvent ? (
              <span className="text-xs font-medium text-emerald-600">
                Done in {completeEvent.elapsed_s.toFixed(1)}s
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-ws-muted transition hover:bg-ws-paper hover:text-ws-ink"
              aria-label="Collapse panel"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
            {state !== 'running' ? (
              <button
                type="button"
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-md text-ws-muted transition hover:bg-ws-paper hover:text-ws-ink"
                aria-label="Close"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            ) : null}
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {parsed.scanJobs.length === 0 &&
          parsed.prefilterRows.length === 0 &&
          parsed.debates.length === 0 &&
          state === 'running' ? (
            <div className="flex flex-col items-center justify-center gap-4 py-20">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-ws-teal border-t-transparent" />
              <p className="text-sm text-ws-muted">{waitingMessage}</p>
            </div>
          ) : null}

          <PhaseSegment
            step={1}
            title="MCF Scan"
            badge={parsed.scanJobs.length > 0 ? `${parsed.scanJobs.length} found` : undefined}
            empty={parsed.scanJobs.length === 0 && !parsed.scanStarted}
          >
            <ScanBlock jobs={parsed.scanJobs} />
          </PhaseSegment>

          <PhaseSegment
            step={2}
            title="Pre-filter"
            badge={
              parsed.prefilterTotal > 0
                ? `${parsed.passCount}/${parsed.prefilterTotal} passed`
                : undefined
            }
            empty={parsed.prefilterRows.length === 0 && !parsed.prefilterStarted}
          >
            <div className="space-y-1">{parsed.prefilterRows}</div>
          </PhaseSegment>

          <PhaseSegment
            step={3}
            title="Job analysis"
            badge={
              parsed.debates.length > 0
                ? activeDebates > 0
                  ? `${activeDebates} in progress`
                  : `${parsed.debates.length} complete`
                : undefined
            }
            empty={parsed.debates.length === 0 && !parsed.prefilterStarted}
          >
            <div className="space-y-3">
              {parsed.debates.map((debate) => (
                <JobDebateCard
                  key={debate.decision?.verdict_id ?? `${debate.title}-${debate.company}`}
                  debate={debate}
                />
              ))}
            </div>
          </PhaseSegment>

          {completeEvent ? (
            <div className="rounded-xl border border-ws-teal/30 bg-ws-teal/5 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ws-ink">Run complete</p>
                <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  Dashboard refreshed
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-lg font-bold text-ws-ink">{completeEvent.scanned}</p>
                  <p className="text-[11px] text-ws-muted">scanned</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-ws-ink">{completeEvent.survivors}</p>
                  <p className="text-[11px] text-ws-muted">debated</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-emerald-600">
                    {(completeEvent.tally.apply_consensus ?? 0) +
                      (completeEvent.tally.apply_with_caveat ?? 0)}
                  </p>
                  <p className="text-[11px] text-ws-muted">to apply</p>
                </div>
              </div>
              {Object.entries(completeEvent.tally).length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(completeEvent.tally).map(([decision, count]) => {
                    const meta = DECISION_DISPLAY[decision] ?? DECISION_DISPLAY.no_decision!;
                    return (
                      <span
                        key={decision}
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.className}`}
                      >
                        {count}× {meta.label}
                      </span>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          {errorEvent ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-700">Pipeline error</p>
              <p className="mt-1 text-xs text-red-600">{errorEvent.message}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
