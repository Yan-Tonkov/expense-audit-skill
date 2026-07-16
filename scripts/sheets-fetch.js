#!/usr/bin/env node
/**
 * sheets-fetch.js — загружает и печатает одну или несколько таблиц менеджеров
 * целиком (как Markdown-таблицу с колонкой "Строка" — реальным номером строки
 * в исходном листе, для точного цитирования).
 *
 * Использование:
 *   node scripts/sheets-fetch.js <номер 1-10 | spreadsheetId | URL> [...]
 *
 * Примеры аргумента:
 *   3
 *   1CtNttGw_A4bCX1m2pTwCTRkr9125B4b8t6tVlfbUu5s
 *   https://docs.google.com/spreadsheets/d/1CtNttGw_A4bCX1m2pTwCTRkr9125B4b8t6tVlfbUu5s/edit
 */

const { SOURCES, fetchCsvSource, parseCsv, sheetUrl } = require('./sheets-lib');

function resolveId(arg) {
  const n = Number(arg);
  if (Number.isInteger(n) && n >= 1 && n <= SOURCES.length) return SOURCES[n - 1];

  const m = String(arg).match(/[a-zA-Z0-9_-]{25,}/);
  const id = m ? m[0] : String(arg).trim();
  if (SOURCES.includes(id)) return id;

  throw new Error(`Не нашёл источник "${arg}" — используйте номер 1-${SOURCES.length} из sheets-index.md, spreadsheetId или полный URL`);
}

function cell(v) {
  return String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

async function fetchOne(arg) {
  let id;
  try {
    id = resolveId(arg);
  } catch (err) {
    return `\n---\n### ⚠ ${err.message}\n`;
  }

  let source;
  try {
    source = await fetchCsvSource(id);
  } catch (err) {
    return `\n---\n### ⚠ Не удалось загрузить таблицу ${id}\n${err.message}\n`;
  }

  const rows = parseCsv(source.csv);
  const headers = rows[0] || [];
  const dataRows = rows.slice(1);
  const url = sheetUrl(source.id, source.gid);

  const lines = [
    `\n---`,
    `### Источник: ${source.title}`,
    `URL: ${url}`,
    `Чтобы сослаться на конкретную строку N, добавь к URL: &range=A{N}:Z{N}`,
    '',
    `| Строка | ${headers.join(' | ')} |`,
    `| --- | ${headers.map(() => '---').join(' | ')} |`,
  ];
  dataRows.forEach((row, i) => {
    const rowNum = i + 2; // 1 — строка заголовков
    lines.push(`| ${rowNum} | ${row.map(cell).join(' | ')} |`);
  });

  return lines.join('\n');
}

(async () => {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error(`Использование: node scripts/sheets-fetch.js <номер 1-${SOURCES.length} | spreadsheetId | URL> [...]`);
    process.exit(1);
  }

  for (const arg of args) {
    console.log(await fetchOne(arg));
  }
})().catch((err) => {
  console.error('Ошибка:', err.message);
  process.exit(1);
});
