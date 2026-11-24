/**
 * Типы для pdfmake и pdf-parse (пакеты без собственных .d.ts).
 * Используем только крошечное подмножество API, нужное АгроПосту.
 */

declare module "pdfmake" {
  /** Дефиниция документа — pdfmake сам валидирует содержимое. */
  export interface TDocumentDefinitions {
    content: unknown[];
    pageSize?: string;
    pageMargins?: number[];
    info?: Record<string, string>;
    defaultStyle?: {
      font?: string;
      fontSize?: number;
      lineHeight?: number;
      [key: string]: unknown;
    };
    styles?: Record<string, Record<string, unknown>>;
    [key: string]: unknown;
  }

  export interface PdfMakeOutputDocument {
    getBuffer(): Promise<Buffer>;
    getBase64(): Promise<string>;
    write(filename: string): Promise<void>;
  }

  interface PdfMakeInstance {
    /** Шрифты: имя → {стиль → путь к .ttf}. */
    addFonts(fonts: Record<string, { normal: string; bold?: string; italics?: string; bolditalics?: string }>): void;
    createPdf(docDefinition: TDocumentDefinitions): PdfMakeOutputDocument;
    /** Разрешаем чтение локальных файлов — только bundled-шрифты Roboto. */
    setLocalAccessPolicy(callback: (path: string) => boolean): void;
    /** Внешние URL в документах запрещены. */
    setUrlAccessPolicy(callback: (url: string, method?: string) => boolean): void;
  }

  const pdfmake: PdfMakeInstance;
  export default pdfmake;
}

declare module "pdfmake/fonts/Roboto.js" {
  const Roboto: {
    Roboto: {
      normal: string;
      bold: string;
      italics: string;
      bolditalics: string;
    };
  };
  export default Roboto;
}

declare module "pdf-parse" {
  /** pdf-parse v2: извлечение текста из PDF (тесты документов). */
  export class PDFParse {
    constructor(options?: { data?: Uint8Array | Buffer; url?: string });
    getText(): Promise<{ text: string; totalPages?: number; [key: string]: unknown }>;
    destroy(): Promise<void>;
  }
}
