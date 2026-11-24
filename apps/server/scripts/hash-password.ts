/**
 * Утилита владельца: получить Argon2id-хеш своего пароля для env.
 *
 * Запуск (локально, пароль не выводится эхом):
 *   bun run hash-password            — интерактивный ввод (скрытый)
 *   bun run hash-password -- "…"      — сразу строка (осторожно с историей)
 *
 * Вывод — строка $argon2id$… — положите её в OWNER_PASSWORD_HASH
 * (apps/server/.env / Render env). Пароль в открытом виде не попадает
 * ни в базу, ни в env, ни в репозиторий.
 */

import { hashPassword } from "../src/auth/passwords.js";
import { hash as argon2Hash } from "@node-rs/argon2";

async function readHidden(prompt: string): Promise<string> {
  process.stdout.write(`${prompt} `);
  /* Без echo: читаем посимвольно до перевода строки. */
  process.stdin.setRawMode(true);
  process.stdin.resume();
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve) => {
    process.stdin.on("data", (chunk: Buffer) => {
      for (const byte of chunk) {
        if (byte === 0x0d || byte === 0x0a) {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write("\n");
          resolve();
          return;
        }
        if (byte === 0x03) {
          /* Ctrl+C */
          process.stdout.write("\n");
          process.exit(130);
        }
        chunks.push(Buffer.from([byte]));
      }
    });
  });
  return Buffer.concat(chunks).toString("utf8");
}

const arg = process.argv[2];
let password: string;
if (arg) {
  password = arg;
} else {
  password = await readHidden("Новый пароль владельца:");
}
if (password.length < 8) {
  console.error("Пароль короче 8 символов — придумайте длиннее.");
  process.exit(1);
}

const hash = password === arg ? await argon2Hash(password, { memorySize: 19456, timeCost: 2, parallelism: 1 }) : await hashPassword(password);
console.log(hash);
console.log("→ вставьте строку выше в OWNER_PASSWORD_HASH и перезапустите API");
