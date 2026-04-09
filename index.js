// =============================================
// TELEGRAM BANK BOT – Node.js версія (для Render/Replit)
// =============================================

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const express = require('express');

// ------------------ НАЛАШТУВАННЯ ------------------
const TOKEN = process.env.BOT_TOKEN || '8745503586:AAEn0eaeFNcebm9yAHGMhA6SjsucU8qkIK0';
const bot = new TelegramBot(TOKEN, { polling: true });

// Папка для збереження даних
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// Файли даних
const BALANCES_FILE = path.join(DATA_DIR, 'balances.json');
const TOP10_FILE    = path.join(DATA_DIR, 'top10.json');
const HISTORY_FILE  = path.join(DATA_DIR, 'history.json');
const WIN_FILE      = path.join(DATA_DIR, 'win.json');
const ADMINS_FILE   = path.join(DATA_DIR, 'admins.json');

// Початкові структури
let balances = [];     // { nick, debt, balance, total }
let top10    = [];     // { nick, debt, totalIn }
let history  = [];     // { date, from, to, amount }
let win      = [];     // для "Розыгрыш"
let admins   = ['@Sk1nny4', '@anet023'];

// Завантаження / збереження
function loadData() {
  try {
    if (fs.existsSync(BALANCES_FILE)) balances = JSON.parse(fs.readFileSync(BALANCES_FILE));
    if (fs.existsSync(TOP10_FILE))    top10    = JSON.parse(fs.readFileSync(TOP10_FILE));
    if (fs.existsSync(HISTORY_FILE))  history  = JSON.parse(fs.readFileSync(HISTORY_FILE));
    if (fs.existsSync(WIN_FILE))      win      = JSON.parse(fs.readFileSync(WIN_FILE));
    if (fs.existsSync(ADMINS_FILE))   admins   = JSON.parse(fs.readFileSync(ADMINS_FILE));
  } catch(e) { console.error('Помилка завантаження даних', e); }
}
function saveBalances() { fs.writeFileSync(BALANCES_FILE, JSON.stringify(balances, null, 2)); }
function saveTop10()     { fs.writeFileSync(TOP10_FILE,    JSON.stringify(top10, null, 2)); }
function saveHistory()   { fs.writeFileSync(HISTORY_FILE,  JSON.stringify(history, null, 2)); }
function saveWin()       { fs.writeFileSync(WIN_FILE,      JSON.stringify(win, null, 2)); }
function saveAdmins()    { fs.writeFileSync(ADMINS_FILE,   JSON.stringify(admins, null, 2)); }
function saveAll() {
  saveBalances();
  saveTop10();
  saveHistory();
  saveWin();
  saveAdmins();
}

loadData();

// Допоміжні функції
function findUser(nick) {
  nick = nick.toLowerCase().replace('@', '');
  return balances.find(u => u.nick === nick);
}
function findTop(nick) {
  nick = nick.toLowerCase().replace('@', '');
  return top10.find(t => t.nick === nick);
}
function ensureUser(nick) {
  nick = nick.toLowerCase().replace('@', '');
  let user = findUser(nick);
  if (!user) {
    user = { nick, debt: 0, balance: 0, total: 0 };
    balances.push(user);
    saveBalances();
  }
  return user;
}
function ensureTop(nick) {
  nick = nick.toLowerCase().replace('@', '');
  let top = findTop(nick);
  if (!top) {
    top = { nick, debt: 0, totalIn: 0 };
    top10.push(top);
    saveTop10();
  }
  return top;
}
function isAdmin(username) {
  if (!username) return false;
  const clean = username.startsWith('@') ? username : `@${username}`;
  return admins.some(a => a.toLowerCase() === clean.toLowerCase());
}

function send(chatId, text) {
  bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
}

