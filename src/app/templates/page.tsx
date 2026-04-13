import { SiteHeader } from "@/components/site-header";
import { TemplatesCatalog } from "@/components/templates-catalog";
import { getCurrentUser } from "@/lib/auth";
import { exerciseDefinitions } from "@/lib/exercise-definitions";

export default async function TemplatesPage() {
  const user = await getCurrentUser();

  return (
    <div className="page-shell">
      <SiteHeader user={user} />
      <main className="page-content templates-page">
        <section className="hero-card templates-hero">
          <h1>Выберите шаблон и сразу переходите в редактор</h1>
          <p>Все типы упражнений собраны в одном каталоге. Отфильтруйте раздел и откройте нужный шаблон.</p>
        </section>

        <TemplatesCatalog definitions={exerciseDefinitions} />
      </main>
    </div>
  );
}
