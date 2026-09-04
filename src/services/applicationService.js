import { getSupabaseClient } from '../config/supabase.js';
import { WinnerService } from './winnerService.js';
import { verifyApplicationWithGemini } from './geminiVerification.js';
import { sendApplicationStatusNotification, sendAdminReviewAlert } from './telegramBotService.js';

// In-memory fallback stores for local/offline execution
const memoryApplications = [];
const memoryUsers = new Map();
const memoryLogs = [];

// Helper to insert into Supabase with automatic stripping of unknown columns and handling of NOT NULL constraints
async function insertIntoSupabaseWithRetry(supabase, table, payload, maxRetries = 15) {
  let currentPayload = { ...payload };
  const nullFallbackColumns = new Set();

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { data, error } = await supabase.from(table).insert([currentPayload]).select().single();
    if (!error) {
      console.log(`✅ [Supabase] Inserted record into '${table}'! ID: ${data?.id}`);
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
      if (!nullFallbackColumns.has(col)) {
        nullFallbackColumns.add(col);
        console.warn(`[Supabase] Column '${col}' has NOT NULL constraint in '${table}'. Supplying fallback empty value and retrying...`);
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
  const nullFallbackColumns = new Set();

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

    // 2. Column violates NOT NULL constraint -> supply safe fallback and retry
    const notNullMatch =
      error.message?.match(/null value in column "([^"]+)"/i) ||
      error.message?.match(/column "([^"]+)" violates not-null constraint/i);

    if (notNullMatch && notNullMatch[1]) {
      const col = notNullMatch[1];
      if (!nullFallbackColumns.has(col)) {
        nullFallbackColumns.add(col);
        console.warn(`[Supabase] Column '${col}' has NOT NULL constraint in 'profiles'. Supplying fallback and retrying...`);
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
    if (!telegramUser || !telegramUser.id) return null;

    const supabase = getSupabaseClient();
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

    if (supabase) {
      try {
        const { data, error } = await upsertProfileWithRetry(supabase, profileData);
        if (!error && data) return data;
      } catch (err) {
        console.warn('[ApplicationService] Supabase profile upsert error:', err.message);
      }
    }

    // In-memory fallback
    let user = memoryUsers.get(telegramIdStr);
    if (!user) {
      user = {
        ...profileData,
        created_at: new Date().toISOString(),
      };
      memoryUsers.set(telegramIdStr, user);
    } else {
      Object.assign(user, profileData);
    }
    return user;
  }

  /**
   * Get all previous project submissions by a specific user (by founder_id / telegram_id).
   */
  static async getUserSubmissions(telegramId) {
    const telegramIdStr = String(telegramId);
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .eq('founder_id', telegramIdStr)
          .order('created_at', { ascending: false });

        if (!error && data) {
          // Normalize fields (name -> title, short_desc -> description) for AI analyzer
          return data.map((d) => ({
            ...d,
            title: d.name || d.title,
            description: d.short_desc || d.description,
          }));
        }
      } catch (err) {
        console.warn('[ApplicationService] Supabase getUserSubmissions error:', err.message);
      }
    }

    return memoryApplications
      .filter((app) => String(app.founder_id || app.telegram_id) === telegramIdStr)
      .map((d) => ({
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
    const telegramIdStr = String(telegramUser.id);
    const user = await this.upsertUser(telegramUser, applicationData);

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

    // Extract real Telegram User ID from pdf_deck_url if founder_id was a guest placeholder
    let resolvedTelegramId = telegramIdStr;
    if (resolvedTelegramId.startsWith('web_user_') && pdfDeckUrl) {
      const match = pdfDeckUrl.match(/pitch_decks\/(\d+)\//);
      if (match && match[1]) {
        resolvedTelegramId = match[1];
        console.log(`[ApplicationService] Extracted real Telegram ID ${resolvedTelegramId} from pdf_deck_url`);
      }
    }

    // 1. Fetch historical context for comparison:
    const pastWinners = await WinnerService.getAllWinners();
    const userPreviousSubmissions = await this.getUserSubmissions(resolvedTelegramId);

    // 2. Run Gemini Semantic Verification
    const aiResult = await verifyApplicationWithGemini(
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
      id: `proj-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      name: title,
      title: title,
      category,
      tag: applicationData.tag || 'Startup',
      stage,
      short_desc: description,
      description: description,
      founder_id: resolvedTelegramId,
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
    const supabase = getSupabaseClient();
    let savedProject = newProject;

    if (supabase) {
      try {
        // Step A: Ensure profile exists in public.profiles to satisfy Foreign Key constraint
        await upsertProfileWithRetry(supabase, {
          id: resolvedTelegramId,
          first_name: founderName || 'Участник',
          username: telegramUser.username || null,
          phone: safeFounderPhone || null,
          role: 'founder',
          role_title: 'Резидент Hub',
          is_telegram: true,
          updated_at: new Date().toISOString(),
        });

        // Step B: Insert into public.projects with dynamic column stripping retry
        const projectPayload = {
          name: newProject.name,
          category: newProject.category,
          tag: newProject.tag,
          stage: newProject.stage,
          short_desc: newProject.short_desc,
          founder_id: newProject.founder_id,
          founder_name: newProject.founder_name,
          founder_phone: safeFounderPhone,
          founder_role: newProject.founder_role,
          team_members: safeTeamMembers,
          demo_url: safeDemoUrl,
          demo_link: safeDemoUrl,
          logo_icon: newProject.logo_icon,
          pdf_deck_url: safePdfDeckUrl,
          pdf_deck_name: newProject.pdf_deck_name,
          pdf_deck_size: newProject.pdf_deck_size,
          status: newProject.status,
          rejection_reason: newProject.rejection_reason,
          similarity_score: newProject.similarity_score,
          matched_entity_title: newProject.matched_entity_title,
          ai_analysis: newProject.ai_analysis,
          rating: 5.0,
          reviews_count: 1,
          metrics: newProject.metrics,
        };

        const { data, error } = await insertIntoSupabaseWithRetry(supabase, 'projects', projectPayload);

        if (!error && data) {
          savedProject = { ...newProject, ...data };
        }
      } catch (err) {
        console.error('[ApplicationService] ❌ Supabase project insert unexpected error:', err.message);
      }
    }

    memoryApplications.unshift(savedProject);

    // 5. Optional Event Registration linking if event_id is supplied
    if (applicationData.event_id && supabase) {
      try {
        await supabase.from('event_registrations').insert([
          {
            event_id: applicationData.event_id,
            event_title: applicationData.event_title || 'Хакатон Zhambyl Hub',
            user_id: telegramIdStr,
            attendee_name: founderName,
            attendee_phone: safeFounderPhone || '77000000000',
            telegram_username: telegramUser.username || null,
            registration_type: 'pitch_project',
            project_id: savedProject.id,
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
    const auditLog = {
      id: `log-${Date.now()}`,
      project_id: savedProject.id,
      telegram_id: telegramIdStr,
      model_name: aiResult.model_name,
      verdict: aiResult.verdict,
      similarity_score: aiResult.similarity_score,
      confidence_score: aiResult.confidence_score,
      raw_response: aiResult.raw_response,
      execution_time_ms: aiResult.execution_time_ms,
      created_at: new Date().toISOString(),
    };

    if (supabase) {
      try {
        await supabase.from('verification_logs').insert([auditLog]);
      } catch (err) {
        console.warn('[ApplicationService] Supabase log insert error:', err.message);
      }
    }
    memoryLogs.unshift(auditLog);

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
   * Get application / project by ID.
   */
  static async getApplicationById(id) {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .eq('id', id)
          .single();

        if (!error && data) return data;
      } catch (err) {
        console.warn('[ApplicationService] Supabase getApplicationById error:', err.message);
      }
    }
    return memoryApplications.find((app) => app.id === id) || null;
  }

  /**
   * Admin manual status override (Approve / Reject).
   */
  static async updateApplicationStatus(id, newStatus, adminTelegramId, notes = '') {
    const validStatuses = ['APPROVED', 'REJECTED_DUPLICATE', 'REJECTED_PAST_WINNER', 'MANUAL_REVIEW', 'approved', 'rejected_duplicate', 'rejected_past_winner', 'manual_review'];
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}`);
    }

    const updatePayload = {
      status: newStatus,
      reviewed_by: adminTelegramId || null,
      reviewed_at: new Date().toISOString(),
      admin_notes: notes,
      updated_at: new Date().toISOString(),
    };

    const supabase = getSupabaseClient();
    let updatedApp = null;

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('projects')
          .update(updatePayload)
          .eq('id', id)
          .select()
          .single();

        if (!error && data) updatedApp = data;
      } catch (err) {
        console.warn('[ApplicationService] Supabase update status error:', err.message);
      }
    }

    if (!updatedApp) {
      const idx = memoryApplications.findIndex((app) => app.id === id);
      if (idx !== -1) {
        memoryApplications[idx] = { ...memoryApplications[idx], ...updatePayload };
        updatedApp = memoryApplications[idx];
      }
    }

    if (updatedApp) {
      // Send notification about manual verdict update
      const recipientId = updatedApp.founder_id || updatedApp.telegram_id;
      sendApplicationStatusNotification(recipientId, updatedApp).catch((err) =>
        console.error('[ApplicationService] Notify user after manual review failed:', err.message)
      );
    }

    return updatedApp;
  }

  /**
   * List all applications / projects with filtering for admin dashboard.
   */
  static async listApplications(filter = {}) {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        let query = supabase.from('projects').select('*').order('created_at', { ascending: false });
        if (filter.status) query = query.eq('status', filter.status.toLowerCase());
        if (filter.category) query = query.eq('category', filter.category);
        const { data, error } = await query;
        if (!error && data) return data;
      } catch (err) {
        console.warn('[ApplicationService] Supabase listApplications error:', err.message);
      }
    }

    return memoryApplications.filter((app) => {
      if (filter.status && app.status?.toLowerCase() !== filter.status?.toLowerCase()) return false;
      if (filter.category && app.category !== filter.category) return false;
      return true;
    });
  }
}
