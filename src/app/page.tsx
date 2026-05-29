import { redirect } from "next/navigation";

// Forge has no standalone landing page — the app opens on the home tab.
// Send "/" straight to /inicio (the dashboard).
export default function Home() {
  redirect("/inicio");
}
