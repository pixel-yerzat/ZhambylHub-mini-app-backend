import { getSupabaseClient } from '../config/supabase.js';
import { WinnerService } from './winnerService.js';
import { verifyApplicationWithGemini } from './geminiVerification.js';
import { sendApplicationStatusNotification, sendAdminReviewAlert } from './telegramBotService.js';

// Helper to insert into Supabase with automatic stripping of unknown columns and handling of NOT NULL constraints
async function insertIntoSupabaseWithRetry(supabase, table, payload, maxRetries = 15) {
  let currentPayload = { ...payload };
  const notNullDefaultColumns = new Set();

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { data, error } = await supabase.from(table).insert([currentPayload]).select().single();
    if (!error) {
      return { data, error: null };
    }

    // 1. Column doesn't exist in Supabase table schema -> strip it and retry
    const missingColMatch =
      error.message?.match(/Could not find the '([^']+)' column/i) ||
      error.message?.match(/column "([^"]+)" of relation "[^"]+" does not exist/i) ||
      error.message?.match(/column "([^"]+)" does not exist/i);

    if (missingColMatch && missingColMatch[1] && currentPayload.hasOwnProperty(missingColMatch[1])) {
      console.warn(`[Supabase] Column '${missingColMatch[1]}' does not exist in '${table}'. Stripping column and retrying...`);
      delete currentPayload[missingColMatch[1]];
      continue;
    }

    // 2. Column violates NOT NULL constraint -> supply safe empty default and retry
    const notNullMatch =
      error.message?.match(/null value in column "([^"]+)"/i) ||
      error.message?.match(/column "([^"]+)" violates not-null constraint/i);

    if (notNullMatch && notNullMatch[1]) {
      const col = notNullMatch[1];
      if (!notNullDefaultColumns.has(col)) {
        notNullDefaultColumns.add(col);
        console.warn(`[Supabase] Column '${col}' has NOT NULL constraint in '${table}'. Supplying empty default and retrying...`);
        currentPayload[col] = '';
        continue;
      }
    }

    console.error(`[Supabase] ❌ Insert into '${table}' failed:`, error.message);
    return { data: null, error };
  }
  return { data: null, error: new Error('Max retries exceeded') };
}

// Helper to upsert profile into Supabase with automatic stripping of unknown columns and NOT NULL handling
async function upsertProfileWithRetry(supabase, profileData, maxRetries = 10) {
  let currentData = { ...profileData };
  const notNullDefaultColumns = new Set();

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { data, error } = await supabase.from('profiles').upsert(currentData, { onConflict: 'id' }).select().single();
    if (!error) return { data, error: null };

    // 1. Column doesn't exist -> strip and retry
    const missingColMatch =
      error.message?.match(/Could not find the '([^']+)' column/i) ||
      error.message?.match(/column "([^"]+)" of relation "[^"]+" does not exist/i) ||
      error.message?.match(/column "([^"]+)" does not exist/i);

    if (missingColMatch && missingColMatch[1] && currentData.hasOwnProperty(missingColMatch[1])) {
      console.warn(`[Supabase] Column '${missingColMatch[1]}' does not exist in 'profiles'. Stripping column and retrying...`);
      delete currentData[missingColMatch[1]];
      continue;
    }

    // 2. Column violates NOT NULL constraint -> supply safe empty default and retry
    const notNullMatch =
      error.message?.match(/null value in column "([^"]+)"/i) ||
      error.message?.match(/column "([^"]+)" violates not-null constraint/i);

    if (notNullMatch && notNullMatch[1]) {
      const col = notNullMatch[1];
      if (!notNullDefaultColumns.has(col)) {
        notNullDefaultColumns.add(col);
        console.warn(`[Supabase] Column '${col}' has NOT NULL constraint in 'profiles'. Supplying empty default and retrying...`);
        currentData[col] = '';
        continue;
      }
    }

    console.warn(`[Supabase] Profile upsert warning:`, error.message);
    return { data: null, error };
  }
  return { data: null, error: new Error('Max retries exceeded') };
}

