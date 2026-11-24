/**
 * Карточка сделки (этап 4): таймлайн статусов с кнопками переходов,
 * экономика (маржа крупно, доставка отдельно — платит покупатель),
 * документы (генерация и скачивание PDF), рекламации, отгрузка.
 */

import { useState } from "react";
import {
  FileText,
  FileDown,
  Package,
  Truck,
  XCircle,
} from "lucide-react";
import { DEAL_STATUS_ORDER } from "@shared/deals";
import {
  CLAIM_STATUS_LABEL,
  DEAL_STATUS_LABEL,
  DEAL_TAX_MODE_LABEL,
  DELIVERY_METHOD_LABEL,
  DOCUMENT_TYPE_LABEL,
  SHIPMENT_STATUS_LABEL,
} from "@shared/labels";
import type { ClaimDTO, ClaimUpdateInput, DealDetailDTO, DocumentDTO, DocumentType } from "@shared/types";
import * as api from "../api/client";

import { useToastStore } from "../stores/publish";
import { dealStatusTone, fmtNum, fmtRub, fmtDate, fmtWhen } from "../lib/format";
import { Btn, Card, Chip, InfoRow, Sheet } from "../components/ui";
import { ShipmentSheet } from "./ShipmentSheet";
import { ClaimSheet } from "./ClaimSheet";

const DOC_TYPES: DocumentType[] = ["INVOICE", "CONTRACT", "TRANSPORT_NOTE", "UPD"];
const DOC_ACTION_LABEL: Record<DocumentType, string> = {
  INVOICE: "Счёт",
  CONTRACT: "Договор",
  TRANSPORT_NOTE: "ТН",
  UPD: "УПД",
};

/** Шаги таймлайна с короткими подписями. */
const STEP_LABEL: Record<string, string> = {
  DRAFT: "Заявка",
  AWAITING_PAYMENT: "Ожидает оплаты",
  PAID: "Оплачено",
  SHIPPED: "Отгружено",
  DELIVERED: "Доставлено",
  CLOSED: "Закрыто",
};

