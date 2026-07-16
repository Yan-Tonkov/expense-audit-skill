#!/usr/bin/env node
/**
 * wiki-index.js — строит индекс всех статей корпоративной вики
 * https://agentsim.online/wiki/ (список: заголовок + URL + раздел).
 *
 * У вики нет поиска и общего sitemap, но каждый раздел отдаёт полный
 * список своих страниц по адресу /wiki/<раздел>/pages.
 *
 * Использование:
 *   node scripts/wiki-index.js            # использует кэш (если свежее 24ч), иначе обновляет
 *   node scripts/wiki-index.js --refresh  # принудительно обновить кэш
 *
 * Вывод: индекс в Markdown, сгруппированный по разделам, в stdout.
 */

const fs = require('fs');
const path = require('path');
const { BASE, SECTIONS, fetchUrl, decodeEntities } = require('./wiki-lib');

const CACHE_PATH = path.join(__dirname, '..', '.wiki-index-cache.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 часа

const SECTION_TITLES = {
  product: 'Продукт',
  sales: 'Продажи',
  marketing: 'Маркетинг',
  hr: 'HR',
  finance: 'Финансы',
  tech: 'Техотдел',
  general: 'Общее',
};

function parseListPage(html) {
  const items = [];
  const re = /<a class="wiki-list-item" href="([^"]+)">\s*<span class="wiki-list-icon">[^<]*<\/span>\s*<span class="wiki-list-label">([^<]*)<\/span>/g;
  let m;
  while ((m = re.exec(html))) {
    items.push({ url: `${BASE}${m[1]}`, path: m[1], title: decodeEntities(m[2]) });
  }
  return items;
}

async function buildIndex() {
  const bySection = {};
  for (const section of SECTIONS) {
    const html = await fetchUrl(`${BASE}/wiki/${section}/pages`);
    bySection[section] = parseListPage(html);
  }
  return { fetchedAt: new Date().toISOString(), bySection };
}

function loadCache() {
  if (!fs.existsSync(CACHE_PATH)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    const age = Date.now() - new Date(data.fetchedAt).getTime();
    if (age > CACHE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function printIndex(data) {
  let total = 0;
  console.log(`# Индекс вики (obновлён: ${data.fetchedAt})\n`);
  for (const section of SECTIONS) {
    const items = data.bySection[section] || [];
    total += items.length;
    console.log(`## ${SECTION_TITLES[section]} (/wiki/${section})`);
    for (const item of items) {
      console.log(`- [${item.title}](${item.url})`);
    }
    console.log('');
  }
  console.log(`Всего статей: ${total}`);
}

(async () => {
  const forceRefresh = process.argv.includes('--refresh');
  let data = forceRefresh ? null : loadCache();

  if (!data) {
    console.error('→ Обновляю индекс вики (обход 7 разделов)...');
    data = await buildIndex();
    fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
    console.error('  Готово, закэшировано в .wiki-index-cache.json (на 24ч).');
  }

  printIndex(data);
})().catch((err) => {
  console.error('Ошибка построения индекса:', err.message);
  process.exit(1);
});
