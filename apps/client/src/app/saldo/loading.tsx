import { Skeleton } from "@gym/ui/forge/skeleton";

// Route loading fallback mirroring saldo-vista.tsx's shape (header + one plan card) at
// matching paddings, so the swap to real content is not a layout jump.
export default function Loading() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-7 pb-14 pt-10">
      <header>
        <Skeleton width={64} height={10} />
        <div style={{ marginTop: 10 }}>
          <Skeleton width="60%" height={28} />
        </div>
      </header>

      <section className="mt-8 rounded-2xl border border-line bg-surface p-6">
        <Skeleton width={48} height={9} />
        <div style={{ marginTop: 10 }}>
          <Skeleton width="70%" height={24} />
        </div>
        <div style={{ marginTop: 18 }}>
          <Skeleton width="50%" height={14} />
        </div>
        <div style={{ marginTop: 10 }}>
          <Skeleton width="40%" height={10} />
        </div>
      </section>
    </main>
  );
}
