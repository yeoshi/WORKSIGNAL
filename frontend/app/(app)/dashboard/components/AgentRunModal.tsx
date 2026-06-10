'use client';

import { type JSX, useEffect, useRef, useState } from 'react';
import type { AgentRunEvent } from '../../../api/agent/run/route';
import type { RunState } from '../hooks/useAgentRun';

// ── Helpers ─────────────────────────────────────────────────────────────────

const AGENT_META = {
    ambition:    { emoji: '🚀', label: 'Ambition',    color: 'text-violet-600' },
    realism:     { emoji: '🎯', label: 'Realism',     color: 'text-blue-600'   },
    risk:        { emoji: '🛡', label: 'Risk',        color: 'text-orange-600' },
    opportunity: { emoji: '⚡', label: 'Opportunity', color: 'text-emerald-600'},
} as const;

const DECISION_META: Record<string, { label: string; className: string }> = {
    apply_consensus:   { label: '✅ APPLY — consensus',      className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    apply_with_caveat: { label: '✅ APPLY — with caveat',    className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    deadlock_escalate: { label: '⚠️ DEADLOCK — needs you',  className: 'bg-amber-50  text-amber-700  border-amber-200'   },
    skip_consensus:    { label: '⏩ SKIP — agents agree',    className: 'bg-ws-paper  text-ws-muted  border-ws-line'     },
    veto_skip:         { label: '🚫 VETO — risk blocked',   className: 'bg-red-50    text-red-700   border-red-200'     },
    no_decision:       { label: '? No decision',             className: 'bg-ws-paper  text-ws-muted  border-ws-line'     },
};

function ScoreBar({ score, colorClass }: { score: number; colorClass: string }) {
    return (
        <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-ws-line">
                <div
                    className={`h-1.5 rounded-full transition-all duration-700 ${colorClass}`}
                    style={{ width: `${Math.min(100, score)}%` }}
                />
            </div>
            <span className="w-7 text-right font-mono text-[11px] text-ws-muted">{score}</span>
        </div>
    );
}

// ── Sub-components rendered per-event ────────────────────────────────────────

function ScanBlock({ jobs }: { jobs: Array<{ job_id: string; title: string; company: string; salary: string; days_old: number }> }) {
    return (
        <div className="space-y-1">
            {jobs.map((j) => (
                <div key={j.job_id} className="flex items-baseline gap-2 text-sm">
                    <span className="text-ws-ink font-medium truncate">{j.title}</span>
                    <span className="text-ws-muted shrink-0">@ {j.company}</span>
                    <span className="ml-auto shrink-0 font-mono text-[11px] text-ws-muted">{j.salary}</span>
                </div>
            ))}
        </div>
    );
}

function PrefilterRow({ pass, title, company, reasons }: { pass: boolean; title: string; company: string; reasons: string[] }) {
    return (
        <div className="flex items-start gap-2 text-sm">
            <span className={pass ? 'text-emerald-600 shrink-0' : 'text-red-500 shrink-0'}>{pass ? '✓' : '✗'}</span>
            <span className="font-medium text-ws-ink truncate">{title}</span>
            <span className="text-ws-muted shrink-0">@ {company}</span>
            {!pass && reasons.length > 0 && (
                <span className="ml-1 text-ws-muted text-[11px] shrink-0">[{reasons.join(', ')}]</span>
            )}
        </div>
    );
}

function AgentCardExtra({ event }: { event: Extract<AgentRunEvent, { type: 'agent_result' }> }): JSX.Element | null {
    const extra = event.extra as Record<string, unknown> | undefined;
    if (!extra) return null;

    if (event.agent === 'realism') {
        const gaps = extra.gaps as string[] | undefined;
        if (!gaps?.length) return null;
        return (
            <div className="mt-2 flex flex-wrap gap-1">
                {gaps.map((g) => (
                    <span key={g} className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">{g}</span>
                ))}
            </div>
        );
    }

    if (event.agent === 'risk') {
        const flags = extra.red_flags as Array<{ flag: string; severity: string }> | undefined;
        if (!flags?.length) return null;
        return (
            <div className="mt-2 space-y-0.5">
                {flags.map((rf, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-[11px]">
                        <span className="text-red-400">⚑</span>
                        <span className="text-ws-muted">{rf.flag}</span>
                        <span className={`ml-auto shrink-0 font-medium ${rf.severity === 'high' ? 'text-red-600' : 'text-amber-600'}`}>{rf.severity}</span>
                    </div>
                ))}
            </div>
        );
    }

    if (event.agent === 'opportunity') {
        const factors = extra.timing_factors as string[] | undefined;
        if (!factors?.length) return null;
        return (
            <div className="mt-2 flex flex-wrap gap-1">
                {factors.map((t) => (
                    <span key={t} className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">{t}</span>
                ))}
            </div>
        );
    }

    return null;
}

function AgentCard({ event }: { event: Extract<AgentRunEvent, { type: 'agent_result' }> }) {
    const meta = AGENT_META[event.agent];
    const scoreColorMap: Record<string, string> = {
        ambition:    'bg-violet-400',
        realism:     'bg-blue-400',
        risk:        'bg-orange-400',
        opportunity: 'bg-emerald-400',
    };

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
        <div className="rounded-lg border border-ws-line bg-ws-paper p-3">
            <div className="flex items-center justify-between gap-2">
                <span className={`text-sm font-semibold ${meta.color}`}>
                    {meta.emoji} {meta.label}
                </span>
                <span className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${verdictBg}`}>
                    {event.verdict}
                </span>
            </div>

            <ScoreBar score={event.score} colorClass={scoreColorMap[event.agent] ?? 'bg-ws-teal'} />

            <p className="mt-2 text-xs leading-relaxed text-ws-muted">{event.reasoning}</p>

            <p className="mt-1.5 border-l-2 border-ws-teal pl-2 text-xs font-medium text-ws-ink">
                {event.key_argument}
            </p>

            <AgentCardExtra event={event} />
        </div>
    );
}

function DecisionBadge({ decision, summary }: { decision: string; summary: string | null }) {
    const meta = DECISION_META[decision] ?? DECISION_META.no_decision!;
    return (
        <div className={`rounded-lg border px-3 py-2 ${meta.className}`}>
            <p className="font-semibold text-sm">{meta.label}</p>
            {summary && <p className="mt-0.5 text-xs opacity-80">{summary}</p>}
        </div>
    );
}

// ── Orchestrator reasoning block ──────────────────────────────────────────────

type OrchestratorReasoningEvent = Extract<AgentRunEvent, { type: 'orchestrator_reasoning' }>;

const ACTION_META: Record<string, { label: string; bg: string; text: string; icon: string }> = {
    apply:   { label: 'APPLY',              bg: 'bg-emerald-50', text: 'text-emerald-700', icon: '✅' },
    upskill: { label: 'BUILD SKILLS FIRST', bg: 'bg-amber-50',   text: 'text-amber-700',   icon: '🧠' },
    hold:    { label: 'HOLD',               bg: 'bg-gray-50',    text: 'text-gray-600',    icon: '⏸' },
};

function OrchestratorBlock({ event }: { event: OrchestratorReasoningEvent }) {
    const [expanded, setExpanded] = useState(false);
    const meta = ACTION_META[event.action] ?? ACTION_META.hold!;

    return (
        <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
            {/* Header */}
            <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-indigo-700">🧩 Orchestrator resolved deadlock</span>
                <span className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${meta.bg} ${meta.text}`}>
                    {meta.icon} {meta.label}
                </span>
            </div>

            {/* Score table */}
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[11px] text-ws-muted">
                {Object.entries(event.scores).map(([agent, score]) => (
                    <div key={agent} className="flex items-center gap-1">
                        <span className="capitalize text-ws-ink">{agent}</span>
                        <span className="ml-auto text-[10px]">{score}</span>
                    </div>
                ))}
            </div>

            {/* Confidence bar */}
            <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-indigo-100">
                    <div
                        className="h-1.5 rounded-full bg-indigo-500 transition-all duration-700"
                        style={{ width: `${event.confidence}%` }}
                    />
                </div>
                <span className="w-8 text-right font-mono text-[11px] text-ws-muted">{event.confidence}%</span>
            </div>

            {/* Deciding factor — always visible */}
            <p className="mt-2 border-l-2 border-indigo-400 pl-2 text-xs font-medium text-ws-ink">
                {event.deciding_factor}
            </p>

            {/* Apply angle / upskill targets */}
            {event.apply_angle && (
                <p className="mt-1.5 text-[11px] text-ws-muted">
                    <span className="text-ws-ink">Angle: </span>{event.apply_angle}
                </p>
            )}
            {event.upskill_targets && event.upskill_targets.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                    {event.upskill_targets.map((s) => (
                        <span key={s} className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">{s}</span>
                    ))}
                </div>
            )}

            {/* Full holistic summary — collapsible */}
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-2 flex items-center gap-1 text-[11px] font-medium text-indigo-500 hover:text-indigo-700"
            >
                {expanded ? '▲ Hide full reasoning' : '▼ Full reasoning'}
            </button>
            {expanded && (
                <p className="mt-1.5 text-xs leading-relaxed text-ws-muted">{event.holistic_summary}</p>
            )}
        </div>
    );
}

