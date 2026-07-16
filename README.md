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

# wiki-search

Claude Code skill для ответов на вопросы по корпоративной вики [agentsim.online/wiki](https://agentsim.online/wiki/).

## Что делает

У вики нет встроенного поиска, только 7 разделов (Продукт, Продажи, Маркетинг, HR, Финансы, Техотдел, Общее) со списками статей. Скилл сначала строит индекс всех статей (заголовок + ссылка), даёт Claude выбрать релевантные по смыслу вопроса, затем загружает их полный текст и отвечает со ссылками на источники.

## Использование

### Как Claude Code skill

```
/wiki-search Какие тарифы актуальны для Enterprise-клиентов?
```

### Напрямую из терминала

```bash
# Индекс всех статей (кэш на 24ч в .wiki-index-cache.json)
node scripts/wiki-index.js
node scripts/wiki-index.js --refresh   # принудительно обновить

# Полный текст одной или нескольких статей
node scripts/wiki-fetch.js product/product-overview
node scripts/wiki-fetch.js product/product-overview sales/pricing-current
```

## Требования

- Node.js 18+ (используются только встроенные модули, зависимостей нет)
