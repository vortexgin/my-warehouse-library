import { randomUUID } from "crypto";
import { UserModel } from "@/app/base/models/UserModel";
import type { ActivityActor } from "@/app/base/models/ActivityLogModel";
import type { Movement } from "@/app/warehouse/models/MovementModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import { insertMovementRow } from "@/app/warehouse/useCases/movement/insertMovementRow";
import { recordActivityLog } from "@/app/base/models/ActivityLogModel";
import BadParameterException from "@/exceptions/BadParameterException";
import UnprocessableEntityException from "@/exceptions/UnprocessableEntityException";
import {
  classifyMovementImportRows,
  movementImportEnvelopeSchema,
} from "@/app/warehouse/useCases/movement/MovementImportPreviewUseCase";

export type MovementImportSkipped = {
  index: number;
  reason: "unknown-warehouse" | "unknown-sku" | "validation" | "insufficient-stock";
};

export type MovementImportResult = {
  created: Movement[];
  skipped: MovementImportSkipped[];
  ref_id: string;
};

export type MovementImportContext = {
  valid: Array<{
    index: number;
    warehouse_id: string;
    product_id: string;
    variant_id: string | null;
    type: "in" | "adjust";
    qty: number;
    notes?: string | null;
    ref_id?: string | null;
  }>;
  actor: ActivityActor;
  organizationId: string | null;
  skipped: MovementImportSkipped[];
  ref_id: string;
};

export class MovementImportUseCase extends BaseUseCase<{ rows: unknown[] }, MovementImportResult, MovementImportContext> {
  protected async preExec(input: { rows: unknown[] }, actor?: ActivityActor): Promise<MovementImportContext> {
    const validated = await this.validate<{ rows: unknown[] }>(movementImportEnvelopeSchema, input ?? {});

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    const preview = await classifyMovementImportRows(validated.rows, organizationId);
    const ref_id = randomUUID();

    const skipped: MovementImportSkipped[] = [
      ...preview.unknown_warehouse.map(({ index }) => ({ index, reason: "unknown-warehouse" as const })),
      ...preview.unknown_sku.map(({ index }) => ({ index, reason: "unknown-sku" as const })),
      ...preview.invalid.map(({ index }) => ({ index, reason: "validation" as const })),
    ];

    return {
      valid: preview.valid.map(({ index, row, warehouse_id, product_id, variant_id }) => ({
        index,
        warehouse_id,
        product_id,
        variant_id,
        type: row.type as "in" | "adjust",
        qty: row.qty,
        notes: row.notes ?? null,
        ref_id: row.ref_id ?? null,
      })),
      actor: actor ?? null,
      organizationId,
      skipped,
      ref_id,
    };
  }

  protected async execute(context: MovementImportContext): Promise<MovementImportResult> {
    const { valid, organizationId, ref_id } = context;
    const created: Movement[] = [];
    const skipped: MovementImportSkipped[] = [...context.skipped];

    for (const item of valid) {
      try {
        const rows = await insertMovementRow(
          {
            warehouse_id: item.warehouse_id,
            product_id: item.product_id,
            variant_id: item.variant_id,
            type: item.type,
            qty: item.qty,
            ref_type: "import",
            ref_id: item.ref_id ?? ref_id,
            notes: item.notes ?? null,
          },
          organizationId,
        );
        created.push(...rows);
      } catch (error) {
        // Race-safe, never abort the batch.
        if (error instanceof UnprocessableEntityException) {
          skipped.push({ index: item.index, reason: "insufficient-stock" });
          continue;
        }
        if (error instanceof BadParameterException) {
          skipped.push({ index: item.index, reason: "validation" });
          continue;
        }
        throw error;
      }
    }

    return { created, skipped, ref_id };
  }

  protected async postExec(result: MovementImportResult, context?: MovementImportContext): Promise<MovementImportResult> {
    for (const row of result.created) {
      void recordActivityLog({
        actor: context?.actor ?? null,
        operation: "create",
        entity: "movement",
        entity_uuid: row.uuid,
        origin: null,
        updated: row as unknown as Record<string, unknown>,
      });
    }
    return super.postExec(result, context);
  }
}
