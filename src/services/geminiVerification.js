import { getGeminiModel, getGeminiClient } from '../config/gemini.js';
import { config } from '../config/env.js';

/**
 * System prompt and rules for Gemini Model
 */
const SYSTEM_INSTRUCTION = `
Ты — главный эксперт и AI-арбитр инновационного Хаба технологических проектов и хакатонов.
Твоя задача — проводить строгую, но объективную интеллектуальную экспертизу входящих заявок на проекты.

Правила валидации:
1. ОДИН АВТОР МОЖЕТ ПОДАВАТЬ НЕСКОЛЬКО РАЗНЫХ ПРОЕКТОВ:
   - Если участник ранее подал один проект (например, "EdTech тренажер"), а сейчас подает другой проект (например, "AgriTech дрон" или даже другой образовательный проект с принципиально иной механикой), это РАЗРЕШЕНО -> verdict = "APPROVED".
2. ЗАПРЕТ НА ДУБЛИКАТЫ ОТ ОДНОГО АВТОРА:
   - Если новая заявка участника по смыслу, сути проблемы, решению или названию копирует его же предыдущую заявку (даже если слова перефразированы или изменен заголовок), это ЗАПРЕЩЕНО -> verdict = "REJECTED_DUPLICATE".
3. ЗАПРЕТ НА ПОВТОРНОЕ ИСПОЛЬЗОВАНИЕ ПРОЕКТОВ-ПОБЕДИТЕЛЕЙ ХАБА:
   - Если заявка повторяет проект из предоставленной базы уже победивших проектов прошлых мероприятий Хаба (прямое копирование идеи, ключевой механики или очевидный рерайт) -> verdict = "REJECTED_PAST_WINNER".
4. СХОЖИЕ ТЕМАТИКИ И СФЕРЫ РАЗРЕШЕНЫ, ЕСЛИ РЕШЕНИЯ РАЗНЫЕ:
   - Проекты могут быть в одной сфере (например, оба в медицине или оба используют компьютерное зрение). Если идея, целевая аудитория и технологическое решение самобытны и отличаются от победителей -> verdict = "APPROVED".
5. СПОРНЫЕ И ПОГРАНИЧНЫЕ СЛУЧАИ (Similarity 60-79%):
   - Если проект частично заимствует идею, но есть неоднозначность -> verdict = "MANUAL_REVIEW".

Требование к ответу:
Верни строго валидный JSON с вердиктом, оценкой схожести (0-100), уверенностью (0-100), обоснованием на русском языке и деталями.
`;

/**
 * Perform semantic analysis of a new project application against past winning projects and the user's previous submissions.
 *
 * @param {Object} newApplication - The new application data { title, description, category, target_audience, unique_value_prop }
 * @param {Array} pastWinners - Array of winning projects from the database
 * @param {Array} userPreviousSubmissions - Array of previous submissions by this specific user
 * @returns {Promise<Object>} Structured verification result
 */
