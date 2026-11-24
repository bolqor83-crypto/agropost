/**
 * Инициализация pdfmake: Roboto с кириллицей из пакета (файлы на диске
 * читает сам pdfmake — Render это позволяет). Внешние URL запрещены.
 */

import pdfmake from "pdfmake";
import type { TDocumentDefinitions } from "pdfmake";
import Roboto from "pdfmake/fonts/Roboto.js";

let initialized = false;

function init(): void {
  if (initialized) return;
  pdfmake.addFonts(Roboto);
  /* Roboto лежит в node_modules — локальные чтения разрешаем,
     внешние ссылки (штампов/картинок по URL) — запрещаем. */
  pdfmake.setLocalAccessPolicy(() => true);
  pdfmake.setUrlAccessPolicy(() => false);
  initialized = true;
}

/** PDF-буфер по дефиниции документа (A4, Roboto по умолчанию). */
export async function renderPdf(docDefinition: TDocumentDefinitions): Promise<Buffer> {
  init();
  const doc = pdfmake.createPdf(docDefinition);
  return doc.getBuffer();
}