function Timeline({ status }: { status: DealDetailDTO["status"] }) {
  if (status === "CANCELLED") {
    return (
      <div className="rounded-[14px] bg-subtle px-4 py-3">
        <p className="text-[13px] font-semibold text-soft">Сделка отменена</p>
      </div>
    );
  }
  const currentIdx = DEAL_STATUS_ORDER.indexOf(status);
  return (
    <div className="rounded-[14px] bg-subtle px-4 py-3">
      <div className="flex items-center gap-1" aria-label="Стадии сделки">
        {DEAL_STATUS_ORDER.map((s, i) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full ${i <= currentIdx ? "bg-accent" : "bg-line"}`}
            title={STEP_LABEL[s]}
          />
        ))}
      </div>
      <p className="mt-2 text-[12px] font-medium text-soft">
        {STEP_LABEL[status]} · шаг {currentIdx + 1} из {DEAL_STATUS_ORDER.length}
      </p>
    </div>
  );
}

function DocumentRow({ doc, onDownload }: { doc: DocumentDTO; onDownload: () => void }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
        <FileText size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-ink">
          {DOCUMENT_TYPE_LABEL[doc.type]} {doc.number}
        </p>
        <p className="text-[11px] font-medium text-soft">от {fmtDate(doc.generatedAt)}</p>
      </div>
      <button
        type="button"
        aria-label={`Скачать ${doc.number}`}
        onClick={onDownload}
        className="press grid h-9 w-9 shrink-0 place-items-center rounded-full bg-subtle text-soft"
      >
        <FileDown size={15} />
      </button>
    </div>
  );
}

function ClaimRow({
  claim,
  onUpdate,
  onPhotoDeleted,
  busy,
}: {
  claim: ClaimDTO;
  onUpdate: (patch: ClaimUpdateInput) => void;
  onPhotoDeleted: (index: number) => void;
  busy: boolean;
}) {
  return (
    <div className="py-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-[14px] font-medium leading-snug text-ink">
          {claim.description}
        </p>
        <Chip tone={claim.status === "RESOLVED" ? "green" : claim.status === "NEW" ? "warm" : "neutral"}>
          {CLAIM_STATUS_LABEL[claim.status]}
        </Chip>
      </div>
      {claim.resolution && (
        <p className="mt-1 text-[12px] font-medium text-soft">Решение: {claim.resolution}</p>
      )}

      {/* ЭТАП 6: фото претензии — галерея + удаление. */}
      {claim.photos.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto soft-scroll" aria-label="Фото рекламации">
          {claim.photos.map((url, i) => (
            <div key={`${i}-${url.slice(0, 24)}`} className="relative shrink-0">
              <img
                src={url}
                alt={`Фото ${i + 1}`}
                className="h-20 w-20 rounded-[14px] border border-line object-cover"
                loading="lazy"
              />
              <button
                type="button"
                aria-label={`Удалить фото ${i + 1}`}
                disabled={busy}
                onClick={() => onPhotoDeleted(i)}
                className="press absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-ink text-white disabled:opacity-50"
              >
                <XCircle size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      {claim.status !== "RESOLVED" && claim.status !== "REJECTED" && (
        <div className="flex flex-wrap gap-2 pt-2">
          {claim.status === "NEW" && (
            <Btn size="md" variant="ghost" disabled={busy} onClick={() => onUpdate({ status: "IN_REVIEW" })}>
              Взять в работу
            </Btn>
          )}
          <Btn
            size="md"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              onUpdate({ forwardedToSupplier: true })
            }
          >
            Поставщику
          </Btn>
          <Btn
            size="md"
            variant="ghost"
            disabled={busy}
            onClick={() => onUpdate({ status: "RESOLVED", resolution: "Урегулировано с покупателем" })}
          >
            Решено
          </Btn>
          <Btn size="md" variant="ghost" disabled={busy} onClick={() => onUpdate({ status: "REJECTED" })}>
            Отклонить
          </Btn>
        </div>
      )}
      <p className="mt-1 text-[11px] font-medium text-soft">{fmtWhen(claim.createdAt)}</p>
    </div>
  );
}

export function DealDetailSheet({
  deal,
  onClose,
  onChanged,
  onNeedProfile,
}: {
  deal: DealDetailDTO;
  onClose: () => void;
  onChanged: () => void;
  onNeedProfile: () => void;
}) {
  const showToast = useToastStore((s) => s.show);
  const [busy, setBusy] = useState(false);
  const [shipOpen, setShipOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);

  const refresh = async (action: () => Promise<unknown>, okMsg?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      onChanged();
      if (okMsg) showToast(okMsg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Не получилось";
      if (msg.includes("реквизиты") || msg.includes("РЕКВИЗИТЫ") || msg.includes("REQUISITES")) {
        onNeedProfile();
      } else {
        showToast(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const download = (doc: DocumentDTO) => {
    void api
      .downloadDocument(doc)
      .then(() => showToast(`Скачивается ${doc.number}.pdf`))
      .catch((err) => showToast(err instanceof Error ? err.message : "Не удалось скачать"));
  };

  const generate = (type: DocumentType) => {
    void refresh(async () => {
      const res = await api.generateDealDocument(deal.id, type);
      await api.downloadDocument(res.document);
      showToast(`${res.document.number}.pdf скачан`);
    });
  };

  return (
    <Sheet title={`Сделка ${deal.number}`} onClose={onClose}>
      <div className="flex items-center justify-between gap-2">
        <Chip tone={dealStatusTone(deal.status)}>{DEAL_STATUS_LABEL[deal.status]}</Chip>
        <span className="text-[11px] font-medium text-soft">
          создана {fmtDate(deal.createdAt)}
        </span>
      </div>
      <p className="mt-2 text-[16px] font-semibold leading-snug text-ink">
        {deal.positionName ?? "Товар без позиции"}
      </p>
      <p className="mt-0.5 text-[13px] font-medium text-soft">
        {deal.buyerName} · {deal.buyerRegion} · {deal.buyerPhone}
      </p>

      <div className="mt-3">
        <Timeline status={deal.status} />
      </div>

      {/* Экономика */}
      <div className="mt-3 rounded-[14px] bg-subtle px-4 py-1">
        <InfoRow label="Объём" value={`${fmtNum(deal.volumeKg)} кг`} />
        <InfoRow label="Цена продажи" value={`${fmtRub(deal.salePrice)} / кг`} />
        <InfoRow label="Закуп (скрыт от покупателя)" value={`${fmtRub(deal.supplierPrice)} / кг`} valueClass="text-soft" />
        <div className="my-2 h-px bg-line" />
        <InfoRow label="Выручка" value={fmtRub(deal.revenue)} />
        <InfoRow
          label={`Налог (${DEAL_TAX_MODE_LABEL[deal.taxMode]})`}
          value={`− ${fmtRub(deal.taxAmount)}`}
        />
        <div className="my-2 h-px bg-line" />
        <InfoRow
          label="Маржа после налога"
          value={fmtRub(deal.margin)}
          valueClass={`text-[16px] ${deal.margin > 0 ? "text-accent" : deal.margin < 0 ? "text-warm" : "text-soft"}`}
        />
        <InfoRow
          label="Доставка (платит покупатель)"
          value={deal.deliveryCost !== null ? fmtRub(deal.deliveryCost) : "не указана"}
          valueClass="text-soft"
        />
        <p className="py-2 text-[11px] font-medium leading-relaxed text-soft">
          Доставка в маржу не входит. Отгрузка — только после полной оплаты.
        </p>
      </div>

      {/* Доставка */}
      <div className="mt-3 rounded-[14px] bg-subtle px-4 py-1">
        <InfoRow label="Способ" value={DELIVERY_METHOD_LABEL[deal.deliveryMethod]} />
        {deal.shipment ? (
          <>
            <InfoRow
              label="Перевозчик"
              value={deal.shipment.carrierName ?? "—"}
              valueClass="text-soft"
            />
            <InfoRow
              label="Маршрут"
              value={`${deal.shipment.fromCity} — ${deal.shipment.toCity}`}
              valueClass="text-soft"
            />
            <InfoRow label="Стоимость" value={fmtRub(deal.shipment.cost)} valueClass="text-soft" />
            {deal.shipment.trackingNumber && (
              <InfoRow label="Трек-номер" value={deal.shipment.trackingNumber} valueClass="text-soft" />
            )}
            <InfoRow
              label="Статус груза"
              value={SHIPMENT_STATUS_LABEL[deal.shipment.status]}
              valueClass="text-soft"
            />
          </>
        ) : (
          <InfoRow
            label="Отгрузка"
            value="ещё не создана — кнопка «Отгрузить» на этапе «Оплачено»"
            valueClass="text-soft text-[13px]"
          />
        )}
      </div>

      {/* Документы */}
      <Card className="mt-3 p-4">
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-semibold text-ink">Документы</p>
          <span className="text-[11px] font-medium text-soft">
            {deal.documents.length > 0 ? `${deal.documents.length} шт.` : "пока нет"}
          </span>
        </div>
        {deal.documents.length > 0 && (
          <div className="mt-1 divide-y divide-line">
            {deal.documents.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} onDownload={() => download(doc)} />
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {DOC_TYPES.map((type) => (
            <Btn key={type} size="md" variant="secondary" disabled={busy} onClick={() => generate(type)}>
              {DOC_ACTION_LABEL[type]}
            </Btn>
          ))}
        </div>
        <div className="mt-2 flex items-start gap-2 rounded-[14px] bg-subtle px-3 py-2.5">
          <Package size={14} className="mt-0.5 shrink-0 text-soft" />
          <p className="text-[11px] font-medium leading-relaxed text-soft">
            В документах вы — продавец, поставщик не упоминается (white-label). Реквизиты —
            в «Ещё» → «Реквизиты».
          </p>
        </div>
      </Card>

      {/* Рекламации */}
      <Card className="mt-3 p-4">
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-semibold text-ink">Рекламации</p>
          <button
            type="button"
            className="press text-[13px] font-semibold text-accent"
            onClick={() => setClaimOpen(true)}
          >
            + Создать
          </button>
        </div>
        {deal.claims.length === 0 ? (
          <p className="py-2 text-[12px] font-medium text-soft">
            Претензий нет. Если покупатель недоволен — зафиксируйте здесь; поставщику можно
            переадресовать, покупатель его не увидит.
          </p>
        ) : (
          <div className="mt-1 divide-y divide-line">
            {deal.claims.map((claim) => (
              <ClaimRow
                key={claim.id}
                claim={claim}
                busy={busy}
                onUpdate={(patch) =>
                  void refresh(() => api.updateClaim(claim.id, patch), "Рекламация обновлена")
                }
                onPhotoDeleted={(index) =>
                  void refresh(() => api.deleteClaimPhoto(claim.id, index), "Фото удалено")
                }
              />
            ))}
          </div>
        )}
      </Card>

      {/* Действия */}
      <div className="mt-4 flex flex-col gap-2 pb-2">
        {deal.status === "DRAFT" && (
          <Btn
            full
            disabled={busy}
            onClick={() => void refresh(() => api.awaitingPaymentDeal(deal.id), "Сделка ждёт оплаты — можно выставить счёт")}
          >
            К оплате
          </Btn>
        )}
        {deal.status === "AWAITING_PAYMENT" && (
          <div className="flex gap-2">
            <Btn full disabled={busy} onClick={() => void refresh(() => api.payDeal(deal.id), "Оплата зафиксирована")}>
              Оплачено
            </Btn>
            <Btn variant="secondary" disabled={busy} onClick={() => generate("INVOICE")}>
              Счёт
            </Btn>
          </div>
        )}
        {deal.status === "PAID" && (
          <Btn full disabled={busy} onClick={() => setShipOpen(true)}>
            <Truck size={16} />
            Отгрузить
          </Btn>
        )}
        {deal.status === "SHIPPED" && (
          <Btn full disabled={busy} onClick={() => void refresh(() => api.deliverDeal(deal.id), "Доставка зафиксирована")}>
            Доставлено
          </Btn>
        )}
        {deal.status === "DELIVERED" && (
          <Btn full disabled={busy} onClick={() => void refresh(() => api.closeDeal(deal.id), "Сделка закрыта")}>
            Закрыть сделку
          </Btn>
        )}
        {!["CLOSED", "CANCELLED"].includes(deal.status) && (
          <Btn
            full
            variant="ghost"
            disabled={busy}
            onClick={() => void refresh(() => api.cancelDeal(deal.id), "Сделка отменена")}
          >
            <XCircle size={15} />
            Отменить
          </Btn>
        )}
        {(deal.status === "DRAFT" || deal.status === "CANCELLED") && (
          <Btn
            full
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void refresh(() => api.deleteDeal(deal.id), "Сделка удалена").then(() => onClose())
            }
          >
            Удалить
          </Btn>
        )}
      </div>

      {shipOpen && (
        <ShipmentSheet
          deal={deal}
          onClose={() => setShipOpen(false)}
          onShipped={() => {
            setShipOpen(false);
            onChanged();
          }}
        />
      )}

      {claimOpen && (
        <ClaimSheet
          dealId={deal.id}
          onClose={() => setClaimOpen(false)}
          onCreated={() => {
            setClaimOpen(false);
            onChanged();
          }}
        />
      )}
    </Sheet>
  );
}