export async function verifyApplicationWithGemini(
  newApplication,
  pastWinners = [],
  userPreviousSubmissions = []
) {
  const startTime = Date.now();
  const client = getGeminiClient();

  // If Gemini client is not initialized, run heuristic fallback
  if (!client || !config.gemini.apiKey) {
    console.warn('[GeminiVerification] No Gemini API key configured. Executing fallback heuristic verification.');
    return fallbackHeuristicVerification(newApplication, pastWinners, userPreviousSubmissions, startTime);
  }

  const prompt = `
Проанализируй входящую заявку проекта на предмет плагиата победителей прошлых мероприятий Хаба или дублирования собственных заявок автора.

ДАННЫЕ ВХОДЯЩЕЙ ЗАЯВКИ:
- Название: "${newApplication.title}"
- Категория: "${newApplication.category}"
- Описание: "${newApplication.description}"
- Целевая аудитория: "${newApplication.target_audience || 'Не указана'}"
- Уникальное ценностное предложение (УТП): "${newApplication.unique_value_prop || 'Не указано'}"

ПРЕДЫДУЩИЕ ЗАЯВКИ ЭТОГО ЖЕ АВТОРА (${userPreviousSubmissions.length} шт.):
${
  userPreviousSubmissions.length === 0
    ? 'Ранее автор не подавал заявок.'
    : userPreviousSubmissions
        .map(
          (sub, idx) =>
            `${idx + 1}. ID: "${sub.id}" | Название: "${sub.title}" | Категория: "${sub.category}" | Описание: "${sub.description}"`
        )
        .join('\n')
}

БАЗА ПРОЕКТОВ-ПОБЕДИТЕЛЕЙ ПРОШЛЫХ МЕРОПРИЯТИЙ ХАБА (${pastWinners.length} шт.):
${
  pastWinners.length === 0
    ? 'База победителей пуста.'
    : pastWinners
        .map(
          (w, idx) =>
            `${idx + 1}. ID: "${w.id}" | Мероприятие: "${w.event_name} (${w.year_or_date})" | Название: "${w.title}" | Категория: "${w.category}" | Описание: "${w.description}" | Ключевые фичи: ${(w.key_features || []).join(', ')}`
        )
        .join('\n')
}

ФОРМАТ ВЫХОДНОГО JSON:
{
  "verdict": "APPROVED" | "REJECTED_DUPLICATE" | "REJECTED_PAST_WINNER" | "MANUAL_REVIEW",
  "similarity_score": 0-100,
  "confidence_score": 0-100,
  "matched_entity_type": "WINNING_PROJECT" | "OWN_PREVIOUS_SUBMISSION" | "NONE",
  "matched_entity_id": "UUID_строка_или_null",
  "matched_entity_title": "название_совпавшего_проекта_или_null",
  "rejection_reason_ru": "четкое и вежливое объяснение на русском языке для участника, если проект отклонен (или null при APPROVED)",
  "detailed_analysis": {
    "core_idea_analysis": "анализ сути идеи",
    "novelty_points": ["пункт новизны 1", "пункт новизны 2"],
    "overlap_points": ["пункт совпадения 1"],
    "why_verdict": "краткое объяснение почему вынесен именно этот вердикт"
  }
}
`;

  // Try available candidate models in order
  const candidateModels = [
    config.gemini.model,
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-pro',
  ].filter(Boolean);

  // Remove duplicates
  const uniqueModels = Array.from(new Set(candidateModels));

  for (const modelName of uniqueModels) {
    try {
      const model = getGeminiModel(modelName);
      if (!model) continue;

      const result = await model.generateContent([
        { text: SYSTEM_INSTRUCTION },
        { text: prompt },
      ]);

      const rawText = result.response.text();
      const executionTimeMs = Date.now() - startTime;

      // Parse JSON
      const parsed = JSON.parse(rawText.trim());

      console.log(`[GeminiVerification] Successfully verified application with model "${modelName}": Verdict = ${parsed.verdict}`);

      return {
        success: true,
        verdict: parsed.verdict || 'APPROVED',
        similarity_score: typeof parsed.similarity_score === 'number' ? parsed.similarity_score : 0,
        confidence_score: typeof parsed.confidence_score === 'number' ? parsed.confidence_score : 90,
        matched_entity_type: parsed.matched_entity_type || 'NONE',
        matched_entity_id: parsed.matched_entity_id || null,
        matched_entity_title: parsed.matched_entity_title || null,
        rejection_reason: parsed.rejection_reason_ru || null,
        detailed_analysis: parsed.detailed_analysis || {},
        raw_response: parsed,
        execution_time_ms: executionTimeMs,
        model_name: modelName,
      };
    } catch (error) {
      console.warn(`[GeminiVerification] Model "${modelName}" failed: ${error.message}. Trying next candidate...`);
    }
  }

  // If all Gemini models fail, run heuristic fallback so user submission is never dropped
  console.warn('[GeminiVerification] All Gemini models failed or returned error. Running semantic heuristic fallback.');
  return fallbackHeuristicVerification(newApplication, pastWinners, userPreviousSubmissions, startTime);
}

/**
 * Heuristic Local Verification Fallback (Used when Gemini API Key is not set or offline).
 * Performs text token overlap and similarity checks.
 */
