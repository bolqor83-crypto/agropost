/**
 * Уведомления владельцу (часть F ТЗ): не чаще одного в минуту.
 * Несколько сообщений подряд склеиваются в один дайджест; очередь
 * живёт в памяти процесса — на free tier это допустимо: инбокс хранит
 * данные в БД, уведомление лишь «подпрыгнуть».
 */

import type { TgApi } from "./types.js";

const THROTTLE_MS = 60_000;
const MAX_TEXT = 120;

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export interface NotifyItem {
  leadId: string;
  from: string;
  text: string;
}

export class OwnerNotifier {
  private queue: NotifyItem[] = [];
  private lastSentAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly deps: {
      api: TgApi | null;
      ownerId: number;
      webUrl: string;
      onError?: (err: unknown) => void;
    },
  ) {}

  /** Новое сообщение от покупателя — сразу или в дайджест через минуту. */
  pushNewMessage(item: NotifyItem): void {
    const now = Date.now();
    if (now - this.lastSentAt >= THROTTLE_MS) {
      void this.send([item]);
      return;
    }
    this.queue.push(item);
    if (this.timer === null) {
      const wait = this.lastSentAt + THROTTLE_MS - now;
      this.timer = setTimeout(
        () => {
          this.timer = null;
          void this.flush();
        },
        Math.max(wait, 1000),
      );
    }
  }

  /** Отправка накопленного дайджеста (также вызывается таймером). */
  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.queue.length);
    await this.send(batch);
  }

  /** Ошибка публикации — редкое событие, шлём напрямую. */
  publishError(channelName: string, reason: string): void {
    void this.safeSend(`⚠️ Не удалось опубликовать в «${channelName}»: ${reason}`);
  }

  private async send(batch: NotifyItem[]): Promise<void> {
    this.lastSentAt = Date.now();
    const digest =
      batch.length === 1
        ? `💬 Новое сообщение от ${batch[0].from}: ${truncate(batch[0].text, MAX_TEXT)}`
        : `💬 ${batch.length} новых сообщения:\n${batch
            .map((b) => `• ${b.from}: ${truncate(b.text, 80)}`)
            .join("\n")}`;
    await this.safeSend(digest);
  }

  private async safeSend(text: string): Promise<void> {
    if (this.deps.api === null || !this.deps.ownerId) return;
    try {
      await this.deps.api.sendMessage(this.deps.ownerId, text, {
        replyMarkup: [[{ text: "Открыть инбокс", url: `${this.deps.webUrl}/inbox` }]],
      });
    } catch (err) {
      this.deps.onError?.(err);
    }
  }
}
