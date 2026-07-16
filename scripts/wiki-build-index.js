#!/usr/bin/env node
/**
 * wiki-build-index.js — обходит всю корпоративную вики
 * (https://agentsim.online/wiki/) и собирает wiki-index.md в корне репозитория:
 * заголовок + краткое описание + ссылка для каждой статьи, сгруппированные по разделам.
 *
 * Описание берётся из обзорной страницы раздела, если оно там указано вручную,
 * иначе — из первого содержательного абзаца самой статьи (дополнительный запрос).
 *
 * Использование:
 *   node scripts/wiki-build-index.js
 */

const fs = require('fs');
const path = require('path');
const {
  BASE,
  SECTIONS,
  fetchUrl,
  fetchArticle,
  firstParagraph,
  parseListPage,
  parseSectionDescriptions,
  mapPool,
} = require('./wiki-lib');

const OUT_PATH = path.join(__dirname, '..', 'wiki-index.md');

const SECTION_TITLES = {
  product: 'Продукт',
  sales: 'Продажи',
  marketing: 'Маркетинг',
  hr: 'HR',
  finance: 'Финансы',
  tech: 'Техотдел',
  general: 'Общее',
};

async function buildSection(section) {
  const [listHtml, overviewHtml] = await Promise.all([
    fetchUrl(`${BASE}/wiki/${section}/pages`),
    fetchUrl(`${BASE}/wiki/${section}`),
  ]);

  const items = parseListPage(listHtml);
  const descByPath = parseSectionDescriptions(overviewHtml);

  const withDesc = items.map((item) => ({ ...item, description: descByPath.get(item.path) || '' }));
  const missing = withDesc.filter((item) => !item.description);

  console.error(`  ${section}: ${items.length} статей, ${missing.length} без описания на обзорной странице — догружаю...`);

  await mapPool(missing, 5, async (item) => {
    try {
      const article = await fetchArticle(item.path);
      item.description = firstParagraph(article.markdown) || '(нет описания)';
    } catch (err) {
      item.description = '(не удалось загрузить для описания)';
    }
  });

  return withDesc;
}

function render(bySection) {
  let total = 0;
  const lines = [
    '# Индекс вики DataPeople',
    '',
    `Собрано автоматически: \`/index-wiki\` (node scripts/wiki-build-index.js). Не редактировать вручную — при необходимости перегенерировать той же командой.`,
    `Обновлено: ${new Date().toISOString()}`,
    '',
  ];

  for (const section of SECTIONS) {
    const items = bySection[section] || [];
    total += items.length;
    lines.push(`## ${SECTION_TITLES[section]} (/wiki/${section})`, '');
    for (const item of items) {
      const desc = item.description ? ` — ${item.description}` : '';
      lines.push(`- [${item.title}](${item.url})${desc}`);
    }
    lines.push('');
  }

  lines.push(`Всего статей: ${total}`);
  return lines.join('\n');
}

(async () => {
  console.error('→ Собираю индекс вики (7 разделов, заголовки + описания)...');
  const bySection = {};
  for (const section of SECTIONS) {
    bySection[section] = await buildSection(section);
  }

  const md = render(bySection);
  fs.writeFileSync(OUT_PATH, md, 'utf8');

  const total = Object.values(bySection).reduce((s, arr) => s + arr.length, 0);
  console.error(`✓ Готово: ${total} статей записано в ${OUT_PATH}`);
})().catch((err) => {
  console.error('Ошибка построения индекса:', err.message);
  process.exit(1);
});
