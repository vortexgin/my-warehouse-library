import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type MovementType =
  | "in"
  | "out"
  | "adjust"
  | "transfer_in"
  | "transfer_out";

export type MovementWarehouseSnapshot = {
  id: string;
  code: string;
  name: string;
};

export type MovementProductSnapshot = {
  id: string;
  name: string;
  sku: string;
};

export type MovementVariantSnapshot = {
  id: string;
  name: string;
  sku: string;
};

/**
 * Append-only ledger. Rows are never updated/deleted —
 * reversal is a new movement. `reserve`/`release` are reserved
 * for the future sales-order phase and rejected by Joi in V1.
 */
export type Movement = {
  uuid: string;
  organization_id: string | null;
  warehouse_id: string;
  product_id: string;
  variant_id: string | null;
  type: MovementType;
  qty: number;
  balance_after: number;
  ref_type: string | null;
  ref_id: string | null;
  notes: string | null;
  /** Denormalized relation snapshots (invoice pattern): read path never joins. Null on legacy rows. */
  warehouse: MovementWarehouseSnapshot | null;
  product: MovementProductSnapshot | null;
  variant: MovementVariantSnapshot | null;
  created_at: string;
};

export type CreateMovementInput = {
  warehouse_id: string;
  product_id: string;
  variant_id?: string | null;
  type: MovementType;
  /** For in/out/transfer: delta qty. For adjust (opname): ABSOLUTE counted qty. */
  qty: number;
  ref_type?: string | null;
  ref_id?: string | null;
  notes?: string | null;
};

export type MovementModelAttributes = Partial<Omit<Movement, "created_at" | "warehouse" | "product" | "variant">> & {
  created_at: Date;
};

export type MovementModelCreationAttributes = Partial<MovementModelAttributes>;

export class MovementModel extends Model<MovementModelAttributes, MovementModelCreationAttributes> {
  declare uuid: string;
  declare organization_id: string | null;
  declare warehouse_id: string;
  declare product_id: string;
  declare variant_id: string | null;
  declare type: MovementType;
  declare qty: number;
  declare balance_after: number;
  declare ref_type: string | null;
  declare ref_id: string | null;
  declare notes: string | null;
  declare created_at: Date;

  static toApi(movement: any): Movement {
    const warehouse = movement.warehouse ?? null;
    const product = movement.product ?? null;
    const variant = movement.variant ?? null;
    return {
      uuid: movement.uuid,
      organization_id: movement.organization_id ?? null,
      warehouse_id: movement.warehouse_id,
      product_id: movement.product_id,
      variant_id: movement.variant_id ?? null,
      type: movement.type,
      qty: movement.qty,
      balance_after: movement.balance_after,
      ref_type: movement.ref_type ?? null,
      ref_id: movement.ref_id ?? null,
      notes: movement.notes ?? null,
      warehouse: warehouse
        ? { id: warehouse.uuid ?? warehouse.id ?? "", code: warehouse.code ?? "", name: warehouse.name ?? "" }
        : null,
      product: product
        ? { id: product.uuid ?? product.id ?? "", name: product.name ?? "", sku: product.sku ?? "" }
        : null,
      variant: variant
        ? { id: variant.uuid ?? variant.id ?? "", name: variant.name ?? "", sku: variant.sku ?? "" }
        : null,
      created_at: movement.created_at ? new Date(movement.created_at).toISOString() : new Date().toISOString(),
    };
  }
}

let movementModelPromise: Promise<typeof MovementModel> | null = null;

export async function getMovementModel(): Promise<typeof MovementModel> {
  if ((MovementModel as any).initialized) {
    return MovementModel;
  }
  if (!movementModelPromise) {
    movementModelPromise = initMovementModel().catch((error) => {
      movementModelPromise = null;
      throw error;
    });
  }
  return movementModelPromise;
}

async function initMovementModel(): Promise<typeof MovementModel> {
  const sequelize = await getSequelizeInstance();

  {
    MovementModel.init(
      {
        uuid: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        organization_id: {
          type: DataTypes.UUID,
          allowNull: true,
          defaultValue: null,
        },
        warehouse_id: {
          type: DataTypes.UUID,
          allowNull: false,
        },
        product_id: {
          type: DataTypes.UUID,
          allowNull: false,
        },
        variant_id: {
          type: DataTypes.UUID,
          allowNull: true,
          defaultValue: null,
        },
        type: {
          type: DataTypes.ENUM("in", "out", "adjust", "transfer_in", "transfer_out"),
          allowNull: false,
        },
        qty: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },
        balance_after: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },
        ref_type: {
          type: DataTypes.STRING(60),
          allowNull: true,
          defaultValue: null,
        },
        ref_id: {
          type: DataTypes.UUID,
          allowNull: true,
          defaultValue: null,
        },
        notes: {
          type: DataTypes.TEXT,
          allowNull: true,
          defaultValue: null,
        },
        created_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
      },
      {
        sequelize,
        modelName: "Movement",
        tableName: "wrh_movements",
        timestamps: false,
        underscored: true,
      },
    );

    (MovementModel as any).initialized = true;
  }
  return MovementModel;
}

export default async function MovementModelFactory() {
  return getMovementModel();
}
