import { EntrarForm } from "./_components/entrar-form";

/** Member login page (unstyled — RED design is Phase 4). Email+password only. */
export default function EntrarPage() {
  return (
    <main style={{ padding: 20 }}>
      <EntrarForm />
      <p>
        ¿No tienes cuenta? <a href="/registro">Crear cuenta</a>
      </p>
    </main>
  );
}