export class ApplicationService {
  /**
   * Ensure user exists or update their profile in public.profiles.
   */
  static async upsertUser(telegramUser, extraProfileData = {}) {
    if (!telegramUser || !telegramUser.id) {
      throw new Error('Unauthorized: Valid Telegram user identity is required.');
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Database service is not configured: SUPABASE_URL or SUPABASE_KEY is missing.');
    }

    const telegramIdStr = String(telegramUser.id);
    const profileData = {
      id: telegramIdStr,
      first_name: telegramUser.first_name || null,
      last_name: telegramUser.last_name || null,
      username: telegramUser.username || null,
      phone: extraProfileData.phone || extraProfileData.founder_phone || null,
      role: extraProfileData.role || 'founder',
      role_title: extraProfileData.role_title || 'Резидент Hub',
      avatar_url: telegramUser.photo_url || null,
      is_telegram: true,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await upsertProfileWithRetry(supabase, profileData);
    if (error) {
      throw new Error(`Failed to upsert user profile: ${error.message}`);
    }
    return data;
  }

  /**
   * Get all previous project submissions by a specific user (by founder_id / telegram_id).
   */
  static async getUserSubmissions(telegramId) {
    if (!telegramId) {
      throw new Error('telegramId is required to fetch user submissions.');
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Database service is not configured: SUPABASE_URL or SUPABASE_KEY is missing.');
    }

    const telegramIdStr = String(telegramId);
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('founder_id', telegramIdStr)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch user submissions: ${error.message}`);
    }

    return (data || []).map((d) => ({
      ...d,
      title: d.name || d.title,
      description: d.short_desc || d.description,
    }));
  }

  /**
   * Submit and verify a new project application.
   *
   * @param {Object} applicationData - Application payload (from Zhambyl Hub Mini App)
   * @param {Object} telegramUser - Authenticated Telegram user from Mini App
   * @returns {Promise<Object>} Created project with AI verification results
   */
  static async submitApplication(applicationData, telegramUser) {
    if (!telegramUser || !telegramUser.id) {
      throw new Error('Unauthorized: Authenticated Telegram user is required.');
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Database service is not configured: SUPABASE_URL or SUPABASE_KEY is missing.');
    }

    const telegramIdStr = String(telegramUser.id);
    await this.upsertUser(telegramUser, applicationData);

    const title = (applicationData.name || applicationData.title || '').trim();
    const description = (applicationData.short_desc || applicationData.description || '').trim();
    const category = (applicationData.category || 'AI & IT Solutions').trim();
    const stage = applicationData.stage || 'MVP / Prototype';
    const teamMembers = applicationData.team_members || '';
    const demoUrl = applicationData.demo_url || applicationData.demo_link || null;
    const pdfDeckUrl = applicationData.pdf_deck_url || applicationData.presentation_link || null;
    const founderName =
      applicationData.founder_name ||
      `${telegramUser.first_name || ''} ${telegramUser.last_name || ''}`.trim() ||
      'Участник Hub';
    const founderPhone = applicationData.founder_phone || applicationData.phone || null;

    // 1. Fetch historical context for comparison from database
    let pastWinners = [];
    try {
      pastWinners = await WinnerService.getAllWinners();
    } catch (err) {
      console.warn('[ApplicationService] Could not fetch past winners for comparison:', err.message);
    }

    let userPreviousSubmissions = [];
    try {
      userPreviousSubmissions = await this.getUserSubmissions(telegramIdStr);
    } catch (err) {
      console.warn('[ApplicationService] Could not fetch user past submissions:', err.message);
    }

    // 2. Run Gemini Semantic Verification with Safe Fallback to MANUAL_REVIEW
    let aiResult;
    try {
      aiResult = await verifyApplicationWithGemini(
        {
          title,
          description,
          category,
          target_audience: applicationData.target_audience || applicationData.stage,
          unique_value_prop: applicationData.unique_value_prop || applicationData.metrics?.[0]?.value,
        },
        pastWinners,
        userPreviousSubmissions
      );
    } catch (geminiError) {
      console.warn('[ApplicationService] Gemini verification unavailable, routing to MANUAL_REVIEW:', geminiError.message);
      aiResult = {
        verdict: 'MANUAL_REVIEW',
        similarity_score: 0,
        confidence_score: 0,
        rejection_reason: 'Сервис Gemini AI временно недоступен. Проект сохранен и направлен на ручную модерацию администратором Hub.',
        model_name: config.gemini.model || 'gemini-1.5-flash',
        raw_response: { error: geminiError.message, note: 'Service unavailable fallback to manual review' },
        execution_time_ms: 0,
        matched_entity_type: '',
        matched_entity_id: '',
        matched_entity_title: '',
      };
    }

    // Map AI verdict to status string
    let status = 'pending';
    if (aiResult.verdict === 'APPROVED') status = 'approved';
    else if (aiResult.verdict === 'REJECTED_DUPLICATE') status = 'rejected_duplicate';
    else if (aiResult.verdict === 'REJECTED_PAST_WINNER') status = 'rejected_past_winner';
    else if (aiResult.verdict === 'MANUAL_REVIEW') status = 'manual_review';

    // 3. Construct project record for public.projects
    const safePdfDeckUrl = pdfDeckUrl || '';
    const safeDemoUrl = demoUrl || '';
    const safeFounderPhone = founderPhone || '';
    const safeTeamMembers = teamMembers || '';

    const newProject = {
      name: title,
      title: title,
      category,
      tag: applicationData.tag || 'Startup',
      stage,
      short_desc: description,
      description: description,
      founder_id: telegramIdStr,
      founder_name: founderName,
      founder_phone: safeFounderPhone,
      founder_role: applicationData.founder_role || 'Founder & Team Lead',
      team_members: safeTeamMembers,
      demo_url: safeDemoUrl,
      demo_link: safeDemoUrl,
      logo_icon: applicationData.logo_icon || '🚀',
      pdf_deck_url: safePdfDeckUrl,
      pdf_deck_name: applicationData.pdf_deck_name || 'pitch_deck.pdf',
      pdf_deck_size: applicationData.pdf_deck_size || '2.4 MB',
      
      // Verification fields
      status: status,
      verdict: aiResult.verdict,
      rejection_reason: aiResult.rejection_reason || '',
      similarity_score: Number(aiResult.similarity_score) || 0,
      matched_entity_type: aiResult.matched_entity_type || '',
      matched_entity_id: aiResult.matched_entity_id || '',
      matched_entity_title: aiResult.matched_entity_title || '',
      ai_analysis: aiResult,
      
      rating: 5.0,
      reviews_count: 1,
      metrics: [
        { label: 'Статус', value: status === 'approved' ? 'Одобрен' : 'На модерации' },
        { label: 'Питч-дек', value: safePdfDeckUrl ? 'PDF загружен' : 'Без PDF' },
        { label: 'Питч', value: 'Готов к защите' },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // 4. Save to Supabase (public.projects)
    const { data: savedProject, error: projectInsertError } = await insertIntoSupabaseWithRetry(
      supabase,
      'projects',
      newProject
    );

    if (projectInsertError || !savedProject) {
      throw new Error(`Failed to save project into database: ${projectInsertError?.message || 'Unknown database error'}`);
    }

    // 5. Optional Event Registration linking if event_id is supplied
    if (applicationData.event_id) {
      try {
        const isValidEventUuid = String(applicationData.event_id).length === 36;
        const isValidProjectUuid = savedProject.id && String(savedProject.id).length === 36;

        await supabase.from('event_registrations').insert([
          {
            event_id: isValidEventUuid ? applicationData.event_id : null,
            event_title: applicationData.event_title || 'Хакатон Zhambyl Hub',
            user_id: telegramIdStr,
            attendee_name: founderName,
            attendee_phone: safeFounderPhone || '77000000000',
            telegram_username: telegramUser.username || null,
            registration_type: 'pitch_project',
            project_id: isValidProjectUuid ? savedProject.id : null,
            project_name: newProject.name,
            project_desc: newProject.short_desc,
            team_members: safeTeamMembers,
            pdf_deck_url: safePdfDeckUrl,
            project_stage: stage,
            project_category: category,
            demo_or_github_url: safeDemoUrl,
            status: 'confirmed',
          },
        ]);
      } catch (err) {
        console.warn('[ApplicationService] Supabase event_registration link error:', err.message);
      }
    }

    // 6. Save Verification Audit Log
    try {
      const isValidProjectUuid = savedProject.id && String(savedProject.id).length === 36;
      const supabaseLogPayload = {
        project_id: isValidProjectUuid ? savedProject.id : null,
        telegram_id: telegramIdStr,
        model_name: aiResult.model_name,
        verdict: aiResult.verdict,
        similarity_score: aiResult.similarity_score,
        confidence_score: aiResult.confidence_score,
        raw_response: aiResult.raw_response,
        execution_time_ms: aiResult.execution_time_ms,
      };
      await supabase.from('verification_logs').insert([supabaseLogPayload]);
    } catch (err) {
      console.warn('[ApplicationService] Supabase log insert error:', err.message);
    }

    // 7. Trigger Real-Time Telegram Notifications
    sendApplicationStatusNotification(telegramUser.id, savedProject).catch((err) =>
      console.error('[ApplicationService] Notify user failed:', err.message)
    );

    if (savedProject.status === 'manual_review' || savedProject.status === 'MANUAL_REVIEW') {
      sendAdminReviewAlert(savedProject).catch((err) =>
        console.error('[ApplicationService] Notify admin failed:', err.message)
      );
    }

    return savedProject;
  }

  /**
   * Get application / project by ID from database.
   */
  static async getApplicationById(id) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Database service is not configured: SUPABASE_URL or SUPABASE_KEY is missing.');
    }

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch project ${id}: ${error.message}`);
    }

