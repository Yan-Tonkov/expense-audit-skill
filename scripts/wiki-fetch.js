#!/usr/bin/env node
/**
 * wiki-fetch.js — загружает и печатает полный текст одной или нескольких
 * статей корпоративной вики (https://agentsim.online/wiki/) в виде Markdown,
 * с метаданными (автор, даты) и ссылкой-источником для цитирования.
 *
 * Использование:
 *   node scripts/wiki-fetch.js <путь_или_URL> [<путь_или_URL> ...]
 *
 * Примеры аргумента:
 *   /wiki/product/product-overview
 *   product/product-overview
 *   https://agentsim.online/wiki/product/product-overview
 */

const { toUrl, fetchArticle } = require('./wiki-lib');

async function fetchOne(arg) {
  const url = toUrl(arg);
  let article;
  try {
    article = await fetchArticle(arg);
  } catch (err) {
    return `\n---\n### ⚠ Не удалось загрузить ${url}\n${err.message}\n`;
  }

  if (!article.markdown) {
    return `\n---\n### ⚠ Не удалось распознать содержимое страницы ${url}\n(возможно, это страница-листинг, а не статья — попробуйте /wiki/<раздел>/pages)\n`;
  }

  const metaLine = Object.entries(article.meta)
    .map(([k, v]) => `**${k}:** ${v}`)
    .join(' · ');

  return [
    `\n---`,
    `### Источник: ${article.title || url}`,
    `URL: ${url}`,
    metaLine ? metaLine : null,
    '',
    article.markdown,
  ].filter((x) => x !== null).join('\n');
}

(async () => {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Использование: node scripts/wiki-fetch.js <путь_или_URL> [...]');
    process.exit(1);
  }

  for (const arg of args) {
    const out = await fetchOne(arg);
    console.log(out);
  }
})().catch((err) => {
  console.error('Ошибка:', err.message);
  process.exit(1);
});
