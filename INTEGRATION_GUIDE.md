# 📖 Руководство по интеграции Backend API для Telegram Mini App (Zhambyl Hub)

Данный документ содержит полное техническое описание и готовые примеры кода для разработчика **Telegram Mini App** (`hub-telegram-mini-app`) для подключения к сервису автоматической проверки проектов через **Google Gemini AI** и базы данных **Supabase**.

---

## 📌 Общие сведения

- **Базовый URL Backend:** `http://localhost:4000` (локально) или `https://your-backend-domain.com` (в проде)
- **Content-Type:** `application/json`
- **Аутентификация:** Через заголовок `x-telegram-init-data` (встроенный объект `window.Telegram.WebApp.initData`).

---

## 🔐 1. Авторизация запросов из Telegram Mini App

Каждый запрос к защищенным эндпоинтам должен содержать криптографическую строку `initData` от Telegram WebApp:

```javascript
// Передача заголовка в fetch / axios
const headers = {
  'Content-Type': 'application/json',
  'x-telegram-init-data': window.Telegram?.WebApp?.initData || '',
  // Для тестирования в обычном браузере без Telegram можно передавать:
  // 'x-telegram-user-id': '682910412'
};
```

---

## 📡 2. Эндпоинты API

### 🚀 2.1. Подача проекта на проверку и регистрация

Отправляет проект на моментальный интеллектуальный анализ в **Google Gemini AI**. Сервис проверяет:
1. Не является ли проект дубликатом ранее поданного этим же автором.
2. Не повторяет ли проект победителей прошлых хакатонов Хаба.
3. Допускает подачу **нескольких РАЗНЫХ проектов** от одного автора.

- **Метод:** `POST`
- **URL:** `/api/applications/submit`
- **Заголовки:** `x-telegram-init-data: <initData>`

#### 📥 Тело запроса (JSON):
```json
{
  "name": "EduQuest VR",
  "short_desc": "Интерактивная образовательная VR-песочница для проведения лабораторных работ по физике для школьников.",
  "category": "EdTech",
  "stage": "MVP / Prototype",
  "tag": "Startup",
  "founder_name": "Ерзат Сериков",
  "founder_phone": "+77051234567",
  "founder_role": "Founder & Team Lead",
  "team_members": "Ерзат (Lead), Алишер (Backend), Данияр (3D Artist)",
  "pdf_deck_url": "https://your-supabase.co/storage/v1/object/public/pitch_decks/eduquest.pdf",
  "demo_url": "https://eduquest-demo.kz",
  "logo_icon": "🎓",
  "event_id": "optional-uuid-of-event",
  "event_title": "Zhambyl Hub Hackathon Spring 2026"
}
```

---

#### 📤 Примеры ответов:

##### ✅ 1. Успешное одобрение (Статус 201 Created):
```json
{
  "success": true,
  "message": "Заявка успешно одобрена и зарегистрирована!",
  "data": {
    "id": "proj-1772616800-4821",
    "name": "EduQuest VR",
    "status": "approved",
    "similarity_score": 12.5,
    "rejection_reason": null,
    "matched_entity_title": null,
    "ai_analysis": {
      "verdict": "APPROVED",
      "similarity_score": 12.5,
      "confidence_score": 95,
      "detailed_analysis": {
        "core_idea_analysis": "Проект оригинален и обладает новизной.",
        "novelty_points": ["Использование VR симуляций", "Интерактивная физика"],
        "why_verdict": "Проект прошел проверку на уникальность."
      }
    },
    "created_at": "2026-09-02T10:00:00.000Z"
  }
}
```

##### ⚠️ 2. Отклонено: Дубликат собственной заявки (Статус 201 Created):
```json
{
  "success": true,
  "message": "Заявка отклонена в соответствии с правилами Хаба.",
  "data": {
    "id": "proj-1772616800-4822",
    "name": "EduQuest VR (Виртуальная физика)",
    "status": "rejected_duplicate",
    "similarity_score": 88.0,
    "rejection_reason": "Вы уже подавали похожий проект 'EduQuest VR'. Один и тот же проект нельзя подавать повторно.",
    "matched_entity_title": "EduQuest VR",
    "created_at": "2026-09-02T10:05:00.000Z"
  }
}
```

##### ⛔️ 3. Отклонено: Проект уже побеждал на Хабе (Статус 201 Created):
```json
{
  "success": true,
  "message": "Заявка отклонена в соответствии с правилами Хаба.",
  "data": {
    "id": "proj-1772616800-4823",
    "name": "Smart Parking Almaty",
    "status": "rejected_past_winner",
    "similarity_score": 92.0,
    "rejection_reason": "Проект имеет критическое сходство с проектом-победителем 'Smart Parking Almaty' (Hub Hackathon Spring 2024). Ранее побеждавшие проекты не допускаются к участию.",
    "matched_entity_title": "Smart Parking Almaty",
    "created_at": "2026-09-02T10:10:00.000Z"
  }
}
```

