import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/auth";
import { listAppsByOwner } from "@/lib/apps";
import { exerciseDefinitions } from "@/lib/exercise-definitions";
import { formatDateTime } from "@/lib/utils";

export default async function Home() {
  const user = await getCurrentUser();
  const recentApps = user ? listAppsByOwner(user.id).slice(0, 6) : [];

  return (
    <div className="page-shell">
      <SiteHeader user={user} />
      <main className="page-content">
        <section className="hero-card">
          <span className="eyebrow">21 шаблон упражнения</span>
          <h1>Конструктор интерактивных приложений наподобие LearningApps</h1>
          <p>
            Выберите тип упражнения, отредактируйте данные шаблона и скачайте
            SCORM-архив той же базовой структуры, что и в примере с
            `imsmanifest.xml`, `index.html` и SCORM-оберткой.
          </p>
          <div className="hero-actions">
            <Link className="primary-button" href="/create/matching-pairs">
              Создать упражнение
            </Link>
            <Link className="ghost-button" href="/library">
              Открыть библиотеку
            </Link>
          </div>
        </section>

        {recentApps.length > 0 ? (
          <section className="section-stack">
            <div className="section-head">
              <div>
                <span className="eyebrow">Последние сохранения</span>
                <h2>Ваши упражнения</h2>
              </div>
              <Link href="/library">Вся библиотека</Link>
            </div>
            <div className="template-grid">
              {recentApps.map((app) => (
                <article className="template-card" key={app.id}>
                  <span className="tag">{app.type}</span>
                  <h3>{app.title}</h3>
                  <p>{app.draft.description}</p>
                  <small>Обновлено: {formatDateTime(app.updatedAt)}</small>
                  <div className="card-actions">
                    <Link href={`/edit/${app.id}`}>Редактировать</Link>
                    <Link href={`/play/${app.slug}`}>Открыть</Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="section-stack">
          <div className="section-head">
            <div>
              <span className="eyebrow">Каталог</span>
              <h2>Все типы упражнений</h2>
            </div>
          </div>
          <div className="template-grid">
            {exerciseDefinitions.map((definition) => (
              <article className="template-card" key={definition.id}>
                <span className="tag">{definition.category}</span>
                <h3>{definition.title}</h3>
                <p>{definition.shortDescription}</p>
                <div className="tag-list">
                  {definition.tags.slice(0, 3).map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="card-actions">
                  <Link href={`/create/${definition.id}`}>Открыть редактор</Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
