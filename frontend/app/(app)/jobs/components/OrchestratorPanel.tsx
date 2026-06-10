'use client';

import { useEffect, useState } from 'react';
import { Brain, TrendingUp, PauseCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { AgentAvatar } from '../../../components/ui/AgentAvatar';
import type { EnrichedMasterDecision, OrchestratorAction } from '@/app/types/shared';

export interface OrchestratorPanelProps {
  enriched: EnrichedMasterDecision;
  onUpskill?: (targets: string[]) => void;
  delayMs?: number;
}

interface ActionConfig {
  label: string;
  badgeColor: string;
  sectionBorder: string;
  sectionBg: string;
  decidingFactorBg: string;
  Icon: typeof Brain;
  ctaColor?: string;
}

const ACTION_CONFIG: Record<OrchestratorAction, ActionConfig> = {
  apply: {
    label: 'APPLY NOW',
    badgeColor: '#059669',
    sectionBorder: 'border-emerald-300',
    sectionBg: 'bg-emerald-50',
    decidingFactorBg: 'bg-emerald-100/60',
    Icon: TrendingUp,
    ctaColor: 'bg-emerald-600 hover:bg-emerald-700',
  },
  upskill: {
    label: 'BUILD SKILLS FIRST',
    badgeColor: '#D97706',
    sectionBorder: 'border-amber-300',
    sectionBg: 'bg-amber-50',
    decidingFactorBg: 'bg-amber-100/60',
    Icon: Brain,
    ctaColor: 'bg-amber-600 hover:bg-amber-700',
  },
  hold: {
    label: 'HOLD',
    badgeColor: '#6B7280',
    sectionBorder: 'border-gray-200',
    sectionBg: 'bg-gray-50',
    decidingFactorBg: 'bg-gray-100/60',
    Icon: PauseCircle,
  },
};

const ORCHESTRATOR_COLOR = '#4F46E5';

function ConfidenceBar({ confidence }: { confidence: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-white/70">
        <div
          className="h-1.5 rounded-full transition-all duration-700"
          style={{ width: `${Math.max(0, Math.min(100, confidence))}%`, backgroundColor: ORCHESTRATOR_COLOR }}
        />
      </div>
      <span className="w-10 text-right font-mono text-xs font-semibold text-gray-500">
        {confidence}/100
      </span>
    </div>
  );
}

/**
 * The 5th panel in the job detail view — shown only when the Orchestrator Agent
 * reasoning pass fired (deadlock or Realism-floor breach).
 *
 * Default view: action badge + confidence + deciding-factor callout.
 * "Full reasoning" toggle: holistic_summary, apply_angle / upskill targets.
 */
export function OrchestratorPanel({
  enriched,
  onUpskill,
  delayMs = 450,
}: OrchestratorPanelProps) {
  const verdict = enriched.orchestrator_verdict;
  if (!verdict) return null;

  const cfg = ACTION_CONFIG[verdict.action];
  const [entered, setEntered] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <section
      data-testid="orchestrator-panel"
      aria-label="Orchestrator holistic verdict"
      className={[
        'rounded-2xl border-2 p-5 shadow-sm',
        cfg.sectionBorder,
        cfg.sectionBg,
        'transition-all duration-500 ease-out motion-reduce:transition-none',
      ].join(' ')}
      style={{
        transitionDelay: `${delayMs}ms`,
        opacity: entered ? 1 : 0,
        transform: entered ? 'translateY(0)' : 'translateY(12px)',
      }}
    >
      {/* ── Header row ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <AgentAvatar agent="orchestrator" size={44} />
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Orchestrator decision</h2>
            <p className="text-[11px] text-gray-500">Final call on this role</p>
          </div>
        </div>
        <span
          data-testid="orchestrator-action-badge"
          className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white"
          style={{ backgroundColor: cfg.badgeColor }}
        >
          <cfg.Icon size={13} aria-hidden />
          {cfg.label}
        </span>
      </div>

      {/* ── Confidence bar ── */}
      <div className="mt-3">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          Confidence
        </p>
        <ConfidenceBar confidence={verdict.confidence} />
      </div>

      {/* ── Deciding factor — always visible ── */}
      <div
        data-testid="orchestrator-deciding-factor"
        className={['mt-3 rounded-lg px-3 py-2.5 text-sm border-l-4', cfg.decidingFactorBg].join(' ')}
        style={{ borderLeftColor: cfg.badgeColor }}
      >
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: cfg.badgeColor }}>
          Deciding factor
        </span>
        <p className="mt-0.5 text-sm font-medium leading-snug text-gray-800">
          {verdict.deciding_factor}
        </p>
      </div>

      {/* ── Full reasoning toggle ── */}
      <button
        type="button"
        data-testid="orchestrator-expand-toggle"
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 flex items-center gap-1 text-xs font-medium text-gray-400 transition hover:text-gray-700"
        aria-expanded={expanded}
      >
        {expanded ? (
          <><ChevronUp size={13} aria-hidden /> Hide full reasoning</>
        ) : (
          <><ChevronDown size={13} aria-hidden /> Full reasoning</>
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Holistic summary */}
          <p
            data-testid="orchestrator-holistic-summary"
            className="text-sm leading-relaxed text-gray-700"
          >
            {verdict.holistic_summary}
          </p>

          {/* Apply angle */}
          {verdict.action === 'apply' && verdict.apply_angle && (
            <div className="rounded-md bg-white/60 px-3 py-2 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Application angle
              </span>
              <p className="mt-0.5 text-gray-700">{verdict.apply_angle}</p>
            </div>
          )}

          {/* Upskill targets */}
          {verdict.action === 'upskill' && verdict.upskill_targets && verdict.upskill_targets.length > 0 && (
            <div data-testid="orchestrator-upskill-targets">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Skills to build first
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-2">
                {verdict.upskill_targets.map((skill) => (
                  <li
                    key={skill}
                    className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-800"
                  >
                    {skill}
                  </li>
                ))}
              </ul>
              {onUpskill && (
                <button
                  type="button"
                  data-testid="orchestrator-upskill-cta"
                  onClick={() => onUpskill(verdict.upskill_targets!)}
                  className={['mt-3 rounded-full px-5 py-2 text-sm font-semibold text-white transition', cfg.ctaColor ?? ''].join(' ')}
                >
                  View Growth Roadmap →
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
