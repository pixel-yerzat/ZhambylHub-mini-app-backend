import { z } from 'zod';
import { ApplicationService } from '../services/applicationService.js';

const submitApplicationSchema = z.object({
  name: z.string().optional(),
  title: z.string().optional(),
  project_name: z.string().optional(),
  short_desc: z.string().optional(),
  description: z.string().optional(),
  project_desc: z.string().optional(),
  short_desc_kz: z.string().optional(),
  category: z.string().optional().default('AI & IT Solutions'),
  project_category: z.string().optional(),
  stage: z.string().optional().default('MVP / Prototype'),
  project_stage: z.string().optional(),
  tag: z.string().optional().default('Startup'),
  target_audience: z.string().optional(),
  unique_value_prop: z.string().optional(),
  founder_id: z.string().optional(),
  founder_name: z.string().optional(),
  founder_phone: z.string().optional(),
  founder_role: z.string().optional(),
  team_members: z.string().optional(),
  pdf_deck_url: z.string().optional(),
  pdf_deck_name: z.string().optional(),
  pdf_deck_size: z.string().optional(),
  demo_url: z.string().optional(),
  demo_link: z.string().optional(),
  demo_or_github_url: z.string().optional(),
  presentation_link: z.string().optional(),
  logo_icon: z.string().optional(),
  event_id: z.string().optional(),
  event_title: z.string().optional(),
  metrics: z.any().optional(),
});

export class ApplicationController {
  /**
   * POST /api/applications/submit
   * Submit and automatically verify project application
   */
  static async submit(req, res, next) {
    try {
      console.log('[POST /api/applications/submit] Incoming body:', JSON.stringify(req.body, null, 2));

      const parseResult = submitApplicationSchema.safeParse(req.body || {});
      if (!parseResult.success) {
        console.warn('[POST /api/applications/submit] Validation error:', parseResult.error.errors);
        return res.status(400).json({
          success: false,
          error: 'Ошибка валидации полей заявки',
          details: parseResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      const bodyData = parseResult.data;
      const projectName = bodyData.name || bodyData.title || bodyData.project_name || 'Новый проект';
      const projectDesc = bodyData.short_desc || bodyData.description || bodyData.project_desc || 'Без описания';

      const normalizedPayload = {
        ...bodyData,
        name: projectName,
        title: projectName,
        short_desc: projectDesc,
        description: projectDesc,
        category: bodyData.category || bodyData.project_category || 'AI & IT Solutions',
        stage: bodyData.stage || bodyData.project_stage || 'MVP / Prototype',
        demo_url: bodyData.demo_url || bodyData.demo_link || bodyData.demo_or_github_url || null,
      };

      const telegramUser = req.telegramUser || {
        id: bodyData.founder_id || 'web_user_' + Date.now(),
        first_name: bodyData.founder_name || 'Участник',
        username: 'user',
      };

      const application = await ApplicationService.submitApplication(normalizedPayload, telegramUser);

      return res.status(201).json({
        success: true,
        message:
          application.status === 'approved' || application.status === 'APPROVED'
            ? 'Заявка успешно одобрена и зарегистрирована!'
            : application.status === 'manual_review' || application.status === 'MANUAL_REVIEW'
            ? 'Заявка отправлена на ручную модерацию экспертов.'
            : 'Заявка отклонена в соответствии с правилами Хаба.',
        data: {
          id: application.id,
          name: application.name || application.title,
          title: application.name || application.title,
          status: application.status,
          similarity_score: application.similarity_score,
          rejection_reason: application.rejection_reason,
          matched_entity_title: application.matched_entity_title,
          ai_analysis: application.ai_analysis,
          created_at: application.created_at,
        },
      });
    } catch (error) {
      console.error('[POST /api/applications/submit] Server error:', error);
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
