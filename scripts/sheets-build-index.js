#!/usr/bin/env node
/**
 * sheets-build-index.js — обходит 10 Google Sheets менеджеров (список — в
 * sheets-lib.js/SOURCES, каждая таблица в своём формате) и собирает
 * sheets-index.md в корне репозитория: заголовок, ссылка (с gid), колонки
 * и число строк для каждой таблицы.
 *
 * В отличие от wiki-build-index.js, единица индекса здесь — целая таблица
 * (их всего 10), а не отдельная строка внутри неё: строки ищутся уже на
 * этапе /sheets-search, после того как индекс подсказал, какие 2-3 таблицы
 * открывать целиком.
 *
 * Использование:
 *   node scripts/sheets-build-index.js
 */

const fs = require('fs');
const path = require('path');
const { SOURCES, fetchCsvSource, parseCsv, sheetUrl } = require('./sheets-lib');

const OUT_PATH = path.join(__dirname, '..', 'sheets-index.md');

async function buildEntry(id, n) {
  console.error(`  Таблица ${n} (${id})...`);
  const { gid, title, csv } = await fetchCsvSource(id);
  const rows = parseCsv(csv);
  const headers = rows[0] || [];
  const dataRowCount = Math.max(rows.length - 1, 0);
  return { n, id, gid, title, headers, dataRowCount };
}

function render(entries) {
  const lines = [
    '# Индекс таблиц менеджеров',
    '',
    'Собрано автоматически: `/index-sheets` (node scripts/sheets-build-index.js). Не редактировать вручную — при необходимости перегенерировать той же командой.',
    `Обновлено: ${new Date().toISOString()}`,
    '',
    'Каждая таблица — отдельный менеджер, в своём формате колонок. Это индекс *таблиц*, а не строк внутри них: чтобы найти конкретную запись, сначала выбери 1-3 подходящие таблицы по колонкам ниже, затем открой их целиком через `node scripts/sheets-fetch.js <номер>`.',
    '',
  ];

  let totalRows = 0;
  for (const e of entries) {
    totalRows += e.dataRowCount;
    lines.push(
      `## Таблица ${e.n} — ${e.title}`,
      '',
      `- URL: ${sheetUrl(e.id, e.gid)}`,
      `- Строк данных: ${e.dataRowCount}`,
      `- Колонки: ${e.headers.join(', ')}`,
      '',
    );
  }

  lines.push(`Всего таблиц: ${entries.length}, строк данных: ${totalRows}`);
  return lines.join('\n');
}

(async () => {
  console.error('→ Собираю индекс таблиц менеджеров (10 источников)...');
  const entries = [];
  for (let i = 0; i < SOURCES.length; i++) {
    try {
      entries.push(await buildEntry(SOURCES[i], i + 1));
    } catch (err) {
      console.error(`  ⚠ Таблица ${i + 1}: не удалось загрузить — ${err.message}`);
      entries.push({
        n: i + 1,
        id: SOURCES[i],
        gid: '0',
        title: `(не удалось загрузить: ${SOURCES[i]})`,
        headers: [],
        dataRowCount: 0,
      });
    }
  }

  const md = render(entries);
  fs.writeFileSync(OUT_PATH, md, 'utf8');

  const total = entries.reduce((s, e) => s + e.dataRowCount, 0);
  console.error(`✓ Готово: ${entries.length} таблиц, ${total} строк данных записано в ${OUT_PATH}`);
})().catch((err) => {
  console.error('Ошибка построения индекса:', err.message);
  process.exit(1);
});
