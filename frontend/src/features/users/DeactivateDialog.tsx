import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import type { UserSummary } from "./api";
import { useUpdateUser } from "./hooks";

/** Confirmation before deactivating. A refusal (last administrator) is shown by the panel, not here. */
export function DeactivateDialog({ user, onClose, onFailed }: { user: UserSummary; onClose: () => void; onFailed: (err: unknown) => void }) {
  const { t } = useTranslation();
  const update = useUpdateUser();
  return (
    <Modal alert title={t("users.deactivate.title", { name: user.full_name })} onClose={onClose} dismissible={!update.isPending}>
      <p>{t("users.deactivate.body", { name: user.full_name })}</p>
      <div className="mt-2 flex gap-3">
        <Button
          type="button"
          variant="danger"
          className="flex-1"
          loading={update.isPending}
          onClick={() =>
            update.mutate(
              { id: user.id, active: false },
              {
                onSuccess: onClose,
                onError: (err) => {
                  onFailed(err);
                  onClose();
                },
              },
            )
          }
        >
          {t("users.deactivate.confirm")}
        </Button>
        <Button type="button" variant="secondary" data-autofocus onClick={onClose} disabled={update.isPending}>
          {t("users.cancel")}
        </Button>
      </div>
    </Modal>
  );
}
