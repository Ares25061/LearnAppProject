import Link from "next/link";
import type { PublicUser } from "@/lib/types";

export function SiteHeader({
  user,
}: Readonly<{
  user: PublicUser | null;
}>) {
  return (
    <header className="site-header">
      <Link className="brand" href="/">
        <span className="brand-mark">LA</span>
        <span className="brand-title">LearnApp Studio</span>
      </Link>

      <nav className="site-nav" aria-label="Основная навигация">
        <Link className="site-nav__link" href="/">
          Шаблоны
        </Link>
        <Link className="site-nav__link" href="/create/matching-pairs">
          Новый проект
        </Link>

        {user ? (
          <>
            <Link className="site-nav__link" href="/library">
              Библиотека
            </Link>
            <details className="site-nav__profile">
              <summary className="user-badge">{user.name}</summary>
              <div className="site-nav__profile-menu">
                <form action="/api/auth/logout" className="site-nav__logout" method="post">
                  <button className="site-nav__link site-nav__profile-action" type="submit">
                    Выйти
                  </button>
                </form>
              </div>
            </details>
          </>
        ) : (
          <>
            <Link className="site-nav__link" href="/login">
              Войти
            </Link>
            <Link className="site-nav__link" href="/register">
              Регистрация
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
