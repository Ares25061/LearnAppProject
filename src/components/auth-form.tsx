"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const AUTH_CONTENT = {
  login: {
    title: "Авторизация",
    description: "Войдите, чтобы сохранять упражнения и возвращаться к ним позже.",
    submit: "Войти",
    switchLabel: "Еще нет аккаунта?",
    switchLink: "Регистрация",
    switchHref: "/register",
    fallbackError: "Не удалось выполнить вход.",
  },
  register: {
    title: "Регистрация",
    description: "После регистрации можно сохранять упражнения в личной библиотеке.",
    submit: "Создать аккаунт",
    switchLabel: "Уже зарегистрированы?",
    switchLink: "Войти в аккаунт",
    switchHref: "/login",
    fallbackError: "Не удалось создать аккаунт.",
  },
} as const;

type AuthFieldErrors = {
  name?: string;
  email?: string;
  password?: string;
  form?: string;
};

function mapAuthError(message: string, mode: "login" | "register"): AuthFieldErrors {
  const lower = message.toLowerCase();

  if (lower.includes("имя")) {
    return { name: message };
  }

  if (lower.includes("email") || lower.includes("почт")) {
    return { email: message };
  }

  if (lower.includes("парол")) {
    return { password: message };
  }

  if (mode === "login" && lower.includes("пользователь")) {
    return { email: message };
  }

  return { form: message };
}

function validateAuthFields(input: {
  mode: "login" | "register";
  name: string;
  email: string;
  password: string;
}): AuthFieldErrors {
  const nextErrors: AuthFieldErrors = {};
  const trimmedEmail = input.email.trim();

  if (input.mode === "register" && !input.name.trim()) {
    nextErrors.name = "Укажите имя.";
  }

  if (!trimmedEmail) {
    nextErrors.email = "Укажите почту.";
  } else if (!trimmedEmail.includes("@")) {
    nextErrors.email = "Почта должна содержать символ @.";
  }

  if (!input.password.trim()) {
    nextErrors.password = "Укажите пароль.";
  } else if (input.mode === "register" && input.password.trim().length < 6) {
    nextErrors.password = "Пароль должен содержать минимум 6 символов.";
  }

  return nextErrors;
}

function AuthInput({
  error,
  id,
  inputMode,
  label,
  onChange,
  placeholder,
  type = "text",
  value,
  autoComplete,
}: Readonly<{
  error?: string;
  id: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  value: string;
  autoComplete?: string;
}>) {
  return (
    <label className="auth-field" htmlFor={id}>
      <span className="auth-field__label">{label}</span>
      <span className="auth-input-wrap">
        <input
          autoComplete={autoComplete}
          className="editor-input auth-input"
          id={id}
          aria-invalid={error ? "true" : "false"}
          inputMode={inputMode}
          placeholder={placeholder}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  );
}

export function AuthForm({
  mode,
}: Readonly<{
  mode: "login" | "register";
}>) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<AuthFieldErrors>({});
  const [isPending, startTransition] = useTransition();

  const content = AUTH_CONTENT[mode];
  const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";

  const clearFieldError = (field: keyof AuthFieldErrors) => {
    setErrors((current) => ({
      ...current,
      [field]: undefined,
      form: current.form,
    }));
  };

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    const nextErrors = validateAuthFields({
      mode,
      name,
      email,
      password,
    });
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

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
        const message = result?.error ?? content.fallbackError;
        setErrors(mapAuthError(message, mode));
        return;
      }

      router.push("/library");
      router.refresh();
    });
  };

  return (
    <section className="auth-shell">
      <form className="auth-card auth-card--simple" noValidate onSubmit={handleSubmit}>
        <div className="auth-card__head">
          <h1>{content.title}</h1>
          <p>{content.description}</p>
        </div>

        <div className="auth-form-grid">
          {mode === "register" ? (
            <AuthInput
              error={errors.name}
              id="name"
              label="Имя"
              placeholder="Введите ваше имя"
              value={name}
              onChange={(next) => {
                setName(next);
                clearFieldError("name");
              }}
            />
          ) : null}

          <AuthInput
            autoComplete="email"
            error={errors.email}
            id="email"
            inputMode="email"
            label="Почта"
            placeholder="Введите почту"
            value={email}
            onChange={(next) => {
              setEmail(next);
              clearFieldError("email");
            }}
          />

          <AuthInput
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            error={errors.password}
            id="password"
            label="Пароль"
            placeholder="Введите пароль"
            type="password"
            value={password}
            onChange={(next) => {
              setPassword(next);
              clearFieldError("password");
            }}
          />
        </div>

        {errors.form ? <p className="error-text auth-form-error">{errors.form}</p> : null}

        <button className="primary-button auth-submit" disabled={isPending} type="submit">
          <span>{content.submit}</span>
          <span aria-hidden="true">→</span>
        </button>

        <p className="auth-switch">
          <span>{content.switchLabel}</span>
          <Link href={content.switchHref}>{content.switchLink}</Link>
        </p>
      </form>
    </section>
  );
}
