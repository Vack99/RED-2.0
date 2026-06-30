import { LoginForm } from "./_components/login-form";

// Login sits OUTSIDE the (app) shell: no tab bar, and no auth gate beyond the
// proxy (which lets /login through for unauthenticated visitors). LoginForm now
// owns the full-viewport surface (the variant-E build + the real sign-in), so
// this page simply renders it.
export default function LoginPage() {
  return <LoginForm />;
}
