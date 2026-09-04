import { Telegraf, Markup } from 'telegraf';
import { config } from '../config/env.js';

let botInstance = null;

export function getBot() {
  if (!botInstance && config.telegram.botToken) {
    botInstance = new Telegraf(config.telegram.botToken);
  }
  return botInstance;
}

export function setBotInstance(instance) {
  botInstance = instance;
}

/**
 * Send verification result notification directly to the applicant's Telegram.
 *
 * @param {number|string} telegramId - Applicant's Telegram ID
 * @param {Object} application - Application object with verdict and details
 */
export async function sendApplicationStatusNotification(telegramId, application) {
  const bot = getBot();
  if (!bot || !telegramId) {
    console.log(`[TelegramBotService Mock] Notification for user ${telegramId}: Status = ${application.status}`);
    return;
  }

  try {
    let message = '';
    const title = application.title || application.name || 'Проект';
    const status = String(application.status || application.verdict || '').toUpperCase();

    switch (status) {
      case 'APPROVED':
        message = `✅ <b>Заявка одобрена!</b>\n\n` +
          `📌 <b>Проект:</b> <i>${title}</i>\n` +
          `🏷 <b>Категория:</b> ${application.category || 'AI & IT Solutions'}\n\n` +
          `🎉 Ваш проект успешно прошел автоматическую проверку на оригинальность и допущен к участию в Хабе!\n` +
          `Удачи на мероприятии! 🚀`;
        break;

      case 'REJECTED_DUPLICATE':
        message = `⚠️ <b>Заявка отклонена (Дубликат)</b>\n\n` +
          `📌 <b>Проект:</b> <i>${title}</i>\n\n` +
          `❌ <b>Причина:</b> ${application.rejection_reason || 'Вы уже подавали идентичный проект ранее.'}\n\n` +
          `💡 <i>Правило Хаба:</i> Один участник может подавать несколько проектов, но они должны быть разными по идее и реализации.`;
        break;

      case 'REJECTED_PAST_WINNER':
        message = `⛔️ <b>Заявка отклонена (Проект уже побеждал)</b>\n\n` +
          `📌 <b>Проект:</b> <i>${title}</i>\n\n` +
          `❌ <b>Причина:</b> ${application.rejection_reason || 'Данный проект совпадает с проектом-победителем прошлого мероприятия Хаба.'}\n\n` +
          `💡 <i>Правило Хаба:</i> Проекты, уже завоевавшие призовые места на предыдущих хакатонах Хаба, не могут участвовать повторно.`;
        break;

      case 'MANUAL_REVIEW':
        message = `⏳ <b>Заявка на рассмотрении жюри</b>\n\n` +
          `📌 <b>Проект:</b> <i>${title}</i>\n\n` +
          `🔍 Система отправила вашу заявку на ручную верификацию экспертной комиссии. Мы уведомим вас, как только решение будет принято.`;
        break;

      default:
        message = `ℹ️ <b>Статус заявки "${title}":</b> ${application.status || status}`;
    }

    const keyboard = config.telegram.webAppUrl
      ? Markup.inlineKeyboard([
          Markup.button.webApp('📱 Открыть Hub Mini App', config.telegram.webAppUrl),
        ])
      : undefined;

    await bot.telegram.sendMessage(telegramId, message, {
      parse_mode: 'HTML',
      reply_markup: keyboard?.reply_markup,
    });
  } catch (error) {
    console.error(`[TelegramBotService] Failed to send message to user ${telegramId}:`, error.message);
  }
}

/**
 * Send alert to Admin Chat when a project requires manual review or when an edge case occurs.
 *
 * @param {Object} application - Application details
 */
export async function sendAdminReviewAlert(application) {
  const bot = getBot();
  const adminChatId = config.telegram.adminChatId;

  if (!bot || !adminChatId) {
    console.log(`[TelegramBotService Admin Alert Mock] Application ${application.id} requires manual review.`);
    return;
  }

  try {
    const text = `🚨 <b>Внимание: Заявка требует ручной модерации!</b>\n\n` +
      `🆔 <b>ID:</b> <code>${application.id}</code>\n` +
      `👤 <b>Участник:</b> ${application.telegram_id}\n` +
      `📌 <b>Название:</b> <b>${application.title}</b>\n` +
      `🏷 <b>Категория:</b> ${application.category}\n` +
      `📊 <b>Схожесть:</b> ${application.similarity_score}%\n\n` +
      `📝 <b>Описание:</b>\n${application.description}\n\n` +
      `🔍 <b>Вердикт AI:</b> ${application.status}\n` +
      `💡 <b>Причина:</b> ${application.rejection_reason || application.ai_analysis?.detailed_analysis?.why_verdict || 'Пограничный случай'}`;

    const inlineKeyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Одобрить', `admin_approve:${application.id}`),
        Markup.button.callback('❌ Отклонить', `admin_reject:${application.id}`),
      ],
    ]);

    await bot.telegram.sendMessage(adminChatId, text, {
      parse_mode: 'HTML',
      reply_markup: inlineKeyboard.reply_markup,
    });
  } catch (error) {
    console.error('[TelegramBotService] Failed to send admin alert:', error.message);
  }
}
