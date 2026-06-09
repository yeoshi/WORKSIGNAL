'use client';

import { useState, type ReactNode } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { NetworkView } from '../../network/components/NetworkView';
import type { NetworkCardItem } from '../types';

export interface NetworkModalProps {
  open: boolean;
  onClose: () => void;
  companies?: NetworkCardItem[];
  onViewPipeline?: (company: string) => void;
}

export function NetworkModal({
  open,
  onClose,
  companies = [],
  onViewPipeline,
}: NetworkModalProps) {
  const [titleAction, setTitleAction] = useState<ReactNode | null>(null);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Network"
      titleAction={titleAction}
      size="xl"
    >
      <NetworkView
        companyItems={companies}
        onTitleActionChange={setTitleAction}
        onViewPipeline={(company) => {
          onClose();
          onViewPipeline?.(company);
        }}
      />
    </Modal>
  );
}
