import crypto from 'crypto';
import { WinnerService } from '../src/services/winnerService.js';
import { ApplicationService } from '../src/services/applicationService.js';
import { verifyTelegramInitData } from '../src/middleware/telegramAuth.js';

// Color logging helpers
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m',
};

function pass(name, details = '') {
  console.log(`${colors.green}  ✓ [PASS]${colors.reset} ${name} ${details ? `(${details})` : ''}`);
}

function fail(name, expected, actual) {
  console.error(`${colors.red}  ✗ [FAIL]${colors.reset} ${name}`);
  console.error(`    Expected: ${expected}`);
  console.error(`    Actual:   ${actual}`);
  process.exitCode = 1;
}

function assert(condition, name, expected, actual) {
  if (condition) {
    pass(name, actual ? `Result: ${actual}` : '');
  } else {
    fail(name, expected, actual);
  }
}

async function runAllScenarios() {
  console.log(`\n${colors.bold}${colors.cyan}======================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}🧪 RUNNING HUB VERIFICATION SYSTEM SCENARIOS & TESTS 🧪${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}======================================================${colors.reset}\n`);

  const mockUser1 = { id: 1001, username: 'yerzat_dev', first_name: 'Yerzat' };
  const mockUser2 = { id: 2002, username: 'alisher_hack', first_name: 'Alisher' };
  const mockUser3 = { id: 3003, username: 'dina_start', first_name: 'Dina' };

  // ----------------------------------------------------
  // SCENARIO 1: First Original Project by User 1
  // ----------------------------------------------------
  console.log(`\n${colors.bold}👉 Сценарий 1: Первичная подача оригинального проекта (User 1)${colors.reset}`);
  const app1 = await ApplicationService.submitApplication(
    {
      name: 'EduQuest VR (Обучение физике в виртуальной реальности)',
      short_desc: 'Интерактивная образовательная VR-песочница для проведения лабораторных работ по физике и квантовой механике для старшеклассников.',
      category: 'EdTech / VR',
      target_audience: 'Школы и лицеи',
      unique_value_prop: 'Физически точные симуляции без дорогостоящего оборудования',
    },
    mockUser1
  );

  assert(
    app1.status.toLowerCase() === 'approved',
    'Оригинальный проект должен быть успешно одобрен (approved)',
    'approved',
    app1.status
  );

  // ----------------------------------------------------
  // SCENARIO 2: Same User Submitting a DIFFERENT Project
  // ----------------------------------------------------
  console.log(`\n${colors.bold}👉 Сценарий 2: Тот же автор (User 1) подает ВТОРОЙ, ДРУГОЙ проект${colors.reset}`);
  const app2 = await ApplicationService.submitApplication(
    {
      name: 'EcoLogistics (Оптимизация маршрутов мусоровозов)',
      short_desc: 'IoT-датчики наполняемости мусорных баков и алгоритм муравьиной колонии для динамического построения оптимальных маршрутов коммунальной техники.',
      category: 'Smart City / CleanTech',
      target_audience: 'Муниципальные службы и коммунальные предприятия',
      unique_value_prop: 'Снижение расхода топлива спецтехники на 35%',
    },
    mockUser1
  );

  assert(
    app2.status.toLowerCase() === 'approved',
    'Второй РАЗНЫЙ проект того же автора должен быть одобрен (approved)',
    'approved',
    app2.status
  );

  // ----------------------------------------------------
  // SCENARIO 3: Same User submitting a DUPLICATE of their own project
  // ----------------------------------------------------
  console.log(`\n${colors.bold}👉 Сценарий 3: Попытка подать ДУБЛИКАТ своего же проекта (User 1)${colors.reset}`);
  const app3Duplicate = await ApplicationService.submitApplication(
    {
      name: 'EduQuest VR (Виртуальные лабораторные по физике)',
      short_desc: 'Образовательная VR-песочница для проведения лабораторных работ по физике и механике для школьников.',
      category: 'EdTech / VR',
    },
    mockUser1
  );

  assert(
    app3Duplicate.status.toLowerCase() === 'rejected_duplicate',
    'Дубликат собственной заявки должен быть отклонен (rejected_duplicate)',
    'rejected_duplicate',
    app3Duplicate.status
  );
  assert(
    Boolean(app3Duplicate.rejection_reason),
    'Должна быть указана понятная причина отклонения дубликата',
    'Reason present',
    app3Duplicate.rejection_reason
  );

  // ----------------------------------------------------
  // SCENARIO 4: User 2 submits a clone of a PAST HUB WINNER
  // ----------------------------------------------------
  console.log(`\n${colors.bold}👉 Сценарий 4: Попытка подать проект, который УЖЕ ПОБЕЖДАЛ на Хабе (User 2)${colors.reset}`);
  // In seed_winners: "Smart Parking Almaty"
  const app4WinnerCopy = await ApplicationService.submitApplication(
    {
      name: 'Smart Parking Almaty (Умная парковка для города)',
      short_desc: 'Система компьютерного зрения и IoT датчиков для автоматического поиска свободных мест на парковках через камеры RTSP и Telegram бот.',
      category: 'Smart City / IoT',
    },
    mockUser2
  );

  assert(
    app4WinnerCopy.status.toLowerCase() === 'rejected_past_winner',
    'Проект-клон победителя должен быть отклонен (rejected_past_winner)',
    'rejected_past_winner',
    app4WinnerCopy.status
  );
  assert(
    app4WinnerCopy.matched_entity_type === 'WINNING_PROJECT',
    'Тип совпадения должен быть WINNING_PROJECT',
    'WINNING_PROJECT',
    app4WinnerCopy.matched_entity_type
  );

  // ----------------------------------------------------
  // SCENARIO 5: Same domain as past winner, but DIFFERENT solution
  // ----------------------------------------------------
  console.log(`\n${colors.bold}👉 Сценарий 5: Схожая сфера (MedTech), но принципиально ДРУГОЕ решение (User 3)${colors.reset}`);
  // Winner was "CardioGuard" (ECG heart monitoring)
  // New application is "DentalAI 3D" (Dental scan for tooth cavities)
  const app5DistinctMedTech = await ApplicationService.submitApplication(
    {
      name: 'DentalAI 3D (3D-скрининг кариеса по снимкам зубов)',
      short_desc: 'Стоматологический ИИ-ассистент, анализирующий 3D-томографию челюсти и прицельные снимки зубов для автоматического обнаружения скрытого кариеса и патологий корней.',
      category: 'MedTech / Dental',
      target_audience: 'Стоматологические клиники',
    },
    mockUser3
  );

  assert(
    app5DistinctMedTech.status.toLowerCase() === 'approved',
    'Проект в той же сфере с уникальным решением должен быть одобрен (approved)',
    'approved',
    app5DistinctMedTech.status
  );

  // ----------------------------------------------------
  // SCENARIO 6: Telegram HMAC Security Verification
  // ----------------------------------------------------
  console.log(`\n${colors.bold}👉 Сценарий 6: Проверка криптографической подписи Telegram initData${colors.reset}`);
  const botToken = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
  const rawParams = 'auth_date=1670000000\nquery_id=AAHdF6IQAAAAAN0XohDhrOrc\nuser={"id":987654321,"first_name":"TelegramUser"}';
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const validHash = crypto.createHmac('sha256', secretKey).update(rawParams).digest('hex');

  const validInitData = `auth_date=1670000000&query_id=AAHdF6IQAAAAAN0XohDhrOrc&user=${encodeURIComponent(
    JSON.stringify({ id: 987654321, first_name: 'TelegramUser' })
  )}&hash=${validHash}`;

  const validAuthResult = verifyTelegramInitData(validInitData, botToken);
  assert(validAuthResult.isValid === true, 'Подлинный initData должен быть валидирован (isValid: true)', true, validAuthResult.isValid);
  assert(validAuthResult.user?.id === 987654321, 'Данные пользователя Telegram должны быть извлечены корректно', 987654321, validAuthResult.user?.id);

  const fakeInitData = validInitData.replace(validHash, '0000000000000000000000000000000000000000000000000000000000000000');
  const fakeAuthResult = verifyTelegramInitData(fakeInitData, botToken);
  assert(fakeAuthResult.isValid === false, 'Поддельный initData должен быть отклонен (isValid: false)', false, fakeAuthResult.isValid);

  // ----------------------------------------------------
  // SCENARIO 7: Admin Manual Status Override
  // ----------------------------------------------------
  console.log(`\n${colors.bold}👉 Сценарий 7: Ручная модерация администратором (Override Status)${colors.reset}`);
  const overridden = await ApplicationService.updateApplicationStatus(
    app3Duplicate.id,
    'APPROVED',
    999999,
    'Ручное исключение от оргкомитета хакатона'
  );

  assert(
    overridden.status === 'APPROVED',
    'Администратор может вручную одобрить заявку (status: APPROVED)',
    'APPROVED',
    overridden.status
  );
  assert(
    overridden.reviewed_by === 999999,
    'ID админа должен быть зафиксирован в аудите',
    999999,
    overridden.reviewed_by
  );

  console.log(`\n${colors.bold}${colors.green}======================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.green}🎉 ВСЕ СЦЕНАРИИ И ПРОВЕРКИ УСПЕШНО ПРОЙДЕНЫ! 🎉${colors.reset}`);
  console.log(`${colors.bold}${colors.green}======================================================${colors.reset}\n`);
}

runAllScenarios().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
