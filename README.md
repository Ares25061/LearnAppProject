# LearningApps Studio

Конструктор интерактивных упражнений в стиле LearningApps: создание упражнений без авторизации, редактирование и библиотека для авторизованных пользователей, экспорт в SCORM-архив.

## Что уже готово

- Next.js 16 + React 19
- MariaDB / MySQL через `mariadb`
- Локальная регистрация и вход
- Создание, сохранение и редактирование упражнений
- Экспорт SCORM-архива
- Docker-конфиг для Railway
- Отдельный MariaDB service для Railway с кастомным `my.cnf`

## Локальный запуск

1. Установите зависимости:

```bash
npm install
```

2. Создайте `.env.local` на основе `.env.example`.

3. Поднимите MySQL / MariaDB и укажите `DATABASE_URL`.

4. Запустите проект:

```bash
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000).

## Переменные окружения

Пример есть в `.env.example`.

- `SESSION_SECRET` - длинный случайный секрет для cookie-сессий
- `NEXT_PUBLIC_APP_URL` - публичный URL приложения
- `PUBLIC_APP_URL` - серверный публичный origin приложения
- `DATABASE_URL` - строка подключения `mysql://...`
- `DATABASE_POOL_LIMIT` - верхний лимит соединений пула
- `DATABASE_POOL_MIN_IDLE` - сколько idle-соединений держать постоянно
- `DATABASE_POOL_IDLE_TIMEOUT` - через сколько секунд закрывать idle-соединения

## YouTube На Railway

Для автономного SCORM-экспорта YouTube Railway часто получает bot-check от датацентрового IP. В этом случае сервису нужны свежие cookies браузера.

Самый быстрый способ обновить их из локального браузера в Railway:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync-railway-youtube-cookies.ps1 -Service LearnAppProject-branch -Environment production
```

Скрипт:

- экспортирует cookies из локального браузера через `yt-dlp`
- кладёт их в `YTDLP_YOUTUBE_COOKIES_B64` для указанного Railway service
- запускает новый deploy, если не передан `-SkipDeploys`

## MariaDB Для Railway

Если managed MySQL Railway упирается в память, можно поднять отдельный DB service из этого репозитория.

1. Создайте новый Railway service из того же репозитория.
2. Для этого service задайте `RAILWAY_DOCKERFILE_PATH=railway/mariadb/Dockerfile`.
3. Подключите Volume к `/var/lib/mysql`.
4. Задайте переменные `MARIADB_DATABASE`, `MARIADB_USER`, `MARIADB_PASSWORD`, `MARIADB_ROOT_PASSWORD`.
5. В app service укажите `DATABASE_URL` через private domain этого DB service.

Подробная инструкция лежит в [railway/mariadb/README.md](/C:/GitHub/LearnAppProject/railway/mariadb/README.md).
