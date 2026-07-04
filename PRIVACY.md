# Политика конфиденциальности — PII Firewall

_Дата вступления в силу: 2026-07-04_

## Коротко

**PII Firewall не собирает, не передаёт и не хранит ваши данные на серверах.**
Всё работает локально в вашем браузере. Расширение не запрашивает ни одного
сетевого разрешения — это можно проверить в `manifest.json` (`"permissions":
["storage"]`, никаких `host_permissions`).

## Какие данные обрабатываются

- **Текст промпта** обрабатывается **в памяти** для поиска ПДн и маскирования.
  Исходный текст промпта **не сохраняется нигде**.
- **Пары «значение ↔ метка»** (например, `Иванов → [PERSON_1]`) сохраняются
  **только локально** в `chrome.storage.session` для восстановления ответа.
  Это хранилище **автоматически очищается при закрытии браузера**.
- **Настройки и счётчик предотвращённых утечек** хранятся локально в
  `chrome.storage.local`.

## Куда данные передаются

**Никуда.** Расширение не обращается к сети: нет серверов, аккаунтов,
аналитики, телеметрии, cookies и сторонних сервисов. Данные физически не могут
покинуть ваше устройство через это расширение.

## Опциональное постоянное хранилище

По вашему явному выбору пары «значение ↔ метка» можно сохранить между сессиями.
В этом случае они шифруются локально алгоритмом **AES-GCM** ключом,
производным от вашего пароля (**PBKDF2**). Пароль нигде не сохраняется. Данные
остаются на вашем устройстве.

## Ваш контроль

- «Забыть эту сессию» и «Забыть всё» — удаляют локальные данные немедленно.
- Экспорт/импорт настроек не содержит ПДн.
- Удаление расширения удаляет все связанные локальные данные.

## Разрешения

- `storage` — локальное хранилище браузера (session/local).
- `activeTab` — определить текущую вкладку AI-чата при открытии popup (только
  активная вкладка и только по вашему клику).
- `contextMenus` — пункт «Замаскировать выделение» в контекстном меню.

**Ни одно из разрешений не даёт доступа к сети** — нет `host_permissions`,
нет фонового доступа к вкладкам.

## Контакт

Вопросы по приватности: policeman000@gmail.com

---

# Privacy Policy — PII Firewall (English)

_Effective date: 2026-07-04_

## In short

**PII Firewall does not collect, transmit, or store your data on any server.**
Everything runs locally in your browser. The extension requests **zero network
permissions** — verifiable in `manifest.json` (`"permissions": ["storage"]`, no
`host_permissions`).

## What data is processed

- **Prompt text** is processed **in memory** to detect and mask PII. The raw
  prompt text is **never stored**.
- **Value↔placeholder pairs** (e.g. `John → [PERSON_1]`) are stored **locally
  only** in `chrome.storage.session` to restore the reply. This storage is
  **cleared automatically when the browser closes**.
- **Settings and the "leaks prevented" counter** are stored locally in
  `chrome.storage.local`.

## Where data is sent

**Nowhere.** No servers, accounts, analytics, telemetry, cookies, or third-party
services. Data physically cannot leave your device through this extension.

## Optional persistent storage

If you explicitly enable it, value↔placeholder pairs may persist across
sessions. They are encrypted locally with **AES-GCM** using a key derived from
your passphrase (**PBKDF2**). The passphrase is never stored. Data stays on your
device.

## Your control

- "Forget this session" / "Forget everything" delete local data immediately.
- Settings export/import contains no PII.
- Uninstalling the extension removes all associated local data.

## Permissions

- `storage` — the browser's local storage (session/local).
- `activeTab` — identify the current AI-chat tab when you open the popup (active
  tab only, only on your click).
- `contextMenus` — the "Mask selection" right-click item.

**None of these grant network access** — no `host_permissions`, no background
tab access.

## Contact

Privacy questions: policeman000@gmail.com
