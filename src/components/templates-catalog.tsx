"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ExerciseDefinition } from "@/lib/types";

const ALL_CATEGORY = "Все";

export function TemplatesCatalog({
  definitions,
}: Readonly<{
  definitions: ExerciseDefinition[];
}>) {
  const categories = useMemo(
    () => [
      ALL_CATEGORY,
      ...Array.from(new Set(definitions.map((definition) => definition.category))),
    ],
    [definitions],
  );
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORY);

  const visibleDefinitions = useMemo(
    () =>
      activeCategory === ALL_CATEGORY
        ? definitions
        : definitions.filter((definition) => definition.category === activeCategory),
    [activeCategory, definitions],
  );

  return (
    <section className="templates-catalog">
      <div className="templates-toolbar">
        <div className="templates-toolbar__copy">
          <h2>Все шаблоны</h2>
        </div>
        <div className="templates-filters" role="tablist" aria-label="Фильтр по разделам">
          {categories.map((category) => {
            const isActive = category === activeCategory;

            return (
              <button
                key={category}
                aria-pressed={isActive}
                className={`templates-filter ${isActive ? "templates-filter--active" : ""}`}
                type="button"
                onClick={() => setActiveCategory(category)}
              >
                {category}
              </button>
            );
          })}
        </div>
      </div>

      <div className="templates-grid" role="list">
        {visibleDefinitions.map((definition) => (
          <article className="template-card templates-card" key={definition.id} role="listitem">
            <div className="templates-card__body">
              <h3>{definition.title}</h3>
              <p>{definition.shortDescription}</p>
              <div className="home-template-tags">
                {definition.tags.slice(0, 3).map((tag) => (
                  <span className="home-template-tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="templates-card__footer">
              <div className="card-actions home-template-actions">
                <Link href={`/create/${definition.id}`}>Открыть редактор</Link>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
