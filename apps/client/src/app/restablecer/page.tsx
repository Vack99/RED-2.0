import { RestablecerForm } from "./_components/restablecer-form";

/**
 * Set-new-password landing (unstyled — RED design is Phase 4). The reset link's PKCE
 * code is exchanged at /auth/confirm (which redirects here), so the recovery session
 * is already established when this renders; the action calls updateUser.
 */
export default function RestablecerPage() {
  return (
    <main style={{ padding: 20 }}>
      <RestablecerForm />
    </main>
  );
}
