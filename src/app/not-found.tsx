import Link from "next/link";

export default function NotFound() {
  return (
    <main className="play-page">
      <section className="hero-card">
        <span className="eyebrow">404</span>
        <h1>Страница не найдена</h1>
        <p>
          Возможно, упражнение было удалено или адрес введен с ошибкой.
        </p>
        <div className="hero-actions">
          <Link className="primary-button" href="/">
            Вернуться к каталогу
          </Link>
        </div>
      </section>
    </main>
  );
}
