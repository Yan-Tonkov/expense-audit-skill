#!/usr/bin/env node
/**
 * wiki-index-status.js — проверяет свежесть wiki-index.md, не обращаясь к вики.
 *
 * У вики нет вебхуков/событий об изменениях, поэтому свежесть — по TTL:
 * читаем строку "Обновлено: <ISO дата>" из шапки wiki-index.md и сравниваем
 * с текущим временем. Если файла нет, дата не читается или он старше
 * порога — индекс считается устаревшим.
 *
 * Использование:
 *   node scripts/wiki-index-status.js [--max-age-days N]
 *
 * Вывод (stdout): одна из
 *   MISSING
 *   STALE <возраст_в_днях> <порог_в_днях>
 *   FRESH <возраст_в_днях> <порог_в_днях>
 * плюс человекочитаемая строка ниже.
 */

const fs = require('fs');
const path = require('path');

const INDEX_PATH = path.join(__dirname, '..', 'wiki-index.md');
const DEFAULT_MAX_AGE_DAYS = 7;

function getMaxAgeDays() {
  const i = process.argv.indexOf('--max-age-days');
  if (i !== -1 && process.argv[i + 1]) {
    const v = Number(process.argv[i + 1]);
    if (!Number.isNaN(v) && v > 0) return v;
  }
  return DEFAULT_MAX_AGE_DAYS;
}

const maxAgeDays = getMaxAgeDays();

if (!fs.existsSync(INDEX_PATH)) {
  console.log('MISSING');
  console.log(`wiki-index.md не найден в корне репозитория. Нужно собрать индекс через /index-wiki перед поиском.`);
  process.exit(0);
}

const content = fs.readFileSync(INDEX_PATH, 'utf8');
const m = content.match(/^Обновлено:\s*(.+)$/m);
const builtAt = m ? new Date(m[1].trim()) : null;

if (!builtAt || Number.isNaN(builtAt.getTime())) {
  console.log('STALE');
  console.log(`Не удалось прочитать дату сборки из wiki-index.md — считаю индекс устаревшим, нужно перестроить.`);
  process.exit(0);
}

const ageDays = (Date.now() - builtAt.getTime()) / 86400000;
const ageRounded = Math.round(ageDays * 10) / 10;

if (ageDays > maxAgeDays) {
  console.log(`STALE ${ageRounded} ${maxAgeDays}`);
  console.log(`Индекс собран ${builtAt.toISOString()} (${ageRounded} дн. назад) — старше порога ${maxAgeDays} дн. Нужно перестроить через /index-wiki.`);
} else {
  console.log(`FRESH ${ageRounded} ${maxAgeDays}`);
  console.log(`Индекс собран ${builtAt.toISOString()} (${ageRounded} дн. назад) — в пределах порога ${maxAgeDays} дн., можно использовать как есть.`);
}
