'use client';

import { useState } from 'react';
import { AgentAvatar } from '../ui/AgentAvatar';
import { Modal } from '../ui/Modal';
import { SEGMENT_INTROS } from './introContent';
import type { SegmentIntroKey } from '@/app/lib/segmentIntroStorage';

export interface AgentIntroModalProps {
  segment: SegmentIntroKey;
  open: boolean;
  onDismiss: () => void;
}

export function AgentIntroModal({ segment, open, onDismiss }: AgentIntroModalProps) {
  const content = SEGMENT_INTROS[segment];
  const [slideIndex, setSlideIndex] = useState(0);
  const slide = content.slides[slideIndex];
  const isLast = slideIndex >= content.slides.length - 1;

  function handleClose() {
    setSlideIndex(0);
    onDismiss();
  }

  function handleNext() {
    if (isLast) {
      handleClose();
      return;
    }
    setSlideIndex((index) => index + 1);
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={content.title}
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-1.5">
            {content.slides.map((_, index) => (
              <span
                key={index}
                className={[
                  'h-1.5 w-6 rounded-full transition',
                  index === slideIndex ? 'bg-ws-teal' : 'bg-ws-line',
                ].join(' ')}
                aria-hidden
              />
            ))}
          </div>
          <div className="flex gap-2">
            {slideIndex > 0 ? (
              <button
                type="button"
                onClick={() => setSlideIndex((index) => index - 1)}
                className="rounded-lg border border-ws-line px-4 py-2 text-sm font-medium text-ws-ink hover:bg-ws-paper"
              >
                Back
              </button>
            ) : null}
            <button
              type="button"
              data-testid={`intro-${segment}-next`}
              onClick={handleNext}
              className="rounded-lg bg-ws-teal px-4 py-2 text-sm font-semibold text-white hover:bg-ws-teal-mid"
            >
              {isLast ? 'Got it' : 'Next'}
            </button>
          </div>
        </div>
      }
    >
      <div data-testid={`intro-${segment}-slide-${slideIndex}`}>
        <h3 className="text-lg font-semibold text-ws-ink">{slide.title}</h3>
        {slide.body ? (
          <p className="mt-2 text-sm leading-relaxed text-ws-muted">{slide.body}</p>
        ) : null}

        {slide.bullets && slide.bullets.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {slide.bullets.map((bullet) => (
              <li
                key={bullet}
                className="flex items-start gap-2 text-sm leading-relaxed text-ws-muted"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ws-teal" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {slide.agents && slide.agents.length > 0 ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {slide.agents.map((agent) => (
              <article
                key={agent.agent}
                className="flex gap-3 rounded-xl border border-ws-line bg-ws-paper p-4"
              >
                <AgentAvatar agent={agent.agent} size={72} shape="square" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ws-ink">{agent.name}</p>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-ws-teal">
                    {agent.role}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-ws-muted">
                    {agent.description}
                  </p>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
