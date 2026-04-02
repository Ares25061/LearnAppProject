import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { requireCurrentUser } from "@/lib/auth";
import { listAppsByOwner } from "@/lib/apps";
import { formatDateTime } from "@/lib/utils";

export default async function LibraryPage() {
  const user = await requireCurrentUser();
  const apps = listAppsByOwner(user.id);

  return (
    <div className="page-shell">
      <SiteHeader user={user} />
      <main className="page-content section-stack">
        <div className="section-head">
          <div>
            <span className="eyebrow">Библиотека</span>
            <h1>Сохраненные упражнения</h1>
          </div>
          <Link className="primary-button" href="/create/matching-pairs">
            Новое упражнение
          </Link>
        </div>

        {apps.length === 0 ? (
          <section className="hero-card">
            <h2>Пока ничего не сохранено</h2>
            <p>
              Создайте первое упражнение, скачайте SCORM или сохраните его для
              дальнейшего редактирования.
            </p>
          </section>
        ) : (
          <div className="template-grid">
            {apps.map((app) => (
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
        )}
      </main>
    </div>
  );
}
