"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function AuthForm({
  mode,
}: Readonly<{
  mode: "login" | "register";
}>) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    setNotice(null);

    startTransition(async () => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          password,
        }),
      });

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setNotice(result?.error ?? "Не удалось выполнить вход.");
        return;
      }

      router.push("/library");
      router.refresh();
    });
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="auth-card">
        <span className="eyebrow">
          {mode === "login" ? "Авторизация" : "Регистрация"}
        </span>
        <h1>
          {mode === "login" ? "Войти в библиотеку" : "Создать аккаунт"}
        </h1>
        <p>
          Без входа можно создавать упражнения и скачивать архивы. Вход нужен
          только для сохранения и дальнейшего редактирования.
        </p>

        {mode === "register" ? (
          <>
            <label className="field-label" htmlFor="name">
              Имя
            </label>
            <input
              className="editor-input"
              id="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </>
        ) : null}

        <label className="field-label" htmlFor="email">
          Email
        </label>
        <input
          className="editor-input"
          id="email"
          required
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <label className="field-label" htmlFor="password">
          Пароль
        </label>
        <input
          className="editor-input"
          id="password"
          minLength={6}
          required
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        {notice ? <p className="error-text">{notice}</p> : null}

        <button className="primary-button" disabled={isPending} type="submit">
          {mode === "login" ? "Войти" : "Зарегистрироваться"}
        </button>
      </div>
    </form>
  );
}
