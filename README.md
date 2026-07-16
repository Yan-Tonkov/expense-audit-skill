# expense-audit

Claude Code skill для аудита расходов из Google Sheets.

## Что делает

Берёт таблицу с транзакциями, считает, кладёт отчёт обратно.

**Входные данные** — Google Sheet с колонками:
| date | amount | description |
|---|---|---|
| 2025-01-09 | 69589 | Google Ads — контекстная реклама |

**Выходной отчёт** — новый лист «Аудит расходов» в той же таблице:
1. Итоги по месяцам (с динамикой и долей ghost payroll)
2. Расходы по категориям × месяц
3. Ghost payroll — выплаты уволенным сотрудникам после даты увольнения
4. Ключевые выводы

## Установка

```bash
# 1. Установить gws CLI
npm install -g @googleworkspace/cli

# 2. Авторизоваться
gws auth login

# 3. Клонировать репозиторий в папку проекта
git clone https://github.com/yan-tonkov/expense-audit-skill .
```

## Использование

### Как Claude Code skill

Добавь `.claude/commands/expense-audit.md` в свой проект, затем:

```
/expense-audit https://docs.google.com/spreadsheets/d/SHEET_ID/edit
```

### Напрямую из терминала

```bash
node scripts/expense-audit.js https://docs.google.com/spreadsheets/d/SHEET_ID/edit
# или просто ID:
node scripts/expense-audit.js SHEET_ID
```

## Требования

- Node.js 18+
- gws CLI (`npm install -g @googleworkspace/cli`)
- Google Sheets API включён в GCP проекте
- `gws auth login` выполнен

---

# index-wiki + wiki-search

Два Claude Code skill'а для работы с корпоративной вики [agentsim.online/wiki](https://agentsim.online/wiki/), у которой нет встроенного поиска — только 7 разделов (Продукт, Продажи, Маркетинг, HR, Финансы, Техотдел, Общее) со списками статей.

## Что делают

**`/index-wiki`** обходит все 7 разделов и собирает `wiki-index.md` в корне репозитория — список всех статей (~100 шт.) с заголовком, ссылкой и кратким описанием (описание берётся с обзорной страницы раздела, а если его там нет — из первого абзаца самой статьи). Это статический снимок вики.

**`/wiki-search`** отвечает на вопрос: сначала проверяет свежесть `wiki-index.md` (по TTL — дате сборки в шапке файла, порог 7 дней) и сам пересобирает его, если он устарел или отсутствует; затем по описаниям (не только заголовкам) выбирает 2–3 наиболее релевантных статьи и открывает только их. У вики нет вебхуков или другого способа узнать об изменениях заранее, поэтому свежесть индекса — это TTL, а не пуш-инвалидация.

## Использование

### Как Claude Code skill

```
/index-wiki
/wiki-search Какие тарифы актуальны для Enterprise-клиентов?
```

`/wiki-search` можно вызывать сразу, без ручного `/index-wiki` — он сам пересоберёт индекс при первом запуске или если тот устарел.

### Напрямую из терминала

```bash
# Проверить, не устарел ли индекс (порог по умолчанию — 7 дней)
node scripts/wiki-index-status.js
node scripts/wiki-index-status.js --max-age-days 3

# Пересобрать wiki-index.md (обход всех 7 разделов + описания)
node scripts/wiki-build-index.js

# Полный текст одной или нескольких статей
node scripts/wiki-fetch.js product/product-overview
node scripts/wiki-fetch.js product/product-overview sales/pricing-current
```

## Требования

- Node.js 18+ (используются только встроенные модули, зависимостей нет)
