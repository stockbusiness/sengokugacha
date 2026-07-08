"use client";

export type ProvinceStatus = "locked" | "available" | "conquered";

export function getProvinceStatus(
  province: { isConquered: boolean; isFinalProvince: boolean; unlockConditionCount: number | null },
  conqueredCount: number
): ProvinceStatus {
  if (province.isConquered) return "conquered";
  if (province.isFinalProvince && province.unlockConditionCount != null && conqueredCount < province.unlockConditionCount) {
    return "locked";
  }
  return "available";
}

const STATUS_CLASSES: Record<ProvinceStatus, string> = {
  locked: "border-gold/10 bg-ink text-parchment-dim/40",
  available: "border-gold/40 bg-crimson-soft/50 text-parchment hover:bg-crimson-soft/70 active:scale-95",
  conquered: "border-gold bg-gradient-to-b from-gold-soft to-gold font-bold text-ink active:scale-95",
};

export function ProvinceButton({
  name,
  status,
  selected,
  onSelect,
}: {
  name: string;
  status: ProvinceStatus;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={status === "locked"}
      aria-disabled={status === "locked"}
      aria-pressed={selected}
      onClick={onSelect}
      className={
        "min-h-[44px] min-w-[44px] rounded-lg border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed " +
        STATUS_CLASSES[status] +
        (selected ? " ring-2 ring-gold-soft" : "")
      }
    >
      {status === "locked" && "🔒 "}
      {status === "conquered" && "✓ "}
      {name}
    </button>
  );
}
