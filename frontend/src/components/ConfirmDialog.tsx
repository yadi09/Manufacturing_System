import type { ReactNode } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";

interface Props {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  /** A destructive-looking action (retire, deactivate) uses the danger button; the safe choice is focused. */
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Asks before something that is hard to undo. Cancel has the focus, so Enter never confirms by accident. */
export function ConfirmDialog({ title, children, confirmLabel, cancelLabel, danger, pending, onConfirm, onClose }: Props) {
  return (
    <Modal alert title={title} onClose={onClose} dismissible={!pending}>
      <div>{children}</div>
      <div className="mt-2 flex gap-3">
        <Button type="button" variant={danger ? "danger" : "primary"} className="flex-1" loading={pending} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button type="button" variant="secondary" data-autofocus onClick={onClose} disabled={pending}>
          {cancelLabel}
        </Button>
      </div>
    </Modal>
  );
}
