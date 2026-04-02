# LearningApps Studio

Конструктор интерактивных упражнений в стиле LearningApps: создание упражнений без авторизации, редактирование и библиотека для авторизованных пользователей, экспорт в SCORM-архив.

## Что уже готово

- Next.js 16 + React 19
- SQLite через `better-sqlite3`
- Локальная регистрация и вход
- Создание, сохранение и редактирование упражнений
- Экспорт SCORM-архива
- Docker-конфиг для Railway
- Автоматическая поддержка Railway Volume для SQLite

## Локальный запуск

1. Установите зависимости:

```bash
npm install
```

2. Создайте `.env.local` на основе `.env.example`.

3. Запустите проект:

```bash
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000).

## Переменные окружения

Пример есть в `.env.example`.

- `SESSION_SECRET` - длинный случайный секрет для cookie-сессий
- `NEXT_PUBLIC_APP_URL` - публичный URL приложения
- `DATABASE_PATH` - необязательно; путь к SQLite-файлу

Локально по умолчанию база хранится в `./data/learningapps-studio.sqlite`.

На Railway приложение сначала смотрит на `DATABASE_PATH`, а если он не задан, автоматически использует `RAILWAY_VOLUME_MOUNT_PATH`, который Railway добавляет при подключении Volume.

## Публикация на GitHub

Если хотите вести этот проект как отдельный репозиторий, работайте именно в папке:

```bash
cd C:\GitHub\learningapps-studio
```

Если репозиторий еще не создан на GitHub:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<your-name>/<your-repo>.git
git branch -M main
git push -u origin main
```

Если репозиторий на GitHub уже создан, достаточно добавить `origin` и сделать `push`.

## Деплой на Railway

### 1. Подключите репозиторий

Импортируйте GitHub-репозиторий в Railway. Railway автоматически увидит `Dockerfile` в корне и соберет сервис из него. Это соответствует официальной документации Railway по Dockerfile deployment: [Dockerfiles | Railway Docs](https://docs.railway.com/deploy/dockerfiles)

### 2. Добавьте Volume

Так как проект использует SQLite, для сохранности данных нужен Volume. По документации Railway volume монтируется в файловую систему контейнера и доступен приложению по указанному пути: [Using Volumes | Railway Docs](https://docs.railway.com/guides/volumes)

Сделайте так:

1. Откройте сервис в Railway.
2. Добавьте `Volume`.
3. Укажите mount path, например `/data`.

После этого приложение само начнет хранить SQLite в `/data/learningapps-studio.sqlite`, даже если `DATABASE_PATH` не задан.

### 3. Добавьте переменные окружения

В Railway задайте:

```env
SESSION_SECRET=replace-with-a-long-random-secret
NEXT_PUBLIC_APP_URL=https://your-app.up.railway.app
```

Опционально можно задать и это:

```env
DATABASE_PATH=/data/learningapps-studio.sqlite
```

Но обычно это не требуется, если volume уже подключен.

### 4. Healthcheck

Добавьте healthcheck path:

```text
/api/health
```

Это соответствует рекомендациям Railway по healthcheck: [Healthchecks | Railway Docs](https://docs.railway.com/deployments/healthchecks)

## Production-запуск локально

```bash
npm run build
npm run start
```

## Важно

- Не коммитьте `.env.local`
- Не коммитьте папку `data/`
- Без подключенного Railway Volume SQLite будет непостоянной и данные могут потеряться после redeploy/restart
