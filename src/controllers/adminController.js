import { z } from 'zod';
import { ApplicationService } from '../services/applicationService.js';
import { config } from '../config/env.js';

const updateStatusSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED_DUPLICATE', 'REJECTED_PAST_WINNER', 'MANUAL_REVIEW', 'approved', 'rejected_duplicate', 'rejected_past_winner', 'manual_review']),
  notes: z.string().optional(),
});

function checkAdminAuthorization(telegramUser) {
  if (!config.telegram.adminChatId) {
    return { authorized: false, reason: 'Функционал администратора недоступен: TELEGRAM_ADMIN_CHAT_ID не настроен.' };
  }
  const userId = Number(telegramUser?.id);
  if (!userId || userId !== Number(config.telegram.adminChatId)) {
    return { authorized: false, reason: 'Доступ запрещен: требуются права администратора Hub.' };
  }
  return { authorized: true };
}

export class AdminController {
  /**
   * GET /api/admin/applications
   * List all applications with optional status/category filtering
   */
  static async listApplications(req, res, next) {
    try {
      const auth = checkAdminAuthorization(req.telegramUser);
      if (!auth.authorized) {
        return res.status(403).json({
          success: false,
          error: auth.reason,
        });
      }

      const { status, category } = req.query;
      const applications = await ApplicationService.listApplications({ status, category });

      return res.json({
        success: true,
        count: applications.length,
        data: applications,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/admin/applications/:id/status
   * Manually override project status
   */
  static async updateStatus(req, res, next) {
    try {
      const auth = checkAdminAuthorization(req.telegramUser);
      if (!auth.authorized) {
        return res.status(403).json({
          success: false,
          error: auth.reason,
        });
      }
      const { id } = req.params;
      const parseResult = updateStatusSchema.safeParse(req.body);

      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          error: 'Неверные данные статуса',
          details: parseResult.error.errors,
        });
      }

      const adminTelegramId = req.telegramUser?.id || 0;
      const updated = await ApplicationService.updateApplicationStatus(
        id,
        parseResult.data.status,
        adminTelegramId,
        parseResult.data.notes || ''
      );

      if (!updated) {
        return res.status(404).json({ success: false, error: 'Заявка не найдена' });
      }

      return res.json({
        success: true,
        message: `Статус заявки изменен на ${parseResult.data.status}`,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }
}