// ── Types for rendering ───────────────────────────────────────────────────────

type DebateResult = Extract<AgentRunEvent, { type: 'debate_result' }>;

interface DebateBlock {
    title: string;
    company: string;
    salary: string;
    agents: AgentRunEvent[];
    decision?: DebateResult;
    orchestratorReasoning?: OrchestratorReasoningEvent;
}

// ── Event renderer ────────────────────────────────────────────────────────────

function renderEvents(events: AgentRunEvent[]): JSX.Element[] {
    const sections: JSX.Element[] = [];
    let scanJobs: Array<{ job_id: string; title: string; company: string; salary: string; days_old: number }> = [];
    const prefilterRows: JSX.Element[] = [];
    let currentDebate: DebateBlock | null = null;
    const debates: DebateBlock[] = [];

    for (const ev of events) {
        if (ev.type === 'scan_complete') {
            scanJobs = ev.jobs;
        } else if (ev.type === 'prefilter_result') {
            prefilterRows.push(
                <PrefilterRow key={ev.job_id} pass={ev.pass} title={ev.title} company={ev.company} reasons={ev.reasons} />
            );
        } else if (ev.type === 'debate_start') {
            currentDebate = { title: ev.title, company: ev.company, salary: ev.salary, agents: [] };
        } else if ((ev.type === 'agent_result' || ev.type === 'agent_failed' || ev.type === 'exa_research' || ev.type === 'db_persist') && currentDebate) {
            currentDebate.agents.push(ev);
        } else if (ev.type === 'orchestrator_reasoning' && currentDebate) {
            currentDebate.orchestratorReasoning = ev;
        } else if (ev.type === 'debate_result') {
            if (currentDebate) {
                currentDebate.decision = ev;
                debates.push(currentDebate);
                currentDebate = null;
            }
        }
    }

    // Still-running debate
    if (currentDebate) debates.push(currentDebate);

    if (scanJobs.length > 0) {
        sections.push(
            <Section key="scan" emoji="🔍" title="MCF Scan" badge={`${scanJobs.length} found`}>
                <ScanBlock jobs={scanJobs} />
            </Section>
        );
    }

    if (prefilterRows.length > 0) {
        const total = prefilterRows.length;
        const passCount = events.filter((e): e is Extract<AgentRunEvent, { type: 'prefilter_result' }> => e.type === 'prefilter_result' && e.pass).length;
        sections.push(
            <Section key="filter" emoji="⚙️" title="Pre-filter" badge={`${passCount}/${total} passed`}>
                <div className="space-y-1">{prefilterRows}</div>
            </Section>
        );
    }

    for (const d of debates) {
        const agentResults = d.agents.filter((e): e is Extract<AgentRunEvent, { type: 'agent_result' }> => e.type === 'agent_result');
        const exaQueries = d.agents.filter((e): e is Extract<AgentRunEvent, { type: 'exa_research' }> => e.type === 'exa_research');
        const failedAgents = d.agents.filter((e): e is Extract<AgentRunEvent, { type: 'agent_failed' }> => e.type === 'agent_failed');
        const persistEvents = d.agents.filter((e): e is Extract<AgentRunEvent, { type: 'db_persist' }> => e.type === 'db_persist');

        sections.push(
            <Section
                key={d.decision?.verdict_id ?? `${d.title}-${d.company}`}
                emoji="🤖"
                title={d.title}
                badge={d.company}
                sub={d.salary}
            >
                {exaQueries.length > 0 && (
                    <div className="mb-2 space-y-0.5">
                        {exaQueries.map((eq, i) => (
                            <p key={i} className="text-[11px] text-ws-muted">
                                <span className="text-amber-500">Exa</span> researching: {eq.query}
                            </p>
                        ))}
                    </div>
                )}

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {agentResults.map((ar) => (
                        <AgentCard key={ar.agent} event={ar} />
                    ))}
                </div>

                {failedAgents.length > 0 && (
                    <p className="mt-1 text-[11px] text-amber-600">
                        ⚠ Failed agents: {failedAgents.map((f) => f.agent).join(', ')}
                    </p>
                )}

                {d.orchestratorReasoning && (
                    <OrchestratorBlock event={d.orchestratorReasoning} />
                )}

                {d.decision && (
                    <div className="mt-3">
                        <DecisionBadge decision={d.decision.decision} summary={d.decision.summary} />
                    </div>
                )}

                {/* DynamoDB persistence status */}
                {persistEvents.length > 0 && (
                    <div className="mt-2 space-y-0.5 border-t border-ws-line pt-2">
                        {persistEvents.map((pe, i) => (
                            <p key={i} className="flex items-center gap-1.5 text-[11px] text-ws-muted font-mono">
                                <span className="text-ws-teal">✓</span>
                                {pe.step === 'verdicts'
                                    ? `DynamoDB AgentVerdicts written`
                                    : `master_decision: ${pe.decision ?? '?'} → ${pe.verdict_id?.slice(0, 8) ?? ''}…`
                                }
                            </p>
                        ))}
                    </div>
                )}

                {/* Still running — show spinner for missing agents */}
                {!d.decision && agentResults.length < 4 && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-ws-muted">
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-ws-teal border-t-transparent" />
                        Agents debating…
                    </div>
                )}
            </Section>
        );
    }

    return sections;
}