    return data;
  }

  /**
   * Admin manual status override (Approve / Reject) in database.
   */
  static async updateApplicationStatus(id, newStatus, adminTelegramId, notes = '') {
    const validStatuses = [
      'APPROVED',
      'REJECTED_DUPLICATE',
      'REJECTED_PAST_WINNER',
      'MANUAL_REVIEW',
      'approved',
      'rejected_duplicate',
      'rejected_past_winner',
      'manual_review',
    ];
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}`);
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Database service is not configured: SUPABASE_URL or SUPABASE_KEY is missing.');
    }

    const updatePayload = {
      status: newStatus,
      reviewed_by: adminTelegramId || null,
      reviewed_at: new Date().toISOString(),
      admin_notes: notes,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('projects')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to update project status: ${error.message}`);
    }

    if (data) {
      const recipientId = data.founder_id || data.telegram_id;
      sendApplicationStatusNotification(recipientId, data).catch((err) =>
        console.error('[ApplicationService] Notify user after manual review failed:', err.message)
      );
    }

    return data;
  }

  /**
   * List all applications / projects with filtering from database.
   */
  static async listApplications(filter = {}) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Database service is not configured: SUPABASE_URL or SUPABASE_KEY is missing.');
    }

    let query = supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (filter.status) query = query.eq('status', filter.status.toLowerCase());
    if (filter.category) query = query.eq('category', filter.category);

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to list applications: ${error.message}`);
    }

    return data || [];
  }
}