// ------------------ ОСНОВНІ КОМАНДИ ------------------
// Внесення коштів
function handleDeposit(chatId, senderRaw, targetRaw, amount) {
  if (isNaN(amount) || amount <= 0) {
    send(chatId, '❌ Некоректна сума.');
    return;
  }
  const cleanSender = senderRaw.replace('@', '').toLowerCase();
  const cleanTarget = targetRaw.replace('@', '').toLowerCase();

  const top = ensureTop(cleanTarget);
  const user = ensureUser(cleanSender);

  let newDebt = user.debt + amount;
  let amountToBalance = 0;
  if (newDebt > 0) {
    amountToBalance = newDebt;
    newDebt = 0;
  }
  const newBalance = user.balance + amountToBalance;
  const newTotal   = user.total + amount;

  user.debt = newDebt;
  user.balance = newBalance;
  user.total = newTotal;
  saveBalances();

  top.debt += amount;
  top.totalIn += amount;
  saveTop10();

  history.push({
    date: new Date().toISOString(),
    from: senderRaw,
    to: `@${cleanTarget}`,
    amount: amount
  });
  saveHistory();

  let reply = `✅ <b>Операція виконана!</b>\n`;
  reply += `👤 Від: ${senderRaw}                                               🎯 Для: @${cleanTarget}\n`;
  reply += `📊 Долг: ${newDebt}\n📈 В банке: +${amountToBalance}\n💎 Всього: ${newTotal}\n————————————\n`;
  if (top.debt >= 0) {
    reply += `🏆 <b>ТОП @${cleanTarget} задоволений!</b>\n💰 Банк працює в плюс!\n📊 Баланс ТОПу: ${top.debt}\n`;
  } else {
    reply += `🏆 <b>ТОП @${cleanTarget}:</b>\n📉 Борг ТОПу: ${top.debt}\n`;
  }
  reply += `📥 Всього закинуто ТОПу: ${top.totalIn}`;
  send(chatId, reply);
}

// Статистика
function showTop(chatId) {
  const sorted = [...balances].sort((a,b) => b.balance - a.balance);
  let msg = '🏆 <b>ТОП по балансу</b>\n\n';
  for (let i=0; i<Math.min(10, sorted.length); i++) {
    msg += `${i+1}. @${sorted[i].nick} — ${sorted[i].balance} грн\n`;
  }
  send(chatId, msg || 'Поки що немає даних');
}

function userStats(chatId, text) {
  let target = text.split(' ')[1] || '';
  if (!target) return send(chatId, '❌ Вкажіть нік: /ustats @нік');
  const user = findUser(target);
  if (!user) return send(chatId, `❌ Користувача @${target} не знайдено.`);
  send(chatId, `👤 <b>@${user.nick}</b>\n📊 Долг: ${user.debt}\n💰 Баланс: ${user.balance}\n💎 Всього внесено: ${user.total}`);
}

function statsTop(chatId) {
  const sorted = [...top10].sort((a,b) => b.totalIn - a.totalIn);
  let msg = '📊 <b>ТОП-10 по внесенням</b>\n\n';
  for (let i=0; i<Math.min(10, sorted.length); i++) {
    msg += `${i+1}. @${sorted[i].nick} — ${sorted[i].totalIn} грн\n`;
  }
  send(chatId, msg || 'Немає даних');
}

function utop(chatId) {
  const total = balances.reduce((sum, u) => sum + u.balance, 0);
  send(chatId, `👥 Всього користувачів: ${balances.length}\n💰 Загальний баланс: ${total} грн`);
}

function allStats(chatId) {
  const totalBalance = balances.reduce((s,u) => s + u.balance, 0);
  const totalDebt    = balances.reduce((s,u) => s + u.debt, 0);
  send(chatId, `📈 <b>Загальна статистика</b>\n👥 Користувачів: ${balances.length}\n💰 Баланс: ${totalBalance} грн\n📉 Борг: ${totalDebt} грн`);
}

// Розіграші
function randomTop(chatId, text) {
  let prize = text.replace('/rtop', '').trim();
  if (!prize) prize = '🎁 Приз';
  const candidates = top10.filter(t => t.totalIn > 0);
  if (!candidates.length) return send(chatId, '❌ Немає ТОПів із внесками.');
  const winner = candidates[Math.floor(Math.random() * candidates.length)];
  send(chatId, `🎉 Переможець: @${winner.nick}\n🎁 ${prize}`);
}
function randomUser(chatId, text) {
  let prize = text.replace('/ruser', '').trim();
  if (!prize) prize = '🎁 Приз';
  const candidates = balances.filter(u => u.total > 0);
  if (!candidates.length) return send(chatId, '❌ Немає користувачів з балансом.');
  const winner = candidates[Math.floor(Math.random() * candidates.length)];
  send(chatId, `🎉 Переможець: @${winner.nick}\n🎁 ${prize}`);
}

