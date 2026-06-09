'use client';

import { Modal } from '../../../components/ui/Modal';
import { NetworkView } from '../../network/components/NetworkView';

export interface NetworkModalProps {
  open: boolean;
  onClose: () => void;
}

export function NetworkModal({ open, onClose }: NetworkModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Network" size="xl">
      <NetworkView />
    </Modal>
  );
}
