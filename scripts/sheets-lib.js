/**
 * sheets-lib.js — общие утилиты для скриптов sheets-search: чтение публичных
 * Google Sheets (доступных "всем, у кого есть ссылка") без OAuth/API-ключа,
 * через CSV-экспорт.
 */

const https = require('https');

// 10 таблиц менеджеров — фиксированный список источников (аналог SECTIONS в
// wiki-lib.js: сам список источников задан извне, а не обходом сайта).
// Порядок соответствует нумерации "Таблица N" в sheets-index.md.
const SOURCES = [
  '1CtNttGw_A4bCX1m2pTwCTRkr9125B4b8t6tVlfbUu5s',
  '1j_DWedIEkI43SGTUqPtROQKBK3MXH6dmtyB_OfF66d8',
  '1Q35YyGILRxBJOxs7l6SxyjMxwL5xSIg7S6fKDNsMlU8',
  '1K5wALh6TZ1azMVJXVaZoVPZa_tP-ZoFyWMV8CZx6hLE',
  '1zqr1fPjRyZrLCEvxXxy8k9djUwGm27lkAtAnkZetuik',
  '1jnGBZ9JeurYifoT0FvlSATsDeIIF4lrYzERH6DD6Ouo',
  '1sMidCTT57ZjIIM0jE0QXVPi5aEL-QITJeyXQoTQ6Lsw',
  '1ryZ8YD2zM7kKb6SbOBT4wWYHcoIolHNJT7Ujtw1Kuv4',
  '14Z0laRq0z6I5hLQIYOYX8oMyqYZ5RmnWKqfL7DzwFmI',
  '1R3soASLzsLMKYck6uCWwdlOznDVWqRt_r_7iG1uuDfg',
];

/** GET с ручным следованием редиректам (до 5 хопов), возвращает {status, headers, body} последнего ответа */
function get(url, hops = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'sheets-search-skill/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops > 0) {
        const next = new URL(res.headers.location, url).toString();
        const firstHeaders = res.headers;
        res.resume();
        get(next, hops - 1).then((finalRes) => {
          // content-disposition обычно приходит уже на редиректе — сохраняем, если на финальном ответе его нет
          if (!finalRes.headers['content-disposition'] && firstHeaders['content-disposition']) {
            finalRes.headers['content-disposition'] = firstHeaders['content-disposition'];
          }
          resolve(finalRes);
        }, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} для ${url}`));
        res.resume();
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error(`Таймаут запроса к ${url}`)));
  });
}

/** Определяет gid единственной/активной вкладки публичного листа через /htmlview (без OAuth) */
async function discoverGid(id) {
  const { body } = await get(`https://docs.google.com/spreadsheets/d/${id}/htmlview`);
  const matches = [...body.matchAll(/gid=(\d+)/g)].map((m) => m[1]);
  const uniq = [...new Set(matches)];
  if (uniq.length === 0) {
    throw new Error(`Не удалось определить gid для ${id} — /htmlview не вернул ни одной вкладки`);
  }
  return uniq[0];
}

/** Разбирает "filename*=UTF-8''name%20-%20name.csv" в чистое человекочитаемое имя таблицы */
function parseTitleFromContentDisposition(cd) {
  if (!cd) return null;
  const m = cd.match(/filename\*=UTF-8''([^;]+)/);
  if (!m) return null;
  const raw = decodeURIComponent(m[1]).replace(/\.csv$/i, '');
  const sep = ' - ';
  const idx = raw.indexOf(sep);
  if (idx !== -1) {
    const a = raw.slice(0, idx);
    const b = raw.slice(idx + sep.length);
    if (a === b) return a;
  }
  return raw;
}

/** Загружает таблицу целиком: определяет gid, скачивает CSV, вытаскивает человекочитаемое имя */
async function fetchCsvSource(id) {
  const gid = await discoverGid(id);
  const { headers, body } = await get(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`);
  const title = parseTitleFromContentDisposition(headers['content-disposition']) || id;
  return { id, gid, title, csv: body };
}

/** RFC4180-совместимый CSV-парсер: кавычки, экранированные кавычки "", запятые и переносы строк внутри полей */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      // игнорируем — реальный конец строки обработает \n
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

function sheetUrl(id, gid) {
  return `https://docs.google.com/spreadsheets/d/${id}/edit?gid=${gid}`;
}

module.exports = { SOURCES, get, discoverGid, fetchCsvSource, parseCsv, sheetUrl };
