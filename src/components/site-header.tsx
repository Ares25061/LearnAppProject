"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PublicUser } from "@/lib/types";

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function isSectionActive(pathname: string, href: string) {
  if (href === "/templates") {
    return pathname === "/templates" || pathname.startsWith("/create/");
  }

  if (href === "/library") {
    return pathname === "/library" || pathname.startsWith("/edit/");
  }

  if (href === "/login") {
    return pathname === "/login" || pathname === "/register";
  }

  return pathname === href;
}

export function SiteHeader({
  user,
}: Readonly<{
  user: PublicUser | null;
}>) {
  const pathname = usePathname();

  const templatesActive = isSectionActive(pathname, "/templates");
  const libraryActive = isSectionActive(pathname, "/library");
  const loginActive = isSectionActive(pathname, "/login");

  return (
    <header className="site-header">
      <Link className="brand" href="/">
        <span className="brand-mark">LA</span>
        <span className="brand-title">LearnApp Studio</span>
      </Link>

      <nav className="site-nav" aria-label="Основная навигация">
        <Link
          aria-current={templatesActive ? "page" : undefined}
          className={`site-nav__link ${templatesActive ? "site-nav__link--active" : ""}`}
          href="/templates"
        >
          Шаблоны
        </Link>

        {user ? (
          <>
            <Link
              aria-current={libraryActive ? "page" : undefined}
              className={`site-nav__link ${libraryActive ? "site-nav__link--active" : ""}`}
              href="/library"
            >
              Библиотека
            </Link>

            <details className="site-nav__profile">
              <summary className="site-nav__profile-summary">
                <span className="site-nav__profile-avatar" aria-hidden="true">
                  {getInitials(user.name)}
                </span>
                <span className="site-nav__profile-name">{user.name}</span>
                <span className="site-nav__profile-caret" aria-hidden="true">
                  ▾
                </span>
              </summary>

              <div className="site-nav__profile-menu">
                <div className="site-nav__profile-card">
                  <span className="site-nav__profile-label">Вы вошли как</span>
                  <strong className="site-nav__profile-title">{user.name}</strong>
                  <span className="site-nav__profile-subtitle">{user.email}</span>
                </div>
                <form action="/api/auth/logout" className="site-nav__logout" method="post">
                  <button className="site-nav__logout-button" type="submit">
                    Выйти
                  </button>
                </form>
              </div>
            </details>
          </>
        ) : (
          <Link
            aria-current={loginActive ? "page" : undefined}
            className={`site-nav__link ${loginActive ? "site-nav__link--active" : ""}`}
            href="/login"
          >
            Войти
          </Link>
        )}
      </nav>
    </header>
  );
}
