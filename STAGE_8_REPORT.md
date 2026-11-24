# ЭТАП 8 — Визуальный полиш: микро-интеракции, переходы, отклик

**Дата:** 25 ноября 2026 · **Статус:** готово, протестировано, ожидает деплоя (вручную)

Цель этапа — «оживить» UI без редизайна: пользователь чувствует отклик на каждое
действие, но не замечает, что именно изменилось. Жёсткие рамки соблюдены:
палитра, шрифт, layout и навигация не тронуты; ни одной новой библиотеки
(framer-motion/gsap/react-spring не используются); все автономные анимации —
только `transform`/`opacity`; `prefers-reduced-motion: reduce` отключает всё новое.

Два вопроса из ТЗ перед кодом — ответы пользователя: **View Transitions API: да,
с graceful fallback; счётчики: count-up (600ms, при reduced-motion — мгновенно).**

---

## 1. Что сделано

### ЧАСТЬ A — токены (эквивалент tailwind.config для нашего Tailwind 4)

Проект на Tailwind 4 (CSS-first, без tailwind.config), поэтому «расширение конфига»
выполнено эквивалентно: `@theme` + CSS-переменные `:root` в `globals.css`.

- **Motion:** `--motion-fast: 150ms`, `--motion-base: 220ms`, `--motion-slow: 320ms`;
  `--ease-out-spring` (0.34, 1.56, 0.64, 1), `--ease-out-smooth` (0.22, 1, 0.36, 1), `--ease-in-out` (0.65, 0, 0.35, 1).
- **Elevation:** `--shadow-1/2/3`, `--shadow-accent`, `--shadow-accent-soft`
  (тёмная тема: глубокие тени + тёплый glow вместо «тёмных теней»).
