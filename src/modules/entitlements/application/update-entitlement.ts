import type { EntitlementRepository } from "@/modules/entitlements/application/ports";

export async function updateEntitlement(
  repository: EntitlementRepository,
  body: Record<string, unknown>,
  systemKey: string
): Promise<void> {
  const entitlementId = typeof body.entitlement_id === "string" ? body.entitlement_id : null;
  if (!entitlementId) throw new Error("entitlement_idが不足しています");

  await repository.updateMetadata(systemKey, entitlementId, {
    validFrom: typeof body.valid_from === "string" ? body.valid_from : undefined,
    validUntil: typeof body.valid_until === "string" ? body.valid_until : undefined,
    metadata: body.metadata ?? undefined,
  });
}
