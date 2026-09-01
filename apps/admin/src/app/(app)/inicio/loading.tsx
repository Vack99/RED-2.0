import { Skeleton } from "@gym/ui/forge/skeleton";
import { Card, Eyebrow } from "@gym/ui/forge/ui";

/**
 * Route loading fallback mirroring inicio.tsx (#328): header → day card → 50/50
 * action pair → MEMBRESÍAS merged card → online strip. Renders the Cupo shape (the
 * richer of the two skeletons) since the resolved mode isn't known until the real
 * page's `getOperatorGym()` read lands.
 */
export default function Loading() {
  return (
    <div style={{ padding: "18px 22px 32px" }}>
      {/* Header — date + gym name + account initial */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline" style={{ gap: 9 }}>
          <Skeleton width={72} height={12} />
          <Skeleton width={54} height={10} />
        </div>
        <Skeleton width={34} height={34} />
      </div>

      {/* Day card */}
      <Card style={{ marginTop: 16, padding: "18px 20px" }}>
        <div className="flex items-baseline justify-between">
          <Skeleton width={110} height={10} />
          <Skeleton width={60} height={12} />
        </div>
        <Skeleton width="70%" height={22} style={{ marginTop: 8 }} />
        <Skeleton height={44} style={{ marginTop: 12 }} />
      </Card>

      {/* 50/50 action pair */}
      <div className="flex" style={{ marginTop: 8, gap: 8 }}>
        <Skeleton height={46} style={{ flex: 1 }} />
        <Skeleton height={46} style={{ flex: 1 }} />
      </div>

      {/* MEMBRESÍAS */}
      <div className="flex items-baseline justify-between" style={{ marginTop: 24, padding: "0 2px" }}>
        <Eyebrow style={{ fontSize: 10 }}>MEMBRESÍAS</Eyebrow>
        <Skeleton width={90} height={10.5} />
      </div>
      <Card style={{ marginTop: 9, padding: "16px 18px" }}>
        <div className="flex items-baseline justify-between">
          <Skeleton width={90} height={15} />
          <Skeleton width={30} height={24} />
        </div>
        <Skeleton width="80%" height={11} style={{ marginTop: 8 }} />
        <div className="grid" style={{ marginTop: 12, gridTemplateColumns: "repeat(6, 1fr)", gap: 4 }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} height={38} />
          ))}
        </div>
        <Skeleton height={13} style={{ marginTop: 13 }} />
      </Card>
    </div>
  );
}
