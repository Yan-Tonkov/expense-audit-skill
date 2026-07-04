#!/usr/bin/env node
/**
 * expense-audit.js — аудит расходов из Google Sheets через gws CLI
 *
 * Использование:
 *   node scripts/expense-audit.js <SHEET_ID_или_URL>
 *
 * Требования:
 *   - gws CLI установлен и авторизован (gws auth login)
 *   - Node.js 18+
 *
 * Ожидаемая структура листа: колонки date | amount | description
 */

const { spawnSync } = require('child_process');
const path = require('path');

// ─── gws ──────────────────────────────────────────────────────────────────────

const GWS_BIN = path.join(
  process.env.APPDATA || '',
  'npm', 'node_modules', '@googleworkspace', 'cli', 'run.js'
);

function gws(args, params, body) {
  const argv = [...args];
  if (params) argv.push('--params', JSON.stringify(params));
  if (body)   argv.push('--json',   JSON.stringify(body));
  const result = spawnSync(process.execPath, [GWS_BIN, ...argv], { encoding: 'utf8' });
  if (result.status !== 0) {
    const msg = result.stdout || result.stderr || 'gws error';
    throw new Error(msg);
  }
  return result.stdout ? JSON.parse(result.stdout) : {};
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function extractSheetId(input) {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : input.trim();
}

const MONTH_NAMES = {
  '01':'Январь','02':'Февраль','03':'Март','04':'Апрель',
  '05':'Май','06':'Июнь','07':'Июль','08':'Август',
  '09':'Сентябрь','10':'Октябрь','11':'Ноябрь','12':'Декабрь',
};

function monthLabel(m) {
  return `${MONTH_NAMES[m.slice(5)]} ${m.slice(0, 4)}`;
}

function categorize(desc) {
  if (/^(Зарплата|Аванс)\s/.test(desc))                              return 'ФОТ';
  if (/^Бонус/.test(desc))                                           return 'Бонусы';
  if (/^Компенсация за неиспользованный/.test(desc))                 return 'Компенсации';
  if (/Google Ads|Google Display|Facebook Ads|LinkedIn Ads|СЕО-Мастер|vc\.ru/.test(desc)) return 'Маркетинг';
  if (/HubSpot|Pipedrive|Salesforce/.test(desc))                     return 'CRM/Email';
  if (/КодЛаб|ДевХаус|ИП Николаев/.test(desc))                      return 'Разработка';
  if (/AWS/.test(desc))                                              return 'Инфраструктура';
  if (/ИП Орлова|Дизайн-студия|Figma|Анимация|ИП Фёдоров|Монтаж|Обработка видео|Съёмка|Тексты|Запись вебинара/.test(desc)) return 'Дизайн и контент';
  if (/Slack|Zoom|Notion|Miro|Metabase/.test(desc))                  return 'SaaS';
  if (/CloudPayments|Тинькофф|ЮKassa/.test(desc))                   return 'Эквайринг';
  if (/Аренда офиса|Коммунальные|Канцелярия/.test(desc))            return 'Офис';
  if (/Вебинар|митап|Спонсорство|конференц/.test(desc))             return 'Мероприятия';
  if (/Консалт/.test(desc))                                          return 'Консалтинг';
  return 'Прочее';
}

// ─── main ─────────────────────────────────────────────────────────────────────

const arg = process.argv[2];
if (!arg) { console.error('Usage: node expense-audit.js <SHEET_ID_or_URL>'); process.exit(1); }

const SHEET_ID = extractSheetId(arg);
const TAB_NAME = 'Аудит расходов';

console.log(`\nАудит таблицы: ${SHEET_ID}`);

// 1. Загрузить данные
console.log('→ Загружаю транзакции...');
const raw = gws(['sheets', 'spreadsheets', 'values', 'get'],
  { spreadsheetId: SHEET_ID, range: 'A1:C5000' });
const rows = (raw.values || []).slice(1).filter(r => r[0] && r[1]);
console.log(`  Загружено строк: ${rows.length}`);

if (rows.length === 0) { console.error('Нет данных.'); process.exit(1); }

// 2. Агрегация
const byMonth      = {};
const byCatMonth   = {};
const dismissalDate = {};
const paymentsAfterDismissal = [];

// Сначала находим дату увольнения для каждого сотрудника
for (const [date, , desc] of rows) {
  if (!desc || !desc.startsWith('Компенсация за неиспользованный')) continue;
  const name = desc.split(' — ')[1] || '';
  if (!dismissalDate[name] || date > dismissalDate[name]) dismissalDate[name] = date;
}

// Основная агрегация
for (const [date, amount, desc] of rows) {
  if (!desc) continue;
  const m   = date.slice(0, 7);
  const amt = Number(amount);
  const cat = categorize(desc);

  byMonth[m] = (byMonth[m] || 0) + amt;

  if (!byCatMonth[cat]) byCatMonth[cat] = {};
  byCatMonth[cat][m] = (byCatMonth[cat][m] || 0) + amt;

  // Ghost payroll: аванс или зарплата ПОСЛЕ увольнения
  if (desc.startsWith('Зарплата') || desc.startsWith('Аванс')) {
    const name = desc.split(' — ')[1] || '';
    if (name && dismissalDate[name] && date > dismissalDate[name]) {
      paymentsAfterDismissal.push({ date, amount: amt, desc, dismissalDate: dismissalDate[name] });
    }
  }
}

const months    = Object.keys(byMonth).sort();
const grandTotal = Object.values(byMonth).reduce((s, v) => s + v, 0);

// Ghost payroll по сотрудникам
const ghostByEmployee = {};
for (const p of paymentsAfterDismissal) {
  const name = p.desc.split(' — ')[1] || p.desc;
  if (!ghostByEmployee[name]) ghostByEmployee[name] = { dismissed: p.dismissalDate, total: 0, count: 0 };
  ghostByEmployee[name].total += p.amount;
  ghostByEmployee[name].count++;
}
const ghostTotal = paymentsAfterDismissal.reduce((s, p) => s + p.amount, 0);

// Ghost payroll по месяцам
const ghostByMonth = {};
for (const p of paymentsAfterDismissal) {
  const m = p.date.slice(0, 7);
  ghostByMonth[m] = (ghostByMonth[m] || 0) + p.amount;
}

// Категории отсортированные по сумме
const catSums = {};
for (const [cat, mv] of Object.entries(byCatMonth))
  catSums[cat] = Object.values(mv).reduce((s, v) => s + v, 0);
const sortedCats = Object.keys(catSums).sort((a, b) => catSums[b] - catSums[a]);

// 3. Вывод в консоль
console.log(`\n  Период:        ${monthLabel(months[0])} — ${monthLabel(months[months.length - 1])}`);
console.log(`  Всего строк:   ${rows.length}`);
console.log(`  Общая сумма:   ${grandTotal.toLocaleString('ru-RU')} ₽`);
console.log(`  Категорий:     ${sortedCats.length}`);
console.log(`  Ghost payroll: ${Object.keys(ghostByEmployee).length} чел., ${ghostTotal.toLocaleString('ru-RU')} ₽`);

// 4. Строим листы отчёта
const sheet = [];

// ── Раздел 1: Шапка ─────────────────────────────────────────────────────────
sheet.push([`АУДИТ РАСХОДОВ — ${new Date().toLocaleDateString('ru-RU')}`]);
sheet.push([`Таблица: ${SHEET_ID}`]);
sheet.push([`Период: ${monthLabel(months[0])} — ${monthLabel(months[months.length - 1])}`]);
sheet.push([`Строк: ${rows.length}`, '', `Сумма: ${grandTotal.toLocaleString('ru-RU')} ₽`]);
sheet.push([]);

// ── Раздел 2: Итоги по месяцам ───────────────────────────────────────────────
sheet.push(['РАЗДЕЛ 1. ИТОГИ ПО МЕСЯЦАМ']);
sheet.push(['Месяц', 'Сумма (₽)', 'Изменение', 'Ghost payroll (₽)', 'Ghost %']);
let prevM = 0;
for (const m of months) {
  const v     = byMonth[m];
  const delta = prevM ? `${((v - prevM) / prevM * 100).toFixed(1)}%` : '—';
  const ghost = ghostByMonth[m] || 0;
  const ghostPct = ghost ? `${((ghost / v) * 100).toFixed(1)}%` : '—';
  sheet.push([monthLabel(m), v, delta, ghost || '', ghostPct]);
  prevM = v;
}
sheet.push([]);

// ── Раздел 3: Категории ──────────────────────────────────────────────────────
sheet.push(['РАЗДЕЛ 2. РАСХОДЫ ПО КАТЕГОРИЯМ']);
sheet.push(['Категория', ...months.map(monthLabel), 'ИТОГО', 'Доля', 'Янв→Посл.']);
for (const cat of sortedCats) {
  const mv    = byCatMonth[cat];
  const vals  = months.map(m => mv[m] || 0);
  const total = catSums[cat];
  const share = `${((total / grandTotal) * 100).toFixed(1)}%`;
  const first = mv[months[0]] || 0;
  const last  = mv[months[months.length - 1]] || 0;
  const growth = first > 0
    ? `${((last - first) / first * 100).toFixed(0)}%`
    : (last > 0 ? '+∞' : '—');
  sheet.push([cat, ...vals, total, share, growth]);
}
sheet.push(['ИТОГО', ...months.map(m => byMonth[m]), grandTotal, '100%', '']);
sheet.push([]);

// ── Раздел 4: Ghost Payroll ───────────────────────────────────────────────────
sheet.push(['РАЗДЕЛ 3. АНОМАЛИИ — GHOST PAYROLL']);
if (Object.keys(ghostByEmployee).length === 0) {
  sheet.push(['Аномалий не обнаружено.']);
} else {
  sheet.push([
    `Обнаружено ${Object.keys(ghostByEmployee).length} сотрудников, получавших зарплату/аванс после даты увольнения.`,
    '', `Итого: ${ghostTotal.toLocaleString('ru-RU')} ₽`
  ]);
  sheet.push([]);
  sheet.push(['Сотрудник', 'Дата увольнения', 'Выплат после ув.', 'Сумма (₽)', 'Статус']);
  for (const [name, info] of Object.entries(ghostByEmployee).sort((a, b) => b[1].total - a[1].total)) {
    sheet.push([name, info.dismissed, info.count, info.total, '⚠ Требует проверки']);
  }
  sheet.push([]);
  sheet.push(['ДЕТАЛИЗАЦИЯ ПОДОЗРИТЕЛЬНЫХ ТРАНЗАКЦИЙ']);
  sheet.push(['Дата', 'Описание', 'Сумма (₽)', 'Дата увольнения', 'Дней после увольнения']);
  for (const p of paymentsAfterDismissal.sort((a, b) => a.date.localeCompare(b.date))) {
    const days = Math.round((new Date(p.date) - new Date(p.dismissalDate)) / 86400000);
    sheet.push([p.date, p.desc, p.amount, p.dismissalDate, days]);
  }
}
sheet.push([]);

// ── Раздел 5: Выводы ─────────────────────────────────────────────────────────
sheet.push(['РАЗДЕЛ 4. КЛЮЧЕВЫЕ ВЫВОДЫ']);
const topCat = sortedCats[0];
const topShare = ((catSums[topCat] / grandTotal) * 100).toFixed(0);
sheet.push([`1. Общие расходы за период: ${grandTotal.toLocaleString('ru-RU')} ₽ (${rows.length} транзакций)`]);
sheet.push([`2. Крупнейшая статья: ${topCat} — ${catSums[topCat].toLocaleString('ru-RU')} ₽ (${topShare}% бюджета)`]);
if (ghostTotal > 0) {
  sheet.push([`3. ⚠ Ghost payroll: ${ghostTotal.toLocaleString('ru-RU')} ₽ (${Object.keys(ghostByEmployee).length} чел.) — выплаты уволенным сотрудникам после даты расторжения договора`]);
  sheet.push([`4. Ghost payroll составляет ${((ghostTotal / grandTotal) * 100).toFixed(1)}% от общих расходов`]);
} else {
  sheet.push(['3. Ghost payroll не обнаружен.']);
}

// 5. Записать в таблицу
console.log(`\n→ Создаю лист "${TAB_NAME}"...`);
const meta = gws(['sheets', 'spreadsheets', 'get'], { spreadsheetId: SHEET_ID });
const existing = meta.sheets.find(s => s.properties.title === TAB_NAME);

if (existing) {
  gws(['sheets', 'spreadsheets', 'values', 'clear'],
    { spreadsheetId: SHEET_ID, range: `${TAB_NAME}!A1:Z2000` });
} else {
  gws(['sheets', 'spreadsheets', 'batchUpdate'],
    { spreadsheetId: SHEET_ID },
    { requests: [{ addSheet: { properties: { title: TAB_NAME } } }] });
}

gws(['sheets', 'spreadsheets', 'values', 'update'],
  { spreadsheetId: SHEET_ID, range: `${TAB_NAME}!A1`, valueInputOption: 'USER_ENTERED' },
  { values: sheet });

console.log(`✓ Отчёт записан в лист "${TAB_NAME}"`);
console.log(`\nОткрыть: https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit\n`);