function fallbackHeuristicVerification(newApp, pastWinners, userSubmissions, startTime) {
  const normalize = (str) =>
    (str || '')
      .toLowerCase()
      .replace(/[^a-zа-я0-9\s]/gi, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);

  const setA = new Set([...normalize(newApp.title), ...normalize(newApp.description)]);
  const titleWordsA = new Set(normalize(newApp.title));

  const calcSimilarity = (title, desc) => {
    const setB = new Set([...normalize(title), ...normalize(desc)]);
    const titleWordsB = new Set(normalize(title));

    if (setA.size === 0 || setB.size === 0) return 0;

    // 1. Text token intersection (Jaccard similarity)
    let intersection = 0;
    for (const w of setA) {
      if (setB.has(w)) intersection++;
    }
    const union = new Set([...setA, ...setB]).size;
    const jaccard = (intersection / union) * 100;
    const overlapMin = (intersection / Math.min(setA.size, setB.size)) * 100;

    // 2. Title similarity
    let titleIntersection = 0;
    for (const w of titleWordsA) {
      if (titleWordsB.has(w)) titleIntersection++;
    }
    const titleSim = titleWordsA.size > 0 && titleWordsB.size > 0
      ? (titleIntersection / Math.min(titleWordsA.size, titleWordsB.size)) * 100
      : 0;

    // Weighted similarity score
    const combinedScore = Math.round(
      Math.max(jaccard * 1.5, overlapMin * 0.8, titleSim >= 75 ? 85 : 0)
    );

    return Math.min(combinedScore, 100);
  };

  // 1. Check user own duplicates
  for (const prev of userSubmissions) {
    const sim = calcSimilarity(prev.title, prev.description);
    if (sim >= 60 || prev.title.trim().toLowerCase() === newApp.title.trim().toLowerCase()) {
      return {
        success: true,
        verdict: 'REJECTED_DUPLICATE',
        similarity_score: Math.max(sim, 85),
        confidence_score: 90,
        matched_entity_type: 'OWN_PREVIOUS_SUBMISSION',
        matched_entity_id: prev.id,
        matched_entity_title: prev.title,
        rejection_reason: `Вы уже подавали похожий проект "${prev.title}". Один и тот же проект нельзя подавать дважды.`,
        detailed_analysis: {
          core_idea_analysis: 'Обнаружено высокое совпадение с вашей ранее поданной заявкой.',
          why_verdict: 'Дубликат собственной заявки.',
        },
        raw_response: { fallback: true },
        execution_time_ms: Date.now() - startTime,
        model_name: 'heuristic-local-engine',
      };
    }
  }

  // 2. Check past winners
  for (const winner of pastWinners) {
    const sim = calcSimilarity(winner.title, winner.description);
    if (sim >= 60 || winner.title.trim().toLowerCase() === newApp.title.trim().toLowerCase()) {
      return {
        success: true,
        verdict: 'REJECTED_PAST_WINNER',
        similarity_score: Math.max(sim, 85),
        confidence_score: 90,
        matched_entity_type: 'WINNING_PROJECT',
        matched_entity_id: winner.id,
        matched_entity_title: winner.title,
        rejection_reason: `Проект имеет критическое сходство с проектом-победителем "${winner.title}" (${winner.event_name}). Ранее побеждавшие проекты не допускаются к участию.`,
        detailed_analysis: {
          core_idea_analysis: `Идея повторяет проект-победитель "${winner.title}".`,
          why_verdict: 'Плагиат или повторная подача победившего проекта.',
        },
        raw_response: { fallback: true },
        execution_time_ms: Date.now() - startTime,
        model_name: 'heuristic-local-engine',
      };
    }
  }

  // Otherwise APPROVED
  return {
    success: true,
    verdict: 'APPROVED',
    similarity_score: 15,
    confidence_score: 85,
    matched_entity_type: 'NONE',
    matched_entity_id: null,
    matched_entity_title: null,
    rejection_reason: null,
    detailed_analysis: {
      core_idea_analysis: 'Проект оригинален и не нарушает правила Хаба.',
      novelty_points: ['Новая архитектура решения', 'Самостоятельная концепция'],
      why_verdict: 'Проект прошел все проверки.',
    },
    raw_response: { fallback: true },
    execution_time_ms: Date.now() - startTime,
    model_name: 'heuristic-local-engine',
  };
}
