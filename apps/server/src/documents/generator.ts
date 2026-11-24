/**
 * Сборка PDF по типу документа (этап 4): реквизиты → шаблон → pdfmake.
 */

import type { TDocumentDefinitions } from "pdfmake";
import { renderPdf } from "./pdfmake.js";
import type { DocumentData } from "./types.js";
import { buildInvoiceDoc } from "./templates/invoice.js";
import { buildContractDoc } from "./templates/contract.js";
import { buildTransportDoc } from "./templates/transport.js";
import { buildUpdDoc } from "./templates/upd.js";

/** Дефиниция документа (без рендера) — для юнит-проверок полей. */
export function buildDocDefinition(data: DocumentData): TDocumentDefinitions {
  switch (data.type) {
    case "INVOICE":
      return buildInvoiceDoc(data);
    case "CONTRACT":
      return buildContractDoc(data);
    case "TRANSPORT_NOTE":
      return buildTransportDoc(data);
    case "UPD":
      return buildUpdDoc(data);
  }
}

/** PDF-буфер документа. */
export async function generateDocumentPdf(data: DocumentData): Promise<Buffer> {
  return renderPdf(buildDocDefinition(data));
}

export { assertSellerRequisites, assertBankRequisites, DocumentsError } from "./types.js";
export { documentNumber, dealNumber } from "./numbering.js";
export type { DocumentData, SellerRequisites } from "./types.js";
