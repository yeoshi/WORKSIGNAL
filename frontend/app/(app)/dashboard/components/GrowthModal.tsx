'use client';

import { useState, type ReactNode } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { GrowthView } from '../../growth/components/GrowthView';
import type { GrowthCardItem } from '../types';

export interface GrowthModalProps {
  open: boolean;
  onClose: () => void;
  skills?: GrowthCardItem[];
}

export function GrowthModal({ open, onClose, skills = [] }: GrowthModalProps) {
  const [titleAction, setTitleAction] = useState<ReactNode | null>(null);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Growth roadmap"
      titleAction={titleAction}
      size="xl"
    >
      <GrowthView onTitleActionChange={setTitleAction} />
    </Modal>
  );
}
