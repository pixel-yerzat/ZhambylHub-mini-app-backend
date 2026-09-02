import { Telegraf, Markup } from 'telegraf';
import { config } from '../config/env.js';
import { setBotInstance } from '../services/telegramBotService.js';
import { ApplicationService } from '../services/applicationService.js';

export function setupTelegramBot() {
  if (!config.telegram.botToken) {
    console.warn('[TelegramBot] TELEGRAM_BOT_TOKEN is not provided. Bot will not be started.');
    return null;
  }

  const bot = new Telegraf(config.telegram.botToken);
  setBotInstance(bot);

  // 1. /start command
  bot.start(async (ctx) => {
    const firstName = ctx.from.first_name || 'Участник';
    const welcomeText =
      `👋 <b>Привет, ${firstName}!</b>\n\n` +
      `Добро пожаловать в <b>Hub Project Verification Platform</b> 🚀\n\n` +
      `Здесь вы можете подавать свои проекты на хакатоны и мероприятия Хаба.\n\n` +
      `🛡 <b>Как работает автоматическая проверка:</b>\n` +
      `• Каждый проект проверяется <b>Google Gemini AI</b> на оригинальность.\n` +
      `• <b>Можно</b> подавать несколько <i>разных</i> проектов от одного автора.\n` +
      `• <b>Нельзя</b> подавать дубликаты одного и того же проекта.\n` +
      `• <b>Нельзя</b> подавать проекты, которые уже побеждали на прошлых мероприятиях Хаба.\n\n` +
      `Нажмите кнопку ниже, чтобы открыть Mini App и подать заявку:`;

    const buttons = [];
    if (config.telegram.webAppUrl) {
      buttons.push([Markup.button.webApp('🚀 Открыть Hub Mini App', config.telegram.webAppUrl)]);
    }
    buttons.push([Markup.button.callback('📋 Мои заявки', 'cmd_my_projects')]);

    await ctx.replyWithHTML(welcomeText, Markup.inlineKeyboard(buttons));
  });

  // 2. /help command
  bot.help(async (ctx) => {
    const helpText =
      `ℹ️ <b>Правила и критерии верификации проектов:</b>\n\n` +
      `1️⃣ <b>Уникальность:</b> Проект должен решать актуальную проблему оригинальным способом.\n` +
      `2️⃣ <b>Мульти-подача:</b> Вы можете подать 2 или 3 проекта, если это разные продукты.\n` +
      `3️⃣ <b>База победителей:</b> Система сверяет заявку с реестром всех победителей за прошлые годы.\n` +
      `4️⃣ <b>Спорные случаи:</b> Если ИИ сомневается, заявка передается на ручную проверку жюри.`;

    await ctx.replyWithHTML(helpText);
  });

  // 3. /my_projects command
  bot.command('my_projects', async (ctx) => {
    await handleMyProjects(ctx);
  });

  bot.action('cmd_my_projects', async (ctx) => {
    await ctx.answerCbQuery();
    await handleMyProjects(ctx);
  });

  async function handleMyProjects(ctx) {
    const telegramId = ctx.from.id;
    const applications = await ApplicationService.getUserSubmissions(telegramId);

    if (applications.length === 0) {
      return ctx.replyWithHTML(
        '📭 У вас пока нет поданных заявок.\nОткройте Mini App, чтобы зарегистрировать свой первый проект!'
      );
    }

    let text = `📋 <b>Ваши поданные проекты (${applications.length}):</b>\n\n`;

    applications.forEach((app, idx) => {
      let statusIcon = '⏳';
      let statusLabel = 'На проверке';

      if (app.status === 'APPROVED') {
        statusIcon = '✅';
        statusLabel = 'Одобрен';
      } else if (app.status === 'REJECTED_DUPLICATE') {
        statusIcon = '⚠️';
        statusLabel = 'Отклонен (Дубликат)';
      } else if (app.status === 'REJECTED_PAST_WINNER') {
        statusIcon = '⛔️';
        statusLabel = 'Отклонен (Победитель прошлого хакатона)';
      } else if (app.status === 'MANUAL_REVIEW') {
        statusIcon = '🔍';
        statusLabel = 'На ручном рассмотрении жюри';
      }

      text += `${idx + 1}. ${statusIcon} <b>${app.title}</b>\n`;
      text += `   🏷 <i>Категория:</i> ${app.category}\n`;
      text += `   📊 <i>Статус:</i> ${statusLabel}\n`;
      if (app.rejection_reason) {
        text += `   ❌ <i>Причина:</i> ${app.rejection_reason}\n`;
      }
      text += `\n`;
    });

    await ctx.replyWithHTML(text);
  }

  // 4. Admin Inline Actions: Approve
  bot.action(/^admin_approve:(.+)$/, async (ctx) => {
    const applicationId = ctx.match[1];
    const adminUser = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;

    try {
      const updated = await ApplicationService.updateApplicationStatus(
        applicationId,
        'APPROVED',
        ctx.from.id,
        `Одобрено вручную админом ${adminUser}`
      );

      await ctx.answerCbQuery('Заявка успешно одобрена!');
      await ctx.editMessageText(
        `${ctx.callbackQuery.message.text}\n\n✅ <b>РЕШЕНИЕ: ОДОБРЕНО админом ${adminUser}</b>`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[Bot Action Approve Error]', err);
      await ctx.answerCbQuery('Ошибка при одобрении заявки: ' + err.message);
    }
  });

  // 5. Admin Inline Actions: Reject
  bot.action(/^admin_reject:(.+)$/, async (ctx) => {
    const applicationId = ctx.match[1];
    const adminUser = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;

    try {
      const updated = await ApplicationService.updateApplicationStatus(
        applicationId,
        'REJECTED_DUPLICATE',
        ctx.from.id,
        `Отклонено вручную админом ${adminUser}`
      );

      await ctx.answerCbQuery('Заявка отклонена.');
      await ctx.editMessageText(
        `${ctx.callbackQuery.message.text}\n\n❌ <b>РЕШЕНИЕ: ОТКЛОНЕНО админом ${adminUser}</b>`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[Bot Action Reject Error]', err);
      await ctx.answerCbQuery('Ошибка при отклонении заявки: ' + err.message);
    }
  });

  // Launch bot gracefully
  bot.launch()
    .then(() => {
      console.log('🤖 Telegram Bot successfully started & listening for updates.');
    })
    .catch((err) => {
      console.error('⚠️ Failed to launch Telegram Bot polling:', err.message);
    });

  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  return bot;
}
