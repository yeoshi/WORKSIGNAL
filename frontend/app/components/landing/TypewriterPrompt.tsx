'use client';

import { useEffect, useState } from 'react';

export const HERO_PROMPTS = [
  'Why does applying to jobs take so much time?',
  'Why am I not getting any callbacks?',
  'What skills do the roles I want actually need?',
  'Who should I network with to get hired?',
  'How do I know which jobs are worth applying to?',
] as const;

const TYPING_MS = 42;
const DELETING_MS = 24;
const PAUSE_AFTER_TYPE_MS = 2400;
const PAUSE_AFTER_DELETE_MS = 400;

export function TypewriterPrompt({
  sentences = HERO_PROMPTS,
}: {
  sentences?: readonly string[];
}) {
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [text, setText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const current = sentences[sentenceIndex] ?? sentences[0];
    if (!current) return;

    const isComplete = !isDeleting && text === current;
    const isEmpty = isDeleting && text === '';

    let delay = isDeleting ? DELETING_MS : TYPING_MS;
    if (isComplete) delay = PAUSE_AFTER_TYPE_MS;
    if (isEmpty) delay = PAUSE_AFTER_DELETE_MS;

    const timer = window.setTimeout(() => {
      if (isComplete) {
        setIsDeleting(true);
        return;
      }

      if (isEmpty) {
        setIsDeleting(false);
        setSentenceIndex((i) => (i + 1) % sentences.length);
        return;
      }

      const nextLength = isDeleting ? text.length - 1 : text.length + 1;
      setText(current.slice(0, nextLength));
    }, delay);

    return () => window.clearTimeout(timer);
  }, [text, isDeleting, sentenceIndex, sentences]);

  return (
    <div className="flex items-center gap-3 rounded-full border border-white/20 bg-white/10 px-5 py-3 backdrop-blur-md">
      <span
        className="flex-1 text-left text-sm text-white/80"
        data-testid="typewriter-prompt"
        aria-live="polite"
      >
        {text}
        <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-white/80" />
      </span>
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-white"
      >
        ↑
      </span>
    </div>
  );
}
