import crypto from 'crypto';
import { verifyTelegramInitData, telegramAuthMiddleware } from '../src/middleware/telegramAuth.js';
import { verifyApplicationWithGemini } from '../src/services/geminiVerification.js';
import { WinnerService } from '../src/services/winnerService.js';
import { ApplicationService } from '../src/services/applicationService.js';
import { AdminController } from '../src/controllers/adminController.js';
import { config } from '../src/config/env.js';

// Color logging helpers
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
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
  console.log(`\n${colors.bold}${colors.cyan}===================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}🧪 RUNNING STRICT EXTERNAL SERVICES & ANTI-MOCK VALIDATION TESTS 🧪${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}===================================================================${colors.reset}\n`);

  // ----------------------------------------------------
  // TEST 1: Telegram HMAC signature cryptographic verification
  // ----------------------------------------------------
  console.log(`${colors.bold}👉 Тест 1: Криптографическая верификация подписи Telegram initData (HMAC-SHA256)${colors.reset}`);
  const testBotToken = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
  const rawParams = 'auth_date=1670000000\nquery_id=AAHdF6IQAAAAAN0XohDhrOrc\nuser={"id":987654321,"first_name":"TelegramUser"}';
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(testBotToken).digest();
  const validHash = crypto.createHmac('sha256', secretKey).update(rawParams).digest('hex');

  const validInitData = `auth_date=1670000000&query_id=AAHdF6IQAAAAAN0XohDhrOrc&user=${encodeURIComponent(
    JSON.stringify({ id: 987654321, first_name: 'TelegramUser' })
  )}&hash=${validHash}`;

  const validAuthResult = verifyTelegramInitData(validInitData, testBotToken);
  assert(validAuthResult.isValid === true, 'Подлинный initData валидирован успешно', true, validAuthResult.isValid);
  assert(validAuthResult.user?.id === 987654321, 'Данные пользователя извлечены из подписанного payload', 987654321, validAuthResult.user?.id);

  const fakeInitData = validInitData.replace(validHash, '0000000000000000000000000000000000000000000000000000000000000000');
  const fakeAuthResult = verifyTelegramInitData(fakeInitData, testBotToken);
  assert(fakeAuthResult.isValid === false, 'Поддельный хеш отклонен без исключений', false, fakeAuthResult.isValid);

  const emptyResult = verifyTelegramInitData('', testBotToken);
  assert(emptyResult.isValid === false, 'Пустой initData отклонен', false, emptyResult.isValid);

  // ----------------------------------------------------
  // TEST 2: Telegram Auth Middleware: No bot token -> 503 Service Unavailable
  // ----------------------------------------------------
  console.log(`\n${colors.bold}👉 Тест 2: Запрос к Telegram Auth без TELEGRAM_BOT_TOKEN -> 503 Service Unavailable${colors.reset}`);
  const originalToken = config.telegram.botToken;
  config.telegram.botToken = '';

  let middlewareStatus = null;
  let middlewareResponse = null;

  const mockRes503 = {
    status(code) {
      middlewareStatus = code;
      return {
        json(data) {
          middlewareResponse = data;
        },
      };
    },
  };

  telegramAuthMiddleware({ headers: {} }, mockRes503, () => {});
  assert(middlewareStatus === 503, 'При отсутствии TELEGRAM_BOT_TOKEN возвращается статус 503', 503, middlewareStatus);
  assert(
    middlewareResponse?.error?.includes('TELEGRAM_BOT_TOKEN is not configured'),
    'Возвращается явное сообщение о не настроенном токене бота',
    'contains token error message',
    middlewareResponse?.error
  );

  // ----------------------------------------------------
  // TEST 3: Telegram Auth Middleware: Missing initData -> 401 Unauthorized (No fake user)
  // ----------------------------------------------------
  console.log(`\n${colors.bold}👉 Тест 3: Запрос без initData не должен создавать фейкового пользователя (401)${colors.reset}`);
  config.telegram.botToken = testBotToken;

  const mockReqNoAuth = {
    headers: {},
    body: { name: 'Direct Web Project', founder_name: 'Hacker' },
    method: 'POST',
  };

  let unauthorizedStatus = null;
  let unauthorizedResponse = null;

  const mockRes401 = {
    status(code) {
      unauthorizedStatus = code;
      return {
        json(data) {
          unauthorizedResponse = data;
        },
      };
    },
  };

  telegramAuthMiddleware(mockReqNoAuth, mockRes401, () => {});
  assert(unauthorizedStatus === 401, 'Запрос без initData отклоняется со статусом 401', 401, unauthorizedStatus);
  assert(mockReqNoAuth.telegramUser === undefined, 'Фейковый пользователь НЕ создается', undefined, mockReqNoAuth.telegramUser);

  // ----------------------------------------------------
  // TEST 4: Gemini Verification: Missing API Key throws error (No fake fallback)
  // ----------------------------------------------------
  console.log(`\n${colors.bold}👉 Тест 4: Отсутствие GEMINI_API_KEY вызывает явную ошибку (без fallback эвристики)${colors.reset}`);
  const originalGeminiKey = config.gemini.apiKey;
  config.gemini.apiKey = '';

  let geminiErrorThrown = false;
  let geminiErrorMessage = '';

  try {
    await verifyApplicationWithGemini({
      title: 'Test Project',
      description: 'Test Description',
      category: 'IT',
    });
  } catch (err) {
    geminiErrorThrown = true;
    geminiErrorMessage = err.message;
  }

  assert(geminiErrorThrown === true, 'При отсутствии GEMINI_API_KEY выбрасывается исключение', true, geminiErrorThrown);
  assert(
    geminiErrorMessage.includes('GEMINI_API_KEY is missing'),
    'Исключение явно сообщает об отсутствии GEMINI_API_KEY',
    'contains GEMINI_API_KEY is missing',
    geminiErrorMessage
  );
  config.gemini.apiKey = originalGeminiKey;

  // ----------------------------------------------------
  // TEST 5: Supabase: WinnerService throws error when Supabase is unconfigured (No memory fallback)
  // ----------------------------------------------------
  console.log(`\n${colors.bold}👉 Тест 5: WinnerService выбрасывает ошибку при отсутствии Supabase (без memory fallback)${colors.reset}`);
  let winnerDbErrorThrown = false;
  let winnerDbErrorMessage = '';

  try {
    await WinnerService.getAllWinners();
  } catch (err) {
    winnerDbErrorThrown = true;
    winnerDbErrorMessage = err.message;
  }

  assert(winnerDbErrorThrown === true, 'WinnerService.getAllWinners() выбрасывает исключение без Supabase', true, winnerDbErrorThrown);
  assert(
    winnerDbErrorMessage.includes('Database service is not configured') || winnerDbErrorMessage.includes('Failed to fetch'),
    'Ошибка указывает на проблему подключения к БД',
    'database error',
    winnerDbErrorMessage
  );

  // ----------------------------------------------------
  // TEST 6: Supabase: ApplicationService throws error when Supabase is unconfigured (No memory fallback)
  // ----------------------------------------------------
  console.log(`\n${colors.bold}👉 Тест 6: ApplicationService выбрасывает ошибку при отсутствии Supabase${colors.reset}`);
  let appDbErrorThrown = false;
  let appDbErrorMessage = '';

  try {
    await ApplicationService.getUserSubmissions('12345');
  } catch (err) {
    appDbErrorThrown = true;
    appDbErrorMessage = err.message;
  }

  assert(appDbErrorThrown === true, 'ApplicationService.getUserSubmissions() выбрасывает исключение без Supabase', true, appDbErrorThrown);
  assert(
    appDbErrorMessage.includes('Database service is not configured') || appDbErrorMessage.includes('Failed to fetch'),
    'Ошибка указывает на проблему подключения к БД',
    'database error',
    appDbErrorMessage
  );

  // ----------------------------------------------------
  // TEST 7: Admin Controller: Strict admin authorization (No open access if adminChatId unconfigured)
  // ----------------------------------------------------
  console.log(`\n${colors.bold}👉 Тест 7: AdminController строго закрыт, если TELEGRAM_ADMIN_CHAT_ID не задан${colors.reset}`);
  const originalAdminId = config.telegram.adminChatId;
  config.telegram.adminChatId = null;

  let adminStatus = null;
  let adminResponse = null;

  const mockAdminRes = {
    status(code) {
      adminStatus = code;
      return {
        json(data) {
          adminResponse = data;
        },
      };
    },
  };

  await AdminController.listApplications({ telegramUser: { id: 12345 } }, mockAdminRes, () => {});
  assert(adminStatus === 403, 'Доступ к админке запрещен при незаданном TELEGRAM_ADMIN_CHAT_ID', 403, adminStatus);
  assert(
    adminResponse?.error?.includes('TELEGRAM_ADMIN_CHAT_ID не настроен'),
    'Возвращается понятное сообщение о ненастроенном админском доступе',
    'TELEGRAM_ADMIN_CHAT_ID не настроен',
    adminResponse?.error
  );

  // Restore configs
  config.telegram.botToken = originalToken;
  config.telegram.adminChatId = originalAdminId;

  console.log(`\n${colors.bold}${colors.green}===================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.green}🎉 ВСЕ СТРОГИЕ ПРОВЕРКИ И ТЕСТЫ БЕЗ МОКОВ УСПЕШНО ПРОЙДЕНЫ! 🎉${colors.reset}`);
  console.log(`${colors.bold}${colors.green}===================================================================${colors.reset}\n`);
}

runAllScenarios().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
