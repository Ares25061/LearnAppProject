import {
  type AnyExerciseDraft,
  type ExerciseDefinition,
  type ExerciseDraft,
  type ExerciseTypeId,
} from "@/lib/types";

export const exerciseDefinitions: ExerciseDefinition[] = [
  {
    id: "matching-pairs",
    title: "Найди пару",
    shortDescription: "Сопоставление терминов, фактов и переводов.",
    category: "Сопоставление",
    tags: ["пары", "соответствие", "карточки"],
    defaultDraft: {
      type: "matching-pairs",
      title: "Пары терминов",
      description: "Соедините элементы из левого и правого столбцов.",
      instructions: "Выберите для каждого элемента подходящую пару.",
      successMessage: "Все пары собраны верно.",
      themeColor: "#28536b",
      data: {
        pairs: [
          {
            left: "HTML",
            right: "Структура страницы",
          },
          {
            left: "CSS",
            right: "Оформление страницы",
          },
          {
            left: "JavaScript",
            right: "Поведение страницы",
          },
        ],
        extras: [],
        pairAlignment: "horizontal",
        showImmediateFeedback: false,
        autoRemoveCorrectPairs: false,
        colorByGroup: false,
      },
    },
  },
  {
    id: "group-assignment",
    title: "Классификация",
    shortDescription: "Распределение элементов по группам.",
    category: "Сортировка",
    tags: ["группы", "категории", "классификация"],
    defaultDraft: {
      type: "group-assignment",
      title: "Распредели по группам",
      description: "Разнесите элементы по нужным категориям.",
      instructions: "Для каждого элемента выберите его группу.",
      successMessage: "Все элементы оказались в нужных группах.",
      themeColor: "#41644a",
      data: {
        groups: [{ name: "Фрукты" }, { name: "Овощи" }],
        items: [
          { label: "Яблоко", groupIndex: 0 },
          { label: "Морковь", groupIndex: 1 },
          { label: "Груша", groupIndex: 0 },
        ],
      },
    },
  },
  {
    id: "timeline",
    title: "Линия времени",
    shortDescription: "Хронологическая последовательность событий.",
    category: "Порядок",
    tags: ["даты", "история", "временная шкала"],
    defaultDraft: {
      type: "timeline",
      title: "Расположите события по времени",
      description: "Проверьте знание хронологии.",
      instructions:
        "Поднимайте и опускайте карточки, чтобы выстроить дату по порядку.",
      successMessage: "Хронология восстановлена.",
      themeColor: "#8b5e34",
      data: {
        events: [
          { label: "Начало Первой мировой войны", date: "1914-07-28" },
          { label: "Высадка на Луну", date: "1969-07-20" },
          { label: "Падение Берлинской стены", date: "1989-11-09" },
        ],
      },
    },
  },
  {
    id: "simple-order",
    title: "Простой порядок",
    shortDescription: "Упорядочивание шагов или понятий.",
    category: "Порядок",
    tags: ["последовательность", "алгоритм", "этапы"],
    defaultDraft: {
      type: "simple-order",
      title: "Поставьте шаги по порядку",
      description: "Упорядочите этапы процесса.",
      instructions: "Перемещайте шаги вверх или вниз.",
      successMessage: "Порядок собран правильно.",
      themeColor: "#80489c",
      data: {
        items: [
          "Собрать требования",
          "Сделать прототип",
          "Разработать решение",
          "Проверить результат",
        ],
      },
    },
  },
  {
    id: "free-text-input",
    title: "Свободный ввод",
    shortDescription: "Один вопрос с текстовым ответом.",
    category: "Текст",
    tags: ["ответ", "ввод", "проверка"],
    defaultDraft: {
      type: "free-text-input",
      title: "Введите правильный ответ",
      description: "Короткий вопрос на ручной ввод.",
      instructions: "Введите ответ и нажмите проверку.",
      successMessage: "Ответ совпал с ожидаемым.",
      themeColor: "#1f6f8b",
      data: {
        prompt: "Столица Франции",
        answers: ["Париж"],
        caseSensitive: false,
      },
    },
  },
  {
    id: "matching-images",
    title: "Пары по изображениям",
    shortDescription: "Связка картинок и подписей.",
    category: "Сопоставление",
    tags: ["изображения", "подписи", "ассоциации"],
    defaultDraft: {
      type: "matching-images",
      title: "Подберите подписи к изображениям",
      description: "Используется для географии, биологии и техник.",
      instructions: "Выберите подпись для каждой картинки.",
      successMessage: "Все изображения подписаны верно.",
      themeColor: "#d95d39",
      data: {
        pairs: [
          {
            imageUrl:
              "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=800&q=80",
            answer: "Пустыня",
          },
          {
            imageUrl:
              "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=80",
            answer: "Лес",
          },
        ],
      },
    },
  },
  {
    id: "multiple-choice",
    title: "Викторина с выбором",
    shortDescription: "Набор вопросов с вариантами ответа.",
    category: "Тест",
    tags: ["quiz", "варианты", "вопросы"],
    defaultDraft: {
      type: "multiple-choice",
      title: "Мини-викторина",
      description: "Один или несколько тестовых вопросов.",
      instructions:
        "Выберите вариант для каждого вопроса и проверьте результат.",
      successMessage: "Викторина пройдена успешно.",
      themeColor: "#ef5b5b",
      data: {
        questions: [
          {
            prompt: "Какой язык выполняется в браузере напрямую?",
            options: ["JavaScript", "Python", "C#", "Go"],
            correctIndex: 0,
            explanation:
              "JavaScript выполняется браузером без дополнительного сервера.",
          },
          {
            prompt: "Что из этого является базой данных?",
            options: ["PostgreSQL", "React", "Figma", "Vite"],
            correctIndex: 0,
            explanation: "PostgreSQL — это СУБД.",
          },
        ],
      },
    },
  },
  {
    id: "cloze-text",
    title: "Текст с пропусками",
    shortDescription: "Заполнение пропусков внутри текста.",
    category: "Текст",
    tags: ["cloze", "пропуски", "контекст"],
    defaultDraft: {
      type: "cloze-text",
      title: "Заполните пропуски",
      description: "Ответы берутся прямо из контекста.",
      instructions:
        "Слова для ответа запишите в пропуски, оформленные в двойных квадратных скобках.",
      successMessage: "Все пропуски заполнены верно.",
      themeColor: "#15616d",
      data: {
        text: "Веб-страница описывается языком [[HTML]], а оформление задается через [[CSS]].",
      },
    },
  },
  {
    id: "media-notices",
    title: "Аудио или видео с заметками",
    shortDescription: "Вопросы к медиаконтенту с таймкодами.",
    category: "Медиа",
    tags: ["audio", "video", "таймкоды"],
    defaultDraft: {
      type: "media-notices",
      title: "Посмотрите материал и ответьте",
      description: "Подходит для разбора лекций и интервью.",
      instructions: "Перейдите к нужным таймкодам и ответьте на вопросы.",
      successMessage: "Ответы к медиазаметкам совпали.",
      themeColor: "#005f73",
      data: {
        mediaKind: "video",
        mediaUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
        notices: [
          {
            timestamp: "00:05",
            title: "Начало ролика",
            question: "Какой объект появляется в начале?",
            answer: "Видео",
          },
          {
            timestamp: "00:10",
            title: "Середина",
            question: "Какой формат используется в примере?",
            answer: "mp4",
          },
        ],
      },
    },
  },
  {
    id: "millionaire-game",
    title: "Кто хочет стать миллионером",
    shortDescription: "Пошаговая викторина с нарастающей стоимостью.",
    category: "Игра",
    tags: ["миллионер", "квиз", "этапы"],
    defaultDraft: {
      type: "millionaire-game",
      title: "Игра на очки",
      description: "Последовательные вопросы с лестницей призов.",
      instructions: "Отвечайте по очереди. Ошибка завершает игру.",
      successMessage: "Вы прошли всю лестницу вопросов.",
      themeColor: "#0f4c5c",
      data: {
        questions: [
          {
            prompt: "Сколько дней в високосном году?",
            options: ["364", "365", "366", "367"],
            correctIndex: 2,
          },
          {
            prompt: "Что хранит Git?",
            options: [
              "Историю версий",
              "Только картинки",
              "Электронную почту",
              "Пароли",
            ],
            correctIndex: 0,
          },
          {
            prompt: "Что такое API?",
            options: [
              "Интерфейс для взаимодействия программ",
              "Графический редактор",
              "ОС",
              "Браузер",
            ],
            correctIndex: 0,
          },
        ],
      },
    },
  },
  {
    id: "group-puzzle",
    title: "Групповой пазл",
    shortDescription: "Классификация с постепенным открытием результата.",
    category: "Сортировка",
    tags: ["пазл", "группы", "раскрытие"],
    defaultDraft: {
      type: "group-puzzle",
      title: "Соберите пазл по группам",
      description:
        "За каждый верный элемент открывается часть результата.",
      instructions:
        "Разнесите элементы по группам, чтобы открыть скрытое изображение или фразу.",
      successMessage: "Пазл полностью раскрыт.",
      themeColor: "#7f5539",
      data: {
        imageUrl:
          "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
        revealText: "Отлично, классификация завершена.",
        groups: [
          { name: "Языки разметки" },
          { name: "Языки программирования" },
        ],
        items: [
          { label: "HTML", groupIndex: 0 },
          { label: "JavaScript", groupIndex: 1 },
          { label: "Markdown", groupIndex: 0 },
          { label: "TypeScript", groupIndex: 1 },
        ],
      },
    },
  },
  {
    id: "crossword",
    title: "Кроссворд",
    shortDescription: "Сетка слов по подсказкам.",
    category: "Слова",
    tags: ["кроссворд", "слова", "подсказки"],
    defaultDraft: {
      type: "crossword",
      title: "Кроссворд по теме",
      description: "Введите ответы в клетки по подсказкам.",
      instructions: "Ориентируйтесь на сетку и список вопросов.",
      successMessage: "Кроссворд решен.",
      themeColor: "#33415c",
      data: {
        entries: [
          {
            answer: "сервер",
            clue: "Компьютер или процесс, отвечающий на запросы",
          },
          { answer: "клиент", clue: "Сторона, которая отправляет запрос" },
          { answer: "домен", clue: "Текстовый адрес сайта" },
        ],
      },
    },
  },
  {
    id: "word-grid",
    title: "Сетка слов",
    shortDescription: "Поиск слов в буквенном поле.",
    category: "Слова",
    tags: ["поиск слов", "буквы", "сетка"],
    defaultDraft: {
      type: "word-grid",
      title: "Найдите слова в сетке",
      description: "Выделяйте слова по двум крайним буквам.",
      instructions:
        "Щелкните начальную и конечную букву слова в сетке.",
      successMessage: "Все слова найдены.",
      themeColor: "#3d405b",
      data: {
        words: ["алгоритм", "код", "сервер", "клиент"],
        gridSize: 12,
      },
    },
  },
  {
    id: "where-is-what",
    title: "Где что находится",
    shortDescription: "Поиск объектов на изображении по меткам.",
    category: "Медиа",
    tags: ["карта", "изображение", "горячие точки"],
    defaultDraft: {
      type: "where-is-what",
      title: "Найдите объекты на изображении",
      description: "Подходит для карт, схем и интерфейсов.",
      instructions:
        "Выберите метку и кликните по нужной точке на изображении.",
      successMessage: "Все точки отмечены правильно.",
      themeColor: "#2d6a4f",
      data: {
        imageUrl:
          "https://images.unsplash.com/photo-1526778548025-fa2f459cd5ce?auto=format&fit=crop&w=1000&q=80",
        hotspots: [
          { label: "Север", x: 53, y: 18 },
          { label: "Центр", x: 49, y: 48 },
          { label: "Юг", x: 51, y: 78 },
        ],
      },
    },
  },
  {
    id: "guess-the-word",
    title: "Угадай слово",
    shortDescription: "Одно слово по подсказке.",
    category: "Слова",
    tags: ["слово", "догадка", "подсказка"],
    defaultDraft: {
      type: "guess-the-word",
      title: "Угадайте слово",
      description: "Игровой формат с буквами и подсказкой.",
      instructions:
        "Введите слово целиком или подбирайте его по подсказке.",
      successMessage: "Слово угадано.",
      themeColor: "#9a031e",
      data: {
        word: "интерфейс",
        clue: "То, через что пользователь взаимодействует с системой.",
      },
    },
  },
  {
    id: "horse-race",
    title: "Скачки",
    shortDescription: "Соревнование с правильными ответами.",
    category: "Игра",
    tags: ["гонка", "соревнование", "квиз"],
    defaultDraft: {
      type: "horse-race",
      title: "Гонка знаний",
      description: "Ваш конь движется вперед за правильные ответы.",
      instructions: "Отвечайте на вопросы быстрее соперников.",
      successMessage: "Ваш конь пришел первым.",
      themeColor: "#bc6c25",
      data: {
        trackLength: 10,
        opponents: 3,
        questions: [
          {
            prompt:
              "Что используется для описания внешнего вида страницы?",
            options: ["CSS", "SQL", "Bash", "HTTP"],
            correctIndex: 0,
          },
          {
            prompt:
              "Какой протокол обычно применяют для защищенного сайта?",
            options: ["FTP", "HTTP", "HTTPS", "SSH"],
            correctIndex: 2,
          },
          {
            prompt: "Что такое JSON?",
            options: [
              "Формат обмена данными",
              "База данных",
              "Язык стилей",
              "Браузер",
            ],
            correctIndex: 0,
          },
        ],
      },
    },
  },
  {
    id: "pairing-game",
    title: "Игра на запоминание",
    shortDescription: "Карточки memory на поиск совпадений.",
    category: "Игра",
    tags: ["memory", "карточки", "память"],
    defaultDraft: {
      type: "pairing-game",
      title: "Открой пары",
      description:
        "Игра на запоминание расположения карточек.",
      instructions:
        "Открывайте по две карточки и ищите совпадения.",
      successMessage: "Все пары открыты.",
      themeColor: "#5f0f40",
      data: {
        pairs: [
          { front: "HTML", back: "Структура" },
          { front: "CSS", back: "Стили" },
          { front: "JS", back: "Логика" },
        ],
      },
    },
  },
  {
    id: "guess",
    title: "Угадай",
    shortDescription: "Приблизительная оценка числового ответа.",
    category: "Числа",
    tags: ["оценка", "приближение", "числа"],
    defaultDraft: {
      type: "guess",
      title: "Оцените значение",
      description:
        "Пользователь вводит число в допустимом диапазоне.",
      instructions:
        "Введите предположение. Ответ засчитается, если попадет в заданную погрешность.",
      successMessage:
        "Значение угадано в допустимом диапазоне.",
      themeColor: "#355070",
      data: {
        prompt: "Сколько планет в Солнечной системе?",
        answer: 8,
        tolerance: 0,
        unit: "шт.",
        hints: [
          "Подсказка: Плутон теперь относится к другой категории.",
        ],
      },
    },
  },
  {
    id: "matching-matrix",
    title: "Матрица соответствий",
    shortDescription:
      "Таблица с несколькими правильными пересечениями.",
    category: "Сопоставление",
    tags: ["матрица", "таблица", "множественный выбор"],
    defaultDraft: {
      type: "matching-matrix",
      title: "Отметьте соответствия",
      description:
        "Подходит для задач, где у строки несколько верных связей.",
      instructions:
        "Установите флажки в правильных ячейках матрицы.",
      successMessage: "Матрица заполнена верно.",
      themeColor: "#6d597a",
      data: {
        rows: ["HTML", "CSS", "JavaScript"],
        columns: ["Разметка", "Стили", "Логика"],
        correctCells: [
          { row: 0, column: 0 },
          { row: 1, column: 1 },
          { row: 2, column: 2 },
        ],
      },
    },
  },
  {
    id: "fill-table",
    title: "Заполни таблицу",
    shortDescription:
      "Таблица с пустыми ячейками для ручного ввода.",
    category: "Текст",
    tags: ["таблица", "заполнение", "ячейки"],
    defaultDraft: {
      type: "fill-table",
      title: "Заполните таблицу",
      description:
        "Проверка знаний по строкам и столбцам.",
      instructions: "Введите значения только в пустые клетки.",
      successMessage: "Таблица заполнена корректно.",
      themeColor: "#588157",
      data: {
        columns: ["Технология", "Назначение", "Среда"],
        rows: [
          {
            label: "Строка 1",
            cells: ["HTML", "Разметка", "Браузер"],
            blanks: [1],
          },
          {
            label: "Строка 2",
            cells: ["Node.js", "Серверный JavaScript", "Сервер"],
            blanks: [2],
          },
        ],
      },
    },
  },
  {
    id: "quiz-text-input",
    title: "Викторина с вводом текста",
    shortDescription:
      "Набор вопросов, где ответы пишутся вручную.",
    category: "Текст",
    tags: ["викторина", "ввод", "несколько вопросов"],
    defaultDraft: {
      type: "quiz-text-input",
      title: "Ответьте текстом",
      description:
        "Подходит для кратких проверочных работ.",
      instructions:
        "Для каждого вопроса введите свой ответ.",
      successMessage: "Все текстовые ответы совпали.",
      themeColor: "#4361ee",
      data: {
        questions: [
          {
            prompt:
              "Как называется хранилище версий кода?",
            answers: ["репозиторий", "repository"],
          },
          {
            prompt: "Какой тег задает ссылку в HTML?",
            answers: ["a", "<a>"],
          },
        ],
      },
    },
  },
];