- **Градиент акцента:** `--gradient-accent` (+ hover), `--ripple-color`.
  В тёмной теме градиент чуть темнее (#4A8F6A→#5EA47F), ripple 0.25.
- Важно: тени НЕ через `@theme` (Tailwind 4 инлайнит значения shadow-токенов при
  сборке — тёмная тема тогда бы не переключала тени), а CSS-переменные +
  утилиты `.shadow-1/2/3/accent` в `interactions.css` со ссылкой на `var()`.
- **View Transitions CSS:** `::view-transition-old/new(root)` — кросс-фейд 200/220ms.

### ЧАСТЬ B — базовый слой `src/styles/interactions.css` (импорт в main.tsx)

1. **Press:** `.press` — 150ms spring, `:active scale(0.97)`; `.card-interactive`
   — scale(0.99) и hover (только `@media (hover:hover)`): translateY(-1px) + shadow-3.
2. **Ripple** на primary+lg кнопках: координаты клика → `span.ripple` → удаление
   через 500ms. При reduced-motion не создаётся.
3. **Focus ring:** `:where(button, a, [role], input, textarea, select):focus-visible` —
   кольцо 3px accent-soft + 4px accent.
4. **Input states:** `.input-base` (фокус: рамка accent + 3px glow), `.input-error`
   (рамка warm + shake 400ms; при reduced-motion — только рамка). Подключено на
   логине (неверный пароль — оба поля «вздрагивают»).
5. **Skeleton shimmer:** статичный `animate-pulse` заменён на градиентную волну
   (1.5s, тёмная тема — блик тусклее); reduced-motion — статичный фон.
6. **Fade-in-soft** для контента после skeleton (+ `empty-state` — подъём 8px/320ms).

### ЧАСТЬ C — компоненты (`components/ui.tsx`, layout)

1. **Btn:** ripple (primary+lg), `loading` (спиннер, ширина сохранена — контент
   `visibility:hidden`, применено на «Опубликовать через бота», «Отправить»,
   «Войти»), hover-состояния по вариантам, disabled без press.
2. **Card:** `card-interactive` + `selected` (рамка accent 1.5px + accent-soft фон) —
   применено в мастере «Разместить» (позиция/каналы) вместо ring.
3. **BottomNav:** активная иконка — пружинный pop (scale 1.05 + bg accent-soft,
   переход `scale` 220ms spring), tap иконки scale 0.92; главная кнопка
   «Разместить» — градиент accent + shadow-accent, нажатие глубже (0.94) и иконка
   проворачивается на 90°.
   *Отступление от буквы ТЗ:* плавный translateX-pill между вкладками невозможен
   без изменения layout: центральная кнопка «Разместить» авто-ширины — грид
   неравномерный (это запрещено пунктом «НЕ менять layout/навигацию»). Вместо
   этого — пружинный pop иконки (тот же визуальный язык, ноль layout-изменений).
4. **Sheet:** вход 260ms spring + контент-stagger (80ms); **выход** — обратная
   анимация 200ms (backdrop/X/Esc; закрытие из кода — мгновенное, как раньше);
   **drag-to-close за шапку** (следует за пальцем, резинка вверх, порог 90px);
   handle при касании — scale 1.1; **Esc** теперь закрывает шит (a11y-бонус).
5. **Toast:** вход translateY(-20→0)+opacity 220ms; **прогресс жизни** — scaleX
   2.4s (transform-only вместо width, как в ТЗ, но по правилу этапа); success —
   зелёная точка + Check, error — терракотовая точка + AlertCircle; выход —
   обратная 180ms; `text-canvas` вместо `text-white` — тост читаем в тёмной теме
   (ранее bg-ink там светлый — контраст был сломан, починено).
   Стек из нескольких тостов не делался: текущее поведение — замена сообщения
   (сохранено, чтобы не раздувать состояние).
6. **NumberAnimated** (новый компонент): mount → count-up 0→значение (600ms
   ease-out, округление во время анимации); изменение → плавный переход от
   старого к новому; reduced-motion — мгновенно. Применён: Пульт (маржа, активные,
   лиды), Аналитика (выручка, маржа, чек, лиды, конверсия), карточка и карточка
   деталей сделки (маржа).
7. **EmptyState:** вход fadeIn+подъём 8px/320ms, иконка — rotate(2°)+scale на hover
   (только desktop).
8. **FAB «Новая сделка»** и hero «Разместить товар»: градиент accent, shadow-accent,
   press 0.94. (FAB «Разместить» на Пульте — это hero-кнопка + кнопка в навигации —
   обе в градиенте.)

### ЧАСТЬ D — переходы между экранами

- **View Transitions API:** `router.navigate` обёрнут в `withViewTransition`
  (`lib/motion.ts`): useNavigate/Link/NavLink в data-router в итоге вызывают метод
  экземпляра роутера (проверено по исходникам react-router 7.18) — одна обёртка
  покрывает ВСЕ переходы. Нет API (Safari) или reduced-motion — мгновенно.
- **Stagger списков** (только при появлении, не при скролле): позиции на Пульте,
  Позиции, Сделки, Инбокс, Каналы — `stagger-children` (40ms шаг, до 8 пунктов).

### ЧАСТЬ E — полиш экранов

- **Пульт:** hero-кнопка градиент; Stat-карточки — NumberAnimated + вспышка
  accent-soft (200ms) при появлении; баннер «Добро пожаловать» — fade-in-soft.
- **Разместить:** шаги мастера — slide 240ms (remount по `key=step`, layout
  неизменен); карточки выбора — рамка accent при выборе; «Сгенерировать с AI» —
  градиент + «Думаю» с тремя пульсирующими точками; публикация — спиннер.
- **Сделки:** маржа — NumberAnimated; FAB — градиент, глубокое нажатие; карточка
  деталей — маржа NumberAnimated; **таймлайн**: активный шаг — мягкий пульс
  (2s, opacity 0.6→1), при оплате/отгрузке — success-flash (рамка accent, гаснет
  за 800ms, remount по статусу).
- **Аналитика:** числа — NumberAnimated; сегменты — pill translateX; смена
  периода — fade контента 200ms.
- **Инбокс:** NEW-бейдж и точка — тот же мягкий пульс; список — stagger.
- **Login:** поля «вздрагивают» при ошибке, кнопка — спиннер + **main-landmark**
  (была единственной страницей без `<main>` — a11y).

### ЧАСТЬ F — тёмная тема

Все новые токены переопределены в `html.dark`: тени — глубокие (до
`rgba(0,0,0,0.55)`), accent-тени — тёплый glow, градиент темнее, ripple 0.25,
skeleton-блик 0.06. Тост читаем (text-canvas). Проверено визуально (24 скриншота).

---

## 2. Проверки (ЧАСТЬ G) — результаты

| Проверка | Результат |
|---|---|
| Серверные тесты (`bun test` в apps/server) | **216/216** — зелёные, сервер не менялся (только `npm run build` — 0 ошибок TS) |
| Web-тесты (`bun test apps/web`) | **32/32** (было 21; +11 новых в `motion.test.ts`: easing, reduced-motion, count-up, деградация View Transitions) |
| Браузерный аудит 375px | **81/81** = 68 базовых (все зелёные, ничего не сломано) + 13 новых: press-переходы, токены, bottom-nav scale, градиент FAB, ripple, VT-API, sheet-in, skeleton-shimmer, segmented-pill translateX, count-up чисел, 3× reduced-motion |
| Бандл (gzip) | **до:** css 9.45 KB + js 157.76 KB = 167.21 KB → **после:** 11.42 + 159.72 = **171.14 KB** — рост **+3.93 KB gzip < 5 KB** лимита (сырой: css +9.3 KB, js +5.6 KB) |
| prefers-reduced-motion | Эмуляция в аудите: `.press` transition=0s, счётчики/эффекты animation=none, ripple не создаётся, skeleton статичный |
| Lighthouse (mobile, /login, devtools-троттлинг, идентичные условия A/B) | **ДО:** Performance 71, Accessibility 88 → **ПОСЛЕ:** Performance 70 (−1, в пределах шума; FCP под эмулированным slow-4G в песочнице доминирует в обеих версиях), **Accessibility 91** (+3 — добавлен main-landmark) |
| Остаток a11y (88→91) | `color-contrast` 4.31 у `text-soft` (#7A756D на #FAF8F5) на подписи/футере логина — **пре-существующий** токен дизайн-системы (проверено замером ДО: та же 88); менять цвета токенов запрещено ТЗ этапа (ЧАСТЬ H) |
| Проверка на реальном iOS/Android | В песочнице недоступна; все эффекты построены на деградации: Safari без VT-API — мгновенные переходы, тач — без hover-эффектов |

Снимки: **12 экранов × 2 темы = 24 скриншота** + пары «до/после» 5 ключевых
экранов — приложены к чату (`download/stage8/`), визуальная сверка через VLM:
«поломок нет, сегмент-пилюля и мягкие тени заметно приятнее, тёмная тема целостна,
FAB совпадает с hero-кнопкой».

---

## 3. Чего НЕ делал (ЧАСТЬ H — соблюдено)

Градиент — только FAB/hero/AI-кнопки; никакого glassmorphism/backdrop-filter (в
новом коде), neumorphism, bounce > 4px, изменений цветов/шрифта/layout; «loading
dots» — только в AI-кнопках; списки не анимируются при скролле; часто меняющиеся
числа не анимируются; haptic (navigator.vibrate) не добавлялся.

## 4. Файлы

**Новые:** `apps/web/src/styles/interactions.css`; `apps/web/src/lib/motion.ts`;
`apps/web/src/lib/__tests__/motion.test.ts`; `apps/web/src/components/NumberAnimated.tsx`.
**Изменённые (18):** globals.css (токены/VT-CSS), router.tsx (VT-обёртка), main.tsx
(импорт слоя), ui.tsx (Btn/Card/Segmented/Skeleton/EmptyState/Sheet/поля),
AppShell (ToastHost), BottomNav, LoginScreen (+main-landmark), Pult/Publish/
Deals/Inbox/Analytics/Channels/Positions/More screens, DealDetailSheet,
LeadDetailSheet, stores/publish.ts (вид тоста).

## 5. Деплой — вручную пользователем

1. Render → сервис API → Manual Deploy → «Clear build cache & deploy» (main).
2. В браузере: Ctrl+Shift+R (новый SW подхватится сам, PWA autoUpdate).

Сводка изменений на production после деплоя: плавные переходы между экранами
(Chrome/Edge), «живые» счётчики, пульсирующие индикаторы новых лидов и активного
шага сделки, градиентные главные кнопки, «думающие» AI-кнопки, шиты со
свайпом-закрытием, тосты с прогрессом и иконками успеха/ошибки — и всё это
отключается при «уменьшить движение».
