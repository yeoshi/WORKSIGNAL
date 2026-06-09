'use client';

import { Modal } from '../../../components/ui/Modal';
import { GrowthView } from '../../growth/components/GrowthView';

export interface GrowthModalProps {
  open: boolean;
  onClose: () => void;
}

export function GrowthModal({ open, onClose }: GrowthModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Growth roadmap" size="xl">
      <GrowthView />
    </Modal>
  );
}