export const exerciseDefinitionMap = Object.fromEntries(
  exerciseDefinitions.map((definition) => [definition.id, definition]),
) as Record<ExerciseTypeId, ExerciseDefinition>;

export function isExerciseTypeId(value: string): value is ExerciseTypeId {
  return value in exerciseDefinitionMap;
}

export function createDefaultDraft<T extends ExerciseTypeId>(
  type: T,
): ExerciseDraft<T> {
  const draft = structuredClone(
    exerciseDefinitionMap[type].defaultDraft as ExerciseDraft<T>,
  );

  if (
    type === "matching-pairs" &&
    Array.isArray((draft as ExerciseDraft<"matching-pairs">).data.pairs)
  ) {
    (draft as ExerciseDraft<"matching-pairs">).data.pairs = (
      draft as ExerciseDraft<"matching-pairs">
    ).data.pairs.slice(0, 2);
  }

  return draft;
}

export function parseDraft(input: unknown): AnyExerciseDraft | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const raw = input as Record<string, unknown>;

  if (typeof raw.type !== "string" || !isExerciseTypeId(raw.type)) {
    return null;
  }

  const draft = createDefaultDraft(raw.type);

  if (typeof raw.title === "string" && raw.title.trim()) {
    draft.title = raw.title.trim();
  }

  if (typeof raw.description === "string") {
    draft.description = raw.description;
  }

  if (typeof raw.instructions === "string") {
    draft.instructions = raw.instructions;
  }

  if (typeof raw.successMessage === "string") {
    draft.successMessage = raw.successMessage;
  }

  if (typeof raw.themeColor === "string" && raw.themeColor) {
    draft.themeColor = raw.themeColor;
  }

  if (raw.data && typeof raw.data === "object") {
    draft.data = structuredClone(raw.data) as typeof draft.data;
  }

  return draft as AnyExerciseDraft;
}
