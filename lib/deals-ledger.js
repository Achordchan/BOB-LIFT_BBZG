// 成交流水（dealsLedger）的周期过滤与聚合。
// 周期边界一律使用服务器本地时间；周一作为一周起点，与 targets 的 ISO 周口径一致。

const PERIODS = new Set(['daily', 'weekly', 'monthly', 'yearly', 'all']);

function normalizePeriod(input) {
  const period = String(input || 'all').trim().toLowerCase();
  return PERIODS.has(period) ? period : null;
}

function resolvePeriodRange(period, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (period) {
    case 'daily':
      return { start, end: now };
    case 'weekly': {
      // getDay(): 周日=0；ISO 周从周一开始
      const offset = (now.getDay() + 6) % 7;
      start.setDate(start.getDate() - offset);
      return { start, end: now };
    }
    case 'monthly':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
    case 'yearly':
      return { start: new Date(now.getFullYear(), 0, 1), end: now };
    case 'all':
    default:
      return null;
  }
}

function getLedgerEntries(data) {
  if (Array.isArray(data.dealsLedger) && data.dealsLedger.length) {
    return data.dealsLedger;
  }
  return Array.isArray(data.dealsHistory) ? data.dealsHistory : [];
}

function filterByRange(entries, range) {
  if (!range) return entries.filter(Boolean);
  return entries.filter((deal) => {
    if (!deal || !deal.timestamp) return false;
    const ts = new Date(deal.timestamp);
    return !Number.isNaN(ts.getTime()) && ts >= range.start && ts <= range.end;
  });
}

// 流水最早一条的时间；请求区间早于它说明该区间数据可能不完整（账本有 5000 条上限，且历史由 dealsHistory 迁移而来）
function ledgerCoverage(entries, range) {
  let earliest = null;
  entries.forEach((deal) => {
    if (!deal || !deal.timestamp) return;
    const ts = new Date(deal.timestamp);
    if (Number.isNaN(ts.getTime())) return;
    if (!earliest || ts < earliest) earliest = ts;
  });
  return {
    earliestTimestamp: earliest ? earliest.toISOString() : null,
    mayBeIncomplete: !!(earliest && (!range || range.start < earliest))
  };
}

function aggregateLeaderboard(data, entries) {
  const users = Array.isArray(data.users) ? data.users : [];
  const userTotals = {};
  users.forEach((user) => {
    userTotals[user.id] = {
      id: user.id,
      name: user.name,
      position: user.position,
      amount: 0
    };
  });

  entries.forEach((deal) => {
    if (!deal) return;
    let targetId = deal.userId && userTotals[deal.userId] ? deal.userId : null;
    if (!targetId) {
      const matchingUser = users.find((user) => user.name === deal.person);
      if (matchingUser) targetId = matchingUser.id;
    }
    if (targetId) {
      userTotals[targetId].amount += Number(deal.amount) || 0;
      return;
    }
    const tempId = `temp_${String(deal.person || 'unknown').replace(/\s+/g, '_')}`;
    if (!userTotals[tempId]) {
      userTotals[tempId] = {
        id: tempId,
        name: deal.person || '未知',
        position: '',
        amount: 0
      };
    }
    userTotals[tempId].amount += Number(deal.amount) || 0;
  });

  return Object.values(userTotals)
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

function aggregateStats(entries) {
  const byPlatform = new Map();
  const byPerson = new Map();
  const byDay = new Map();
  let totalAmount = 0;

  entries.forEach((deal) => {
    if (!deal) return;
    const amount = Number(deal.amount) || 0;
    totalAmount += amount;

    const platform = String(deal.platform || '未知');
    const platformRow = byPlatform.get(platform) || { platform, amount: 0, count: 0 };
    platformRow.amount += amount;
    platformRow.count += 1;
    byPlatform.set(platform, platformRow);

    const person = String(deal.person || '未知');
    const personRow = byPerson.get(person) || { person, amount: 0, count: 0 };
    personRow.amount += amount;
    personRow.count += 1;
    byPerson.set(person, personRow);

    if (deal.timestamp) {
      const ts = new Date(deal.timestamp);
      if (!Number.isNaN(ts.getTime())) {
        const y = ts.getFullYear();
        const m = String(ts.getMonth() + 1).padStart(2, '0');
        const d = String(ts.getDate()).padStart(2, '0');
        const day = `${y}-${m}-${d}`;
        const dayRow = byDay.get(day) || { day, amount: 0, count: 0 };
        dayRow.amount += amount;
        dayRow.count += 1;
        byDay.set(day, dayRow);
      }
    }
  });

  const byAmountDesc = (a, b) => b.amount - a.amount;
  return {
    totalAmount,
    dealCount: entries.length,
    byPlatform: Array.from(byPlatform.values()).sort(byAmountDesc),
    byPerson: Array.from(byPerson.values()).sort(byAmountDesc),
    byDay: Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day))
  };
}

function csvEscape(value) {
  let text = String(value == null ? '' : value);
  // 以 = + - @ 或制表符开头的值会被 Excel 当作公式执行；前置单引号中和。
  // person/platform 来自外部连接器输入，导出明确面向 Excel，必须防公式注入。
  if (/^[=+\-@\t]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function ledgerToCsv(entries) {
  const header = 'id,timestamp,person,platform,amount';
  const rows = entries.map((deal) => [
    csvEscape(deal && deal.id),
    csvEscape(deal && deal.timestamp),
    csvEscape(deal && deal.person),
    csvEscape(deal && deal.platform),
    csvEscape(Number(deal && deal.amount) || 0)
  ].join(','));
  // BOM 让 Excel 直接识别 UTF-8 中文
  return '\uFEFF' + [header, ...rows].join('\r\n') + '\r\n';
}

module.exports = {
  normalizePeriod,
  resolvePeriodRange,
  getLedgerEntries,
  filterByRange,
  ledgerCoverage,
  aggregateLeaderboard,
  aggregateStats,
  ledgerToCsv
};
