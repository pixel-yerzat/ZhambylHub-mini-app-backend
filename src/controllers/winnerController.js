import { z } from 'zod';
import { WinnerService } from '../services/winnerService.js';

const addWinnerSchema = z.object({
  title: z.string().min(2),
  description: z.string().min(10),
  category: z.string().min(2),
  event_name: z.string().min(2),
  year_or_date: z.string().min(1),
  team_name: z.string().optional(),
  winning_track: z.string().optional(),
  key_features: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
});

export class WinnerController {
  static async getAll(req, res, next) {
    try {
      const winners = await WinnerService.getAllWinners();
      return res.json({
        success: true,
        count: winners.length,
        data: winners,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req, res, next) {
    try {
      const { id } = req.params;
      const winner = await WinnerService.getWinnerById(id);
      if (!winner) {
        return res.status(404).json({ success: false, error: 'Проект-победитель не найден' });
      }
      return res.json({ success: true, data: winner });
    } catch (error) {
      next(error);
    }
  }

  static async create(req, res, next) {
    try {
      const parseResult = addWinnerSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          error: 'Неверные данные победителя',
          details: parseResult.error.errors,
        });
      }

      const created = await WinnerService.addWinner(parseResult.data);
      return res.status(201).json({
        success: true,
        message: 'Проект-победитель успешно добавлен в реестр',
        data: created,
      });
    } catch (error) {
      next(error);
    }
  }
}
