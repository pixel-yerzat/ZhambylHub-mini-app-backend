import { getSupabaseClient } from '../config/supabase.js';

// Fallback seed winners for local / offline mode
const MEMORY_SEED_WINNERS = [
  {
    id: 'w-1111-1111-1111',
    title: 'Smart Parking Almaty (Умная парковка)',
    description: 'Система компьютерного зрения и IoT датчиков для автоматического обнаружения свободных парковочных мест на улицах города с прогнозированием загруженности через ML и оплатой через Telegram бот.',
    category: 'Smart City / IoT',
    event_name: 'Hub Hackathon Spring 2024',
    year_or_date: '2024',
    team_name: 'VisionOps Team',
    winning_track: '1st Place Best Smart City Solution',
    key_features: ['Детекция свободных мест по камерам RTSP', 'ML-прогнозирование загрузки улиц', 'Оплата парковки через Telegram WebApp', 'Навигация до ближайшего свободного места'],
    keywords: ['парковка', 'компьютерное зрение', 'камеры', 'iot', 'навигация', 'город', 'smart city'],
  },
  {
    id: 'w-2222-2222-2222',
    title: 'AgroScan AI (Диагностика болезней посевов по дронам)',
    description: 'Платформа для фермеров, анализирующая мультиспектральные снимки с дронов с использованием сверточных нейросетей (CNN) для раннего выявления очагов болезней пшеницы и сорняков с расчетом точной карты внесения пестицидов.',
    category: 'AgriTech / AI',
    event_name: 'Hub AgroTech Demo Day 2023',
    year_or_date: '2023',
    team_name: 'AgroVision',
    winning_track: 'Grand Prix Winner',
    key_features: ['Анализ снимков с дронов и спутников NDVI', 'Сегментация очагов заражения с точностью 94%', 'Формирование карт дифференцированного внесения удобрений', 'Офлайн режим работы в полях'],
    keywords: ['сельское хозяйство', 'дроны', 'фермеры', 'растения', 'болезни', 'агро', 'нейросети'],
  },
  {
    id: 'w-3333-3333-3333',
    title: 'Qazaq Tutor AI (Персональный репетитор казахского языка)',
    description: 'Интерактивный языковой репетитор на базе fine-tuned LLM с распознаванием речи и коррекцией акцента в реальном времени, адаптирующийся под уровень ученика по методике интервального повторения.',
    category: 'EdTech / AI',
    event_name: 'Hub AI Innovation Cup 2024',
    year_or_date: '2024',
    team_name: 'Til Bilimi',
    winning_track: '1st Place Best EdTech Project',
    key_features: ['Голосовой диалог с ИИ с оценкой произношения', 'Адаптивная генерация упражнений под интересы пользователя', 'Интерактивные диалоги по бытовым ситуациям', 'Геймификация с рейтингами и наградами'],
    keywords: ['казахский язык', 'репетитор', 'обучение', 'edtech', 'распознавание речи', 'произношение', 'llm'],
  },
  {
    id: 'w-4444-4444-4444',
    title: 'CardioGuard (Портативный ЭКГ мониторинг с ИИ-скринингом)',
    description: 'Носимый мини-патч и мобильное приложение с обученной нейросетью для непрерывного скрининга аритмий и ранних признаков ишемии с автоматической отправкой экстренных оповещений врачу и родственникам.',
    category: 'MedTech / HealthCare',
    event_name: 'Hub HealthTech Marathon 2023',
    year_or_date: '2023',
    team_name: 'CardioPulse',
    winning_track: '1st Place MedTech Innovation',
    key_features: ['Непрерывный мониторинг одноканального ЭКГ', 'Детекция 12 типов аритмий в реальном времени', 'Интеграция с медицинскими картами через FHIR/HL7', 'Кнопка SOS и отправка геолокации'],
    keywords: ['экг', 'кардиология', 'сердце', 'медицина', 'здоровье', 'аритмия', 'мониторинг', 'врач'],
  },
  {
    id: 'w-5555-5555-5555',
    title: 'MicroInvest Telegram (Дробные инвестиции в облигации)',
    description: 'Финтех-сервис внутри Telegram Mini App, позволяющий пользователям округлять повседневные чеки и автоматически инвестировать сдачу в низкорисковые государственные и корпоративные облигации от 100 тенге.',
    category: 'FinTech / Web3',
    event_name: 'Hub FinTech Challenge 2024',
    year_or_date: '2024',
    team_name: 'Tengetech',
    winning_track: 'Best Retail FinTech',
    key_features: ['Авто-округление транзакций и кэшбэк-копилка', 'Дробные покупки ценных бумаг от минимальных сумм', 'Биометрическая авторизация через FaceID/Passcode', 'Интеграция с национальным депозитарием'],
    keywords: ['инвестиции', 'сбережения', 'облигации', 'копилка', 'финансы', 'финтех', 'telegram mini app'],
  },
];

let memoryWinners = [...MEMORY_SEED_WINNERS];

export class WinnerService {
  /**
   * Get all past winning projects.
   */
  static async getAllWinners() {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('winning_projects')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          return data;
        }
      } catch (err) {
        console.warn('[WinnerService] Supabase fetch error, using memory fallback:', err.message);
      }
    }
    return memoryWinners;
  }

  /**
   * Get winner by ID.
   */
  static async getWinnerById(id) {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('winning_projects')
          .select('*')
          .eq('id', id)
          .single();

        if (!error && data) return data;
      } catch (err) {
        console.warn('[WinnerService] Supabase fetch by ID error:', err.message);
      }
    }
    return memoryWinners.find((w) => w.id === id) || null;
  }

  /**
   * Add a new winning project to the registry.
   */
  static async addWinner(winnerData) {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('winning_projects')
          .insert([winnerData])
          .select()
          .single();

        if (!error && data) return data;
      } catch (err) {
        console.warn('[WinnerService] Supabase insert error:', err.message);
      }
    }

    const newWinner = {
      id: `w-${Date.now()}`,
      ...winnerData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryWinners.push(newWinner);
    return newWinner;
  }
}
