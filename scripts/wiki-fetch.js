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

const { toUrl, fetchUrl, htmlToMarkdown, decodeEntities } = require('./wiki-lib');

function extract(html) {
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/);
  const title = titleMatch ? decodeEntities(titleMatch[1]).replace(/\s*—\s*Wiki$/, '') : null;

  const metaMatch = html.match(/<div class="wiki-meta">([\s\S]*?)<\/div>/);
  const meta = {};
  if (metaMatch) {
    const re = /<span class="wiki-meta-label">([^<]+)<\/span>\s*([^<]*)/g;
    let m;
    while ((m = re.exec(metaMatch[1]))) {
      meta[decodeEntities(m[1]).replace(/:$/, '')] = decodeEntities(m[2]).trim();
    }
  }

  // Внутри .wiki-content не бывает вложенных <div>, поэтому первый
  // закрывающий </div> после открывающего тега — конец блока контента.
  const contentMatch = html.match(/<div class="wiki-content">([\s\S]*?)<\/div>/);
  const contentHtml = contentMatch ? contentMatch[1] : null;

  return { title, meta, contentHtml };
}

async function fetchOne(arg) {
  const url = toUrl(arg);
  let html;
  try {
    html = await fetchUrl(url);
  } catch (err) {
    return `\n---\n### ⚠ Не удалось загрузить ${url}\n${err.message}\n`;
  }

  const { title, meta, contentHtml } = extract(html);
  if (!contentHtml) {
    return `\n---\n### ⚠ Не удалось распознать содержимое страницы ${url}\n(возможно, это страница-листинг, а не статья — попробуйте /wiki/<раздел>/pages)\n`;
  }

  const md = htmlToMarkdown(contentHtml);
  const metaLine = Object.entries(meta)
    .map(([k, v]) => `**${k}:** ${v}`)
    .join(' · ');

  return [
    `\n---`,
    `### Источник: ${title || url}`,
    `URL: ${url}`,
    metaLine ? metaLine : null,
    '',
    md,
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
