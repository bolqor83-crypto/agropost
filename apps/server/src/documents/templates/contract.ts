/**
 * Шаблон «Договор купли-продажи» (Д-001). Упрощённая форма:
 * предмет, оплата, доставка (за счёт покупателя), рекламации, реквизиты.
 */

import type { TDocumentDefinitions } from "pdfmake";
import type { DocumentData } from "../types.js";
import {
  baseDoc,
  buyerBlock,
  deliveryText,
  fmtDate,
  fmtNum,
  fmtRub,
  gap,
  para,
  sellerBlock,
  signatureRow,
  sub,
  taxLine,
  title,
} from "./common.js";

export function buildContractDoc(data: DocumentData): TDocumentDefinitions {
  const content: unknown[] = [
    title(`ДОГОВОР КУПЛИ-ПРОДАЖИ № ${data.number}`),
    para(`от ${fmtDate(data.generatedAt)}`, { margin: [0, 0, 0, 10] }),

    sub("1. Предмет договора"),
    para(
      `Продавец обязуется передать в собственность Покупателя, а Покупатель — принять и оплатить товар: ${data.goods.name}, количество ${fmtNum(data.goods.volumeKg)} кг${data.goods.bagWeightKg ? ` (мешки по ${fmtNum(data.goods.bagWeightKg)} кг)` : ""}.`,
    ),
    para(
      `Цена товара: ${fmtNum(data.goods.salePrice)} руб./кг. Общая стоимость товара: ${fmtRub(data.totals.revenue)}. ${taxLine(data)}`,
    ),

    sub("2. Порядок расчётов"),
    para(
      "Оплата производится в размере 100% стоимости товара (предоплата). Товар отгружается Продавцом только после зачисления всей суммы на счёт Продавца.",
    ),

    sub("3. Доставка и переход рисков"),
    para(deliveryText(data)),
    para(
      "Право собственности на товар и риск случайной порчи переходят к Покупателю с момента передачи товара перевозчику (при самовывозе — с момента передачи товара Покупателю).",
    ),

    sub("4. Приёмка и рекламации"),
    para(
      "Покупатель в течение 3 (трёх) календарных дней с момента получения товара обязан проверить количество и качество. Претензии направляются Продавцу письменно — в переписке в мессенджере, по которому велась сделка, или иным доступным способом.",
    ),

    sub("5. Прочие условия"),
    para(
      "Договор вступает в силу с момента акцепта Покупателем (оплатой счёта) и действует до полного исполнения обязательств сторонами. Все изменения — только в письменной форме.",
    ),

    sub("6. Реквизиты и подписи сторон"),
    ...sellerBlock(data.seller),
    ...buyerBlock(data),
    gap(10),
    signatureRow("Продавец", "Покупатель"),
    para(`Сделка № ${data.dealNumber} в АгроПост.`, {
      fontSize: 9,
      color: "#666666",
      margin: [0, 10, 0, 0],
    }),
  ];
  return baseDoc(content);
}