// Зміна боргу/балансу
function changeTopDebt(chatId, text) {
  const parts = text.split(' ');
  if (parts.length < 3) return send(chatId, '❌ Формат: /bal10 @нік сума');
  const target = parts[1].replace('@', '').toLowerCase();
  const delta = parseInt(parts[2]);
  if (isNaN(delta)) return send(chatId, '❌ Сума має бути числом.');
  const top = findTop(target);
  if (!top) return send(chatId, `❌ ТОП @${target} не знайдено.`);
  top.debt += delta;
  saveTop10();
  send(chatId, `✅ Борг ТОПу @${target} змінено. Новий: ${top.debt}`);
}
function changeBalanceDebt(chatId, text) {
  const parts = text.split(' ');
  if (parts.length < 3) return send(chatId, '❌ Формат: /ubal @нік сума');
  const target = parts[1].replace('@', '').toLowerCase();
  const delta = parseInt(parts[2]);
  if (isNaN(delta)) return send(chatId, '❌ Сума має бути числом.');
  const user = findUser(target);
  if (!user) return send(chatId, `❌ Користувача @${target} не знайдено.`);
  user.balance += delta;
  saveBalances();
  send(chatId, `✅ Баланс @${target} змінено. Новий: ${user.balance}`);
}

// Очищення
function clearTop10(chatId) {
  top10 = [];
  saveTop10();
  send(chatId, '✅ Таблицю Топ10 очищено.');
}
function clearUserBalance(chatId, text) {
  const target = text.split(' ')[1]?.replace('@', '').toLowerCase();
  if (!target) return send(chatId, '❌ Вкажіть нік: /cl @нік');
  const user = findUser(target);
  if (!user) return send(chatId, `❌ Користувача @${target} не знайдено.`);
  user.debt = 0;
  user.balance = 0;
  saveBalances();
  send(chatId, `✅ Баланс та борг @${target} обнулено.`);
}
function clearAllBalances(chatId) {
  for (let u of balances) {
    u.debt = 0;
    u.balance = 0;
  }
  saveBalances();
  send(chatId, '✅ Усі баланси та борги обнулено.');
}
function clearAllBalancesFull(chatId) {
  balances = [];
  saveBalances();
  send(chatId, '✅ Таблицю Баланс повністю очищено.');
}
function clearHistory(chatId) {
  history = [];
  saveHistory();
  send(chatId, '✅ Історію очищено.');
}
function clearWinSheet(chatId) {
  win = [];
  saveWin();
  send(chatId, '✅ Аркуш Розыгрыш очищено.');
}

// Адміни
function addAdmin(chatId, text) {
  const newAdmin = text.split(' ')[1];
  if (!newAdmin) return send(chatId, '❌ Формат: /addadmin @нік');
  if (admins.includes(newAdmin)) return send(chatId, '❌ Вже є адміном.');
  admins.push(newAdmin);
  saveAdmins();
  send(chatId, `✅ ${newAdmin} додано до адмінів.`);
}
function delAdmin(chatId, text) {
  const admin = text.split(' ')[1];
  if (!admin) return send(chatId, '❌ Формат: /deladmin @нік');
  const idx = admins.indexOf(admin);
  if (idx === -1) return send(chatId, '❌ Не знайдено.');
  admins.splice(idx, 1);
  saveAdmins();
  send(chatId, `✅ ${admin} видалено з адмінів.`);
}
function listAdmins(chatId) {
  send(chatId, `👑 Адміни: ${admins.join(', ')}`);
}

// Бекап (надсилає JSON-файл)
function createBackup(chatId, type) {
  let data, filename;
  if (type === 'balance') {
    data = balances;
    filename = 'balances_backup.json';
  } else if (type === 'top10') {
    data = top10;
    filename = 'top10_backup.json';
  } else {
    return;
  }
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  send(chatId, `⏳ Створюю бекап ${type}...`);
  bot.sendDocument(chatId, filePath, { caption: `📁 Бекап ${type}` })
    .catch(e => send(chatId, `❌ Помилка відправки: ${e.message}`));
}

