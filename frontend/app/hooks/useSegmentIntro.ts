'use client';

import { useCallback, useState } from 'react';
import {
  isIntroDismissed,
  markIntroDismissed,
  type SegmentIntroKey,
} from '../lib/segmentIntroStorage';

export function useSegmentIntro(key: SegmentIntroKey) {
  const [open, setOpen] = useState(false);

  const showIfFirstVisit = useCallback(() => {
    if (!isIntroDismissed(key)) {
      setOpen(true);
    }
  }, [key]);

  const dismiss = useCallback(() => {
    markIntroDismissed(key);
    setOpen(false);
  }, [key]);

  return { open, showIfFirstVisit, dismiss, setOpen };
}
