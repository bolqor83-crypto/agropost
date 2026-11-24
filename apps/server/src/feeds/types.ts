/**
 * ЭТАП 9 — контракты YML/Авито-фидов.
 *
 * Один сборщик данных (feeds/data.ts) готовит FeedData из позиций,
 * два чистых генератора (yml.ts, avito-xml.ts) превращают его в XML:
 * - YML — стандарт Яндекс.Маркета (Зерно Он-Лайн, Своё Фермерство);
 * - Avito Ads formatVersion=3 — спецификация Автозагрузки Авито.
 *
 * Чистые функции без Prisma-зависимостей — тестируются на golden set.
 */

/** Данные магазина (шапка фида). */
export interface FeedShopInfo {
  /** Витрина: «АгроПост». */
  name: string;
  /** Юрлицо/ИП из профиля владельца (User.name). */
  company: string;
  /** Публичный URL витрины (FEED_SHOP_URL). */
  url: string;
  /** Телефон продавца для Авито (ContactPhone) — опционален. */
  phone: string | null;
}

/** Одно объявление в фиде (поставка из SupplierPosition). */
export interface FeedOffer {
  /** Id позиции — стабильный id оффера (обновление, а не дубль). */
  id: string;
  /** «Люцерна «Вега 87» РС1, всхожесть 92%». */
  name: string;
  /** Цена продажи с наценкой, ₽/кг. */
  price: number;
  currency: "RUB";
  /** Категория = культура: id + человекочитаемое имя. */
  categoryId: string;
  category: string;
  /** Тип культуры — категория Авито (семена/орех) при маппинге. */
  cultureType: "SEED" | "NUT";
  /** Ссылка на позицию в веб-приложении. */
  url: string;
  /** Текст объявления (white-label, из shared/listing-text.ts). */
  description: string;
  /** Фото (только абсолютные http(s)-URL — R2; data-URL не отдаём). */
  pictures: string[];
  /** Атрибуты позиции по шаблону культуры (JSONB → param). */
  params: { name: string; value: string }[];
  /** Регион отгрузки («Краснодарский край») — адрес в Авито. */
  region: string;
}

/** Готовый фид до сериализации. */
export interface FeedData {
  shop: FeedShopInfo;
  offers: FeedOffer[];
  /** Дата генерации (ISO) — атрибут yml_catalog / служебное поле. */
  generatedAt: string;
}

/** Настройки фидов из env. */
export interface FeedConfig {
  /** FEED_TOKEN — случайная строка ~32 символа; null = фиды отключены. */
  token: string | null;
  /** Публичный URL витрины для ссылок офферов. */
  shopUrl: string;
  /** Публичный базовый URL API — адрес Авито-фида для площадки. */
  publicApiUrl: string;
  /** TTL кэша фида (по умолчанию 1 час — площадки не дёргают каждую секунду). */
  cacheTtlMs: number;
}

export const FEED_CACHE_TTL_MS_DEFAULT = 60 * 60 * 1000;
