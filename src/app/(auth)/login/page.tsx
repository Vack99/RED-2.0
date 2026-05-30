import { LoginForm } from "./_components/login-form";

// Sits outside the (app) shell so it has no tab bar and no auth gate beyond the
// proxy (which lets /login through for unauthenticated visitors).
export default function LoginPage() {
  return (
    <div
      className="flex min-h-dvh w-full items-center justify-center bg-backdrop"
      style={{ padding: 24 }}
    >
      <div className="w-full" style={{ maxWidth: 380 }}>
        <LoginForm />
      </div>
    </div>
  );
}
