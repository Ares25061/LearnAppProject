import Link from "next/link";
import type { PublicUser } from "@/lib/types";

export function SiteHeader({
  user,
}: Readonly<{
  user: PublicUser | null;
}>) {
  return (
    <header className="site-header">
      <div>
        <Link className="brand" href="/">
          LearningApps Studio
        </Link>
        <p className="brand-copy">
          Конструктор интерактивных упражнений и SCORM-архивов.
        </p>
      </div>
      <nav className="site-nav">
        <Link href="/">Шаблоны</Link>
        <Link href="/create/matching-pairs">Новый проект</Link>
        {user ? <Link href="/library">Мои упражнения</Link> : null}
        {user ? (
          <>
            <span className="user-badge">{user.name}</span>
            <form action="/api/auth/logout" method="post">
              <button className="ghost-button" type="submit">
                Выйти
              </button>
            </form>
          </>
        ) : (
          <>
            <Link href="/login">Войти</Link>
            <Link href="/register">Регистрация</Link>
          </>
        )}
      </nav>
    </header>
  );
}
