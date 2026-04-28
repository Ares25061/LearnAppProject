import Link from "next/link";
import { HomeHeroBackground } from "@/components/home-hero-background";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/auth";
import { listAppsByOwner } from "@/lib/apps";
import { formatDateTime } from "@/lib/utils";

const WORKFLOW_STEPS = [
  {
    label: "Шаг 1",
    title: "Выберите шаблон",
    text: "Откройте каталог шаблонов и подберите формат упражнения под свою задачу.",
  },
  {
    label: "Шаг 2",
    title: "Заполните содержимое",
    text: "Добавьте карточки, текст, медиа и параметры игры в редакторе нужного шаблона.",
  },
  {
    label: "Шаг 3",
    title: "Проверьте и запустите",
    text: "Откройте превью, сохраните упражнение в библиотеку, экспортируйте его и запускайте в любой момент.",
  },
];

const GUEST_BENEFITS = [
  {
    label: "Каталог",
    title: "Все шаблоны в одном месте",
    text: "Можно посмотреть доступные форматы и быстро перейти к нужному типу упражнения.",
  },
  {
    label: "Редактор",
    title: "Простой редактор содержимого",
    text: "В шаблонах доступны карточки, текст, изображения, аудио, видео и игровые настройки.",
  },
  {
    label: "Библиотека",
    title: "Сохранение после входа",
    text: "После авторизации упражнения попадают в библиотеку, где их можно редактировать и запускать снова.",
  },
];

export default async function Home() {
  const user = await getCurrentUser();
  const recentApps = user ? (await listAppsByOwner(user.id)).slice(0, 6) : [];

  return (
    <div className="page-shell">
      <SiteHeader user={user} />
      <main className="page-content home-page">
        <section className="hero-card home-hero">
          <HomeHeroBackground />
          <div className="home-hero__layout">
            <div className="home-hero__copy">
              <h1>
                <span className="home-hero__headline-row">Создавайте упражнения,</span>
                <span className="home-hero__headline-row">экспортируйте в МЭШ</span>
                <span className="home-hero__headline-row">и возвращайтесь к ним</span>
                <span className="home-hero__headline-row">за пару кликов</span>
              </h1>
              <p className="home-hero__lead">
                Собирайте задания из готовых шаблонов, запускайте их онлайн, сохраняйте в библиотеку и выгружайте
                готовую версию для МЭШ.
              </p>
              <div className="hero-actions home-hero__actions">
                <Link className="primary-button" href="/templates">
                  Открыть шаблоны
                </Link>
                <Link className="ghost-button" href="/login">
                  Войти
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="section-stack home-showcase">
          <div className="section-head home-showcase__head">
            <div>
              <h2>Как это работает?</h2>
              <p>Весь сценарий укладывается в три простых шага.</p>
            </div>
          </div>

          <div className="home-info-grid home-info-grid--steps">
            {WORKFLOW_STEPS.map((step) => (
              <article className="template-card home-info-card home-info-card--step" key={step.title}>
                <div className="home-info-card__title-row">
                  <span className="home-info-card__eyebrow">{step.label}</span>
                  <h3>{step.title}</h3>
                </div>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        {user ? (
          <section className="section-stack">
            <div className="section-head">
              <div>
                <h2>Ваши упражнения</h2>
                <p>Последние сохранённые материалы и быстрый переход к ним.</p>
              </div>
              <Link href="/library">Вся библиотека</Link>
            </div>

            {recentApps.length > 0 ? (
              <div className="template-grid home-recent-grid">
                {recentApps.map((app) => (
                  <article className="template-card home-recent-card" key={app.id}>
                    <div className="home-recent-card__body">
                      <small className="home-template-card__meta">Обновлено: {formatDateTime(app.updatedAt)}</small>
                      <h3>{app.title}</h3>
                      <p>{app.draft.description}</p>
                    </div>
                    <div className="home-template-card__footer">
                      <div className="card-actions home-template-actions">
                        <Link href={`/edit/${app.id}`}>Редактировать</Link>
                        <Link href={`/play/${app.slug}`}>Играть</Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <section className="template-card home-empty-state">
                <h3>Пока нет сохранённых упражнений</h3>
                <p>
                  Начните с шаблонов, создайте первое упражнение и после сохранения оно сразу появится здесь.
                </p>
                <div className="card-actions">
                  <Link className="primary-button" href="/templates">
                    Перейти к шаблонам
                  </Link>
                </div>
              </section>
            )}
          </section>
        ) : (
          <section className="section-stack home-showcase home-showcase--guest">
            <div className="section-head home-showcase__head">
              <div>
                <h2>Что доступно без входа?</h2>
                <p className="home-showcase__lead home-showcase__lead--single-line">
                  Можно познакомиться с сервисом, посмотреть каталог и понять, как устроена работа с упражнениями.
                </p>
              </div>
            </div>

            <div className="home-info-grid home-info-grid--guest">
              {GUEST_BENEFITS.map((item) => (
                <article className="template-card home-info-card home-info-card--guest" key={item.title}>
                  <div className="home-info-card__title-row home-info-card__title-row--guest">
                    <span className="home-info-card__eyebrow">{item.label}</span>
                    <h3>{item.title}</h3>
                  </div>
                  <p>{item.text}</p>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
