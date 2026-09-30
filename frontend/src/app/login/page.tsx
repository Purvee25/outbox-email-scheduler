import { buttonClasses } from "@/components/ui/button";
import { googleLoginUrl } from "@/lib/api";

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Google sign-in was cancelled. Please try again.",
};

const DISABLED_FIELD =
  "h-[3.75rem] w-full cursor-not-allowed rounded-control bg-field px-5 text-[15px] placeholder:text-ink-muted";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const errorMessage =
    typeof error === "string"
      ? (ERROR_MESSAGES[error] ?? "Sign-in failed. Please try again.")
      : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="animate-fade-up w-full max-w-[26rem] rounded-card border border-border px-8 py-12">
        <h1 className="mb-8 text-center text-4xl font-semibold tracking-tight">
          Login
        </h1>

        {errorMessage && (
          <p
            role="alert"
            className="mb-5 rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg"
          >
            {errorMessage}
          </p>
        )}

        <a
          href={googleLoginUrl}
          id="google-login-btn"
          className={buttonClasses(
            "soft",
            "lg",
            "h-14 w-full gap-3 rounded-control text-lg font-normal",
          )}
        >
          <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden>
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84Z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38Z"
            />
          </svg>
          Login with Google
        </a>

        <div className="my-6 flex items-center gap-4 text-sm text-ink-muted">
          <span className="h-px flex-1 bg-border" />
          or sign up through email
          <span className="h-px flex-1 bg-border" />
        </div>

        {/* Email/password sign-in isn't supported by the API yet; shown per the design, disabled. */}
        <div className="flex flex-col gap-4">
          <input
            type="email"
            disabled
            aria-label="Email ID"
            placeholder="Email ID"
            title="Email sign-in is coming soon"
            className={DISABLED_FIELD}
          />
          <input
            type="password"
            disabled
            aria-label="Password"
            placeholder="Password"
            title="Email sign-in is coming soon"
            className={DISABLED_FIELD}
          />
        </div>

        <button
          type="button"
          disabled
          className={buttonClasses(
            "primary",
            "lg",
            "mt-8 h-14 w-full rounded-control text-lg font-normal",
          )}
        >
          Login
        </button>
      </div>
    </main>
  );
}