// Меню
function sendHelpMenu(chatId, sender) {
  send(chatId, `👋 Привет, ${sender}!\n\n` +
    `💰 <b>Внесення коштів:</b>\n` +
    `<code>Банк +сума @нік</code>\n` +
    `Приклад: Банк +500 @bul\n\n` +
    `/ustats @нік — твоя статистика\n` +
    `/stats10 — ТОП-10 по внесенням\n\n` +
    `🔧 Адмін-панель: /ahelp`);
}
function sendAdminMenu(chatId) {
  send(chatId, `🔧 <b>АДМИН ПАНЕЛЬ</b>\n\n` +
    `👑 Управление админами:\n• /addadmin @нік\n• /deladmin @нік\n• /admins\n\n` +
    `📊 Статистика:\n• /top\n• /stats10\n• /allstats\n\n` +
    `🎁 Розыгрыши:\n• /rtop [Приз]\n• /ruser [Приз]\n\n` +
    `💰 Изменение долга:\n• /bal10 @нік сума\n• /ubal @нік сума\n\n` +
    `🧹 Очистка:\n• /ctop10\n• /cl @нік\n• /cl\n• /allcl\n• /clh\n• /clwin\n\n` +
    `💾 Бэкап:\n• /backup\n• /backup10`);
}

// ------------------ ОБРОБНИК ПОВІДОМЛЕНЬ ------------------
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text ? msg.text.trim() : '';
  const user = msg.from;
  const username = user.username ? `@${user.username}` : null;
  const sender = username || user.first_name || 'Користувач';
  const admin = isAdmin(username);

  if (!text) return;

  // Команди для всіх
  if (text === '/help') return sendHelpMenu(chatId, sender);
  if (text.startsWith('/ustats')) return userStats(chatId, text);

  const bankMatch = text.match(/Банк\s*\+\s*(\d+)\s*@?([\w\._]+)/i);
  if (bankMatch) {
    const amount = parseInt(bankMatch[1]);
    const target = bankMatch[2];
    return handleDeposit(chatId, sender, target, amount);
  }

  // Перевірка адміна
  if (!admin) {
    // Не адмін – не знає інших команд
    if (!text.startsWith('/')) return;
    return send(chatId, '❌ Эта команда доступна только администраторам.');
  }

  // Адмін-команди
  if (text === '/ahelp') return sendAdminMenu(chatId);
  if (text === '/admins') return listAdmins(chatId);
  if (text === '/top') return showTop(chatId);
  if (text.startsWith('/addadmin')) return addAdmin(chatId, text);
  if (text.startsWith('/deladmin')) return delAdmin(chatId, text);
  if (text.startsWith('/stats10')) return statsTop(chatId);
  if (text === '/allstats') return allStats(chatId);
  if (text === '/utop') return utop(chatId);
  if (text.startsWith('/rtop')) return randomTop(chatId, text);
  if (text.startsWith('/ruser')) return randomUser(chatId, text);
  if (text.startsWith('/bal10')) return changeTopDebt(chatId, text);
  if (text.startsWith('/ubal')) return changeBalanceDebt(chatId, text);
  if (text === '/ctop10') return clearTop10(chatId);
  if (text.startsWith('/cl ')) return clearUserBalance(chatId, text);
  if (text === '/cl') return clearAllBalances(chatId);
  if (text === '/allcl') return clearAllBalancesFull(chatId);
  if (text === '/clh') return clearHistory(chatId);
  if (text === '/clwin') return clearWinSheet(chatId);
  if (text === '/backup') return createBackup(chatId, 'balance');
  if (text === '/backup10') return createBackup(chatId, 'top10');

  send(chatId, '❌ Неизвестная команда. Напишите /ahelp');
});

// ------------------ ВЕБ-СЕРВЕР ДЛЯ ПІНГУ (keep-alive) ------------------
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/ping', (req, res) => res.send('OK'));
app.listen(PORT, () => console.log(`Keep-alive server running on port ${PORT}`));

console.log('🤖 Бот запущено в режимі polling...');