##### ⏳ 4. Спорный случай / На рассмотрении жюри (Статус 201 Created):
```json
{
  "success": true,
  "message": "Заявка отправлена на ручную модерацию экспертов.",
  "data": {
    "id": "proj-1772616800-4824",
    "name": "AI Dental Scanner",
    "status": "manual_review",
    "similarity_score": 65.0,
    "rejection_reason": null,
    "created_at": "2026-09-02T10:15:00.000Z"
  }
}
```

---

### 📋 2.2. Получение списка проектов текущего пользователя

Возвращает все проекты, созданные текущим авторизованным пользователем Telegram.

- **Метод:** `GET`
- **URL:** `/api/applications/my`
- **Заголовки:** `x-telegram-init-data: <initData>`

#### 📤 Ответ:
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "id": "proj-1",
      "name": "EduQuest VR",
      "category": "EdTech",
      "status": "approved",
      "similarity_score": 12.0,
      "pdf_deck_url": "https://...",
      "created_at": "2026-09-02T10:00:00.000Z"
    },
    {
      "id": "proj-2",
      "name": "EcoLogistics",
      "category": "CleanTech",
      "status": "approved",
      "similarity_score": 15.0,
      "pdf_deck_url": "https://...",
      "created_at": "2026-09-02T10:30:00.000Z"
    }
  ]
}
```

---

### 🏆 2.3. Реестр победителей прошлых мероприятий

Позволяет отображать на витрине Mini App список легендарных проектов-победителей прошлых хакатонов Хаба.

- **Метод:** `GET`
- **URL:** `/api/winners`

#### 📤 Ответ:
```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "id": "w-1",
      "title": "Smart Parking Almaty (Умная парковка)",
      "description": "Система компьютерного зрения и IoT для поиска парковочных мест...",
      "category": "Smart City / IoT",
      "event_name": "Hub Hackathon Spring 2024",
      "year_or_date": "2024",
      "winning_track": "1st Place Best Smart City Solution",
      "key_features": ["RTSP камеры", "ML прогноз", "Telegram WebApp"]
    }
  ]
}
```

---

## 💻 3. Готовый JavaScript / React сервис для Frontend (`src/services/api.js`)

Скопируйте этот модуль в проект `hub-telegram-mini-app`:

```javascript
// src/services/hubApi.js

const API_BASE_URL = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:4000';

/**
 * Получение стандартных заголовков с Telegram initData
 */
function getHeaders() {
  const initData = window.Telegram?.WebApp?.initData || '';
  return {
    'Content-Type': 'application/json',
    'x-telegram-init-data': initData,
  };
}

export const hubApi = {
  /**
   * Отправка проекта на регистрацию и проверку через Gemini AI
   */
  async submitProject(projectData) {
    const response = await fetch(`${API_BASE_URL}/api/applications/submit`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(projectData),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Ошибка при отправке проекта');
    }
    return result;
  },

  /**
   * Получить список моих проектов
   */
  async getMyProjects() {
    const response = await fetch(`${API_BASE_URL}/api/applications/my`, {
      method: 'GET',
      headers: getHeaders(),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Не удалось загрузить проекты');
    }
    return result.data;
  },

  /**
   * Получить список победителей прошлых мероприятий
   */
  async getPastWinners() {
    const response = await fetch(`${API_BASE_URL}/api/winners`);
    const result = await response.json();
    return result.data || [];
  },
};
```

---

## 🎨 4. Рекомендации по UX/UI в интерфейсе Mini App

### 1. Обработка процесса отправки формы:
- При клике на кнопку **"Отправить проект"** покажите оверлей/лоадер:  
  *«🤖 AI-арбитр Gemini анализирует проект на оригинальность...»*
- Вызовите виброотклик Telegram:
  `window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success')`

### 2. Цветовые бейджи для статусов проекта:
| Статус | Текст бейджа | Цвет UI | Действие при клике |
| :--- | :--- | :--- | :--- |
| `approved` | ✅ Одобрен | Зеленый (`#10B981`) | Проект допущен к защите |
| `rejected_duplicate` | ⚠️ Отклонен (Дубликат) | Оранжевый (`#F59E0B`) | Открыть модалку с `rejection_reason` |
| `rejected_past_winner` | ⛔️ Отклонен (Победитель) | Красный (`#EF4444`) | Пояснение о запрете повторной подачи |
| `manual_review` | ⏳ На рассмотрении | Синий (`#3B82F6`) | Показать «Ожидает проверки жюри» |
| `pending` | 🕒 Обработка | Серый (`#6B7280`) | Идет проверка |

---

## ❓ FAQ для разработчика Mini App

1. **Что делать, если пользователь подает 2-й проект?**  
   Просто вызывайте `hubApi.submitProject(secondProject)`. Бэкенд проверит, что он отличается от 1-го, и одобрит его.
2. **Как тестировать с компьютера без Telegram?**  
   В бэкенде включен dev-режим. Если `x-telegram-init-data` пуст, можно передавать заголовок `x-telegram-user-id: 682910412`.
3. **Приходят ли уведомления в Telegram?**  
   Да! Как только бэкенд завершает проверку, Telegram Bot автоматически отправляет красивое сообщение участнику в чат.