function Section({ emoji, title, badge, sub, children }: {
    emoji: string;
    title: string;
    badge?: string;
    sub?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-xl border border-ws-line bg-ws-card p-4">
            <div className="mb-3 flex items-center gap-2">
                <span className="text-base">{emoji}</span>
                <span className="font-semibold text-ws-ink text-sm">{title}</span>
                {badge && (
                    <span className="ml-1 rounded-full bg-ws-paper px-2 py-0.5 text-[11px] text-ws-muted border border-ws-line">
                        {badge}
                    </span>
                )}
                {sub && <span className="ml-auto text-[11px] text-ws-muted">{sub}</span>}
            </div>
            {children}
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

    // Auto-scroll to bottom as events arrive
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = el.scrollTop > el.scrollHeight - el.clientHeight - 200
            ? el.scrollHeight
            : el.scrollTop;
    }, [events.length]);

    if (!open) return null;

    const startEvent = events.find((e): e is Extract<AgentRunEvent, { type: 'start' }> => e.type === 'start');
    const completeEvent = events.find((e): e is Extract<AgentRunEvent, { type: 'run_complete' }> => e.type === 'run_complete');
    const errorEvent = events.find((e): e is Extract<AgentRunEvent, { type: 'error' }> => e.type === 'error');

    const rendered = renderEvents(events);
    const isEmpty = rendered.length === 0;

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-end sm:items-start sm:justify-end p-0 sm:p-4"
            aria-modal
            role="dialog"
            aria-label="WorkSignal Agent Run"
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={state === 'running' ? undefined : onClose}
            />

            {/* Panel */}
            <div className="relative z-10 flex h-[92dvh] w-full flex-col rounded-t-2xl bg-ws-card shadow-2xl sm:h-[90vh] sm:w-[680px] sm:rounded-2xl">
                {/* Header */}
                <div className="flex shrink-0 items-center gap-3 border-b border-ws-line px-5 py-4">
                    <div className="flex items-center gap-2 min-w-0">
                        {state === 'running' && (
                            <span className="h-2.5 w-2.5 rounded-full bg-ws-teal animate-pulse shrink-0" />
                        )}
                        {state === 'complete' && (
                            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
                        )}
                        {state === 'error' && (
                            <span className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0" />
                        )}
                        {state === 'idle' && (
                            <span className="h-2.5 w-2.5 rounded-full bg-ws-muted shrink-0" />
                        )}
                        <h2 className="font-semibold text-ws-ink">WorkSignal Agent</h2>
                        {startEvent && (
                            <span className="text-xs text-ws-muted truncate">— {startEvent.user_name}</span>
                        )}
                    </div>

                    <div className="ml-auto flex items-center gap-2 shrink-0">
                        {state === 'running' && (
                            <span className="text-xs text-ws-muted animate-pulse">Running pipeline…</span>
                        )}
                        {state === 'complete' && completeEvent && (
                            <span className="text-xs text-emerald-600 font-medium">
                                Done in {completeEvent.elapsed_s.toFixed(1)}s
                            </span>
                        )}
                        {state !== 'running' && (
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex h-7 w-7 items-center justify-center rounded-md text-ws-muted hover:text-ws-ink hover:bg-ws-paper transition"
                                aria-label="Close"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {isEmpty && state === 'running' && (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <span className="h-8 w-8 animate-spin rounded-full border-2 border-ws-teal border-t-transparent" />
                            <p className="text-sm text-ws-muted">Connecting to pipeline…</p>
                        </div>
                    )}

                    {rendered}

                    {/* Summary block */}
                    {completeEvent && (
                        <div className="rounded-xl border border-ws-teal/30 bg-ws-teal/5 p-4">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <p className="font-semibold text-ws-ink text-sm">Run Complete</p>
                                <span className="flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
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
                                        {(completeEvent.tally['apply_consensus'] ?? 0) + (completeEvent.tally['apply_with_caveat'] ?? 0)}
                                    </p>
                                    <p className="text-[11px] text-ws-muted">to apply</p>
                                </div>
                            </div>
                            {Object.entries(completeEvent.tally).length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {Object.entries(completeEvent.tally).map(([dec, count]) => {
                                        const m = DECISION_META[dec] ?? DECISION_META.no_decision!;
                                        return (
                                            <span key={dec} className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${m.className}`}>
                                                {count}× {m.label}
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {errorEvent && (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                            <p className="font-semibold text-red-700 text-sm">Pipeline Error</p>
                            <p className="mt-1 text-xs text-red-600">{errorEvent.message}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
