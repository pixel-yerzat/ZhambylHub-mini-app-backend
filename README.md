# 🚀 Endpoint Hub Telegram Mini App — Backend & Verification Service

Отдельный Backend-сервис для **Telegram Mini App Hub**, обеспечивающий автоматическую интеллектуальную валидацию заявок на участие в хакатонах и мероприятиях через **Google Gemini API**, хранение данных в **Supabase** и интеграцию с **Telegram Bot / Mini App**.

---

## 🌟 Ключевые возможности и правила валидации

1. 🏆 **База победителей прошлых мероприятий**: Встроенный реестр победивших проектов с прошлых хакатонов Хаба (`winning_projects`).
2. 👥 **Мульти-заявки от одного автора**: Один участник может подавать **несколько разных** проектов (например, EdTech и AgriTech) — система одобрит обе заявки.
3. 🚫 **Защита от дубликатов**: Запрет на повторную подачу одного и того же проекта (или его перефразированной версии) от одного автора (`REJECTED_DUPLICATE`).
4. ⛔️ **Защита от плагиата победителей**: Проекты, которые уже побеждали на Хабе, автоматически выявляются и отклоняются (`REJECTED_PAST_WINNER`).
5. 🎯 **Различение общей сферы от плагиата**: Проекты в одной категории (например, оба в MedTech), но с разными решениями и архитектурой, успешно проходят проверку (`APPROVED`).
6. 🤖 **Интеграция с Telegram**:
   - Авторизация запросов из Mini App по криптографической HMAC-SHA256 подписи `initData`.
   - Push-уведомления участнику в чат-бот с понятным объяснением вердикта.
   - Уведомления администраторам с кнопками модерации (`admin_approve` / `admin_reject`) для пограничных случаев.
7. 🛡 **Отказоустойчивость**: При временной недоступности Gemini API или базы данных заявки не теряются и переводятся в статус `MANUAL_REVIEW` с локальным fallback-анализом.

---

## 📁 Структура проекта

```
endpoint-hub-telegram-mini-app/
├── database/
│   ├── schema.sql               # Схема PostgreSQL таблиц для Supabase SQL Editor
│   └── seed_winners.sql         # Тестовые данные проектов-победителей
├── src/
│   ├── bot/
│   │   └── bot.js               # Telegram бот (команды /start, /my_projects, модерация)
│   ├── config/
│   │   ├── env.js               # Валидация переменных окружения
│   │   ├── gemini.js            # Подключение к Google Generative AI (Gemini 1.5/2.0)
│   │   └── supabase.js          # Инициализация Supabase Client
│   ├── controllers/
│   │   ├── adminController.js   # Управление заявками и ручная модерация
│   │   ├── applicationController.js # Прием и обработка заявок из Mini App
│   │   └── winnerController.js  # Управление базой победителей
│   ├── middleware/
│   │   ├── errorHandler.js      # Глобальный обработчик ошибок
│   │   ├── rateLimiter.js       # Защита от спама (Express Rate Limit)
│   │   └── telegramAuth.js      # Проверка подписи Telegram initData
│   ├── routes/
│   │   ├── adminRoutes.js
│   │   ├── applicationRoutes.js
│   │   └── winnerRoutes.js
│   ├── services/
│   │   ├── applicationService.js # Оркестрация жизненного цикла заявок
│   │   ├── geminiVerification.js # Ядро: Structured JSON AI-анализ в Gemini
│   │   ├── telegramBotService.js # Отправка уведомлений в Telegram
│   │   └── winnerService.js      # Работа с реестром победителей
│   └── app.js                   # Точка входа Express сервера
├── tests/
│   └── scenarios.test.js        # Комплексный тест всех 7 бизнес-сценариев
├── .env.example
├── package.json
└── README.md
```

---

## ⚙️ Установка и запуск

### 1. Установка зависимостей
```bash
npm install
```

### 2. Настройка переменных окружения
Создайте файл `.env` на основе `.env.example`:
```env
PORT=4000
NODE_ENV=development
CORS_ORIGIN=*

# Supabase (Вставьте ваши ключи из Supabase Dashboard -> Project Settings -> API)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-service-role-or-anon-key

# Google Gemini API Key (https://aistudio.google.com/)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-1.5-flash

# Telegram Bot (от @BotFather)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_ADMIN_CHAT_ID=your_telegram_user_or_chat_id
TELEGRAM_WEBAPP_URL=https://your-telegram-mini-app-url.vercel.app
```

### 3. Инициализация базы данных в Supabase
1. Откройте **Supabase Dashboard** -> **SQL Editor**.
2. Скопируйте и выполните содержимое файла [`database/schema.sql`](database/schema.sql).
3. Скопируйте и выполните содержимое файла [`database/seed_winners.sql`](database/seed_winners.sql) для заполнения базы победителей.

### 4. Запуск тестов всех сценариев
```bash
npm run test:scenarios
```

### 5. Запуск сервера в режиме разработки
```bash
npm run dev
```

---

## 📡 REST API Эндпоинты

### 📝 Заявки проектов (`/api/applications`)
- `POST /api/applications/submit` — Подача новой заявки с автоматической AI-проверкой.
  - **Заголовки**: `x-telegram-init-data` (или `x-telegram-user-id` в Dev-режиме).
  - **Тело запроса**:
    ```json
    {
      "title": "EduQuest VR",
      "description": "Интерактивная образовательная VR-песочница для проведения лабораторных работ по физике.",
      "category": "EdTech / VR",
      "target_audience": "Школы и лицеи",
      "unique_value_prop": "Физически точные симуляции без дорогостоящего оборудования",
      "demo_link": "https://demo.example.com",
      "presentation_link": "https://pitch.example.com"
    }
    ```
- `GET /api/applications/my` — Список всех поданных проектов текущего пользователя.
- `GET /api/applications/:id` — Получение детальной информации о проекте и результатах проверки.

### 🏆 Реестр победителей (`/api/winners`)
- `GET /api/winners` — Получить список всех проектов-победителей прошлых мероприятий Хаба.
- `GET /api/winners/:id` — Получить детали проекта-победителя.
- `POST /api/winners` — Добавить новый проект-победитель в реестр.

### 🛠 Панель администратора (`/api/admin`)
- `GET /api/admin/applications?status=MANUAL_REVIEW` — Список заявок с фильтрацией.
- `PATCH /api/admin/applications/:id/status` — Ручное изменение статуса заявки (`APPROVED`, `REJECTED_DUPLICATE`, `REJECTED_PAST_WINNER`).

---

## 🧠 Логика работы AI-арбитра (Gemini API)

Gemini получает структурированный промпт с тремя блоками данных:
1. Текущая заявка кандидата.
2. Предыдущие заявки этого же участника.
3. База победителей предыдущих хакатонов.

Модель возвращает строгий JSON-ответ:
```json
{
  "verdict": "APPROVED | REJECTED_DUPLICATE | REJECTED_PAST_WINNER | MANUAL_REVIEW",
  "similarity_score": 85,
  "confidence_score": 90,
  "matched_entity_type": "WINNING_PROJECT",
  "matched_entity_id": "uuid",
  "matched_entity_title": "Smart Parking Almaty",
  "rejection_reason_ru": "Проект совпадает с проектом-победителем Smart Parking Almaty...",
  "detailed_analysis": {
    "core_idea_analysis": "...",
    "novelty_points": ["..."],
    "overlap_points": ["..."],
    "why_verdict": "..."
  }
}
```
