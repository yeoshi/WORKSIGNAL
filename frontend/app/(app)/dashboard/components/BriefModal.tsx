'use client';

import { Modal } from '../../../components/ui/Modal';
import { BriefView } from '../../brief/components/BriefView';

export interface BriefModalProps {
  open: boolean;
  onClose: () => void;
}

export function BriefModal({ open, onClose }: BriefModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Weekly Brief" size="xl">
      <BriefView showHeader showIntro />
    </Modal>
  );
}
