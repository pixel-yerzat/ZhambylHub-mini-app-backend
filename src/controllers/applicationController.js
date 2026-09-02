import { z } from 'zod';
import { ApplicationService } from '../services/applicationService.js';

const submitApplicationSchema = z.object({
  name: z.string().min(3).optional(),
  title: z.string().min(3).optional(),
  short_desc: z.string().min(10).optional(),
  description: z.string().min(10).optional(),
  category: z.string().min(2).default('AI & IT Solutions'),
  stage: z.string().optional().default('MVP / Prototype'),
  tag: z.string().optional().default('Startup'),
  target_audience: z.string().optional(),
  unique_value_prop: z.string().optional(),
  founder_name: z.string().optional(),
  founder_phone: z.string().optional(),
  founder_role: z.string().optional(),
  team_members: z.string().optional(),
  pdf_deck_url: z.string().optional(),
  pdf_deck_name: z.string().optional(),
  pdf_deck_size: z.string().optional(),
  demo_url: z.string().optional(),
  demo_link: z.string().optional(),
  presentation_link: z.string().optional(),
  logo_icon: z.string().optional(),
  event_id: z.string().optional(),
  event_title: z.string().optional(),
}).refine(
  (data) => (data.name || data.title) && (data.short_desc || data.description),
  {
    message: 'Необходимо указать название (name / title) и описание (short_desc / description) проекта',
  }
);

export class ApplicationController {
  /**
   * POST /api/applications/submit
   * Submit and automatically verify project application
   */
  static async submit(req, res, next) {
    try {
      const parseResult = submitApplicationSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          error: 'Ошибка валидации полей заявки',
          details: parseResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      const telegramUser = req.telegramUser;
      if (!telegramUser || !telegramUser.id) {
        return res.status(401).json({
          success: false,
          error: 'Не удалось определить пользователя Telegram',
        });
      }

      const application = await ApplicationService.submitApplication(parseResult.data, telegramUser);

      return res.status(201).json({
        success: true,
        message:
          application.status === 'APPROVED'
            ? 'Заявка успешно одобрена и зарегистрирована!'
            : application.status === 'MANUAL_REVIEW'
            ? 'Заявка отправлена на ручную модерацию экспертов.'
            : 'Заявка отклонена в соответствии с правилами Хаба.',
        data: {
          id: application.id,
          title: application.title,
          status: application.status,
          similarity_score: application.similarity_score,
          rejection_reason: application.rejection_reason,
          matched_entity_title: application.matched_entity_title,
          ai_analysis: application.ai_analysis,
          created_at: application.created_at,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/applications/my
   * Get all submissions belonging to current user
   */
  static async getMyApplications(req, res, next) {
    try {
      const telegramId = req.telegramUser.id;
      const applications = await ApplicationService.getUserSubmissions(telegramId);

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
   * GET /api/applications/:id
   * Get application details by ID
   */
  static async getById(req, res, next) {
    try {
      const { id } = req.params;
      const application = await ApplicationService.getApplicationById(id);

      if (!application) {
        return res.status(404).json({
          success: false,
          error: 'Заявка не найдена',
        });
      }

      return res.json({
        success: true,
        data: application,
      });
    } catch (error) {
      next(error);
    }
  }
}
