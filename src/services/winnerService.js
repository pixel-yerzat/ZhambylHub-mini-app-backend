import { getSupabaseClient } from '../config/supabase.js';

export class WinnerService {
  /**
   * Get all past winning projects from database.
   */
  static async getAllWinners() {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Database service is not configured: SUPABASE_URL or SUPABASE_KEY is missing.');
    }

    const { data, error } = await supabase
      .from('winning_projects')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch winning projects: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get winner by ID from database.
   */
  static async getWinnerById(id) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Database service is not configured: SUPABASE_URL or SUPABASE_KEY is missing.');
    }

    const { data, error } = await supabase
      .from('winning_projects')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to fetch winning project ${id}: ${error.message}`);
    }

    return data;
  }

  /**
   * Add a new winning project to the database registry.
   */
  static async addWinner(winnerData) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Database service is not configured: SUPABASE_URL or SUPABASE_KEY is missing.');
    }

    const { data, error } = await supabase
      .from('winning_projects')
      .insert([winnerData])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to add winning project: ${error.message}`);
    }

    return data;
  }
}
