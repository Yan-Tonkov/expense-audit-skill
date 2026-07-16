#!/usr/bin/env node
/**
 * index-status.js — TTL-проверка свежести любого index-файла с шапкой вида
 * "Обновлено: <ISO дата>" (wiki-index.md, sheets-index.md и т.п.), без обращения
 * к источнику данных.
 *
 * И вики, и таблицы менеджеров не умеют сообщать об изменениях сами —
 * поэтому свежесть индекса проверяется по времени его последней сборки (TTL),
 * а не пуш-инвалидацией.
 *
 * Использование:
 *   node scripts/index-status.js --file wiki-index.md [--max-age-days 7]
 *   node scripts/index-status.js --file sheets-index.md [--max-age-days 7]
 *
 * Вывод (stdout): одна из
 *   MISSING
 *   STALE <возраст_в_днях> <порог_в_днях>
 *   FRESH <возраст_в_днях> <порог_в_днях>
 * плюс человекочитаемая строка ниже.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_MAX_AGE_DAYS = 7;

function getArg(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const file = getArg('--file');
if (!file) {
  console.error('Использование: node scripts/index-status.js --file <имя_файла.md> [--max-age-days N]');
  process.exit(1);
}

const maxAgeArg = Number(getArg('--max-age-days'));
const maxAgeDays = !Number.isNaN(maxAgeArg) && maxAgeArg > 0 ? maxAgeArg : DEFAULT_MAX_AGE_DAYS;

const indexPath = path.join(__dirname, '..', file);

if (!fs.existsSync(indexPath)) {
  console.log('MISSING');
  console.log(`${file} не найден в корне репозитория. Нужно сначала собрать индекс.`);
  process.exit(0);
}

const content = fs.readFileSync(indexPath, 'utf8');
const m = content.match(/^Обновлено:\s*(.+)$/m);
const builtAt = m ? new Date(m[1].trim()) : null;

if (!builtAt || Number.isNaN(builtAt.getTime())) {
  console.log('STALE');
  console.log(`Не удалось прочитать дату сборки из ${file} — считаю индекс устаревшим, нужно перестроить.`);
  process.exit(0);
}

const ageDays = (Date.now() - builtAt.getTime()) / 86400000;
const ageRounded = Math.round(ageDays * 10) / 10;

if (ageDays > maxAgeDays) {
  console.log(`STALE ${ageRounded} ${maxAgeDays}`);
  console.log(`${file} собран ${builtAt.toISOString()} (${ageRounded} дн. назад) — старше порога ${maxAgeDays} дн. Нужно перестроить.`);
} else {
  console.log(`FRESH ${ageRounded} ${maxAgeDays}`);
  console.log(`${file} собран ${builtAt.toISOString()} (${ageRounded} дн. назад) — в пределах порога ${maxAgeDays} дн., можно использовать как есть.`);
}
