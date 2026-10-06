import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type StockStatus = "active" | "inactive" | "deleted";

/**
 * Materialized balance. Qty changes ONLY via movement (single writer).
 * No Create/Update API routes — rows are find-or-created on first `in`.
 */
export type Stock = {
  uuid: string;
  organization_id: string | null;
  warehouse_id: string;
  product_id: string;
  variant_id: string | null;
  qty_on_hand: number;
  qty_reserved: number;
  status: StockStatus;
  /** Relation labels from eager-loaded associations, not stored snapshots. Null when the related module/row is absent. */
  warehouse: { id: string; code: string; name: string } | null;
  product: { id: string; name: string; sku: string } | null;
  variant: { id: string; name: string; sku: string } | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type StockModelAttributes = Partial<Omit<Stock, "created_at" | "updated_at" | "deleted_at" | "warehouse" | "product" | "variant">> & {
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type StockModelCreationAttributes = Partial<StockModelAttributes>;

export class StockModel extends Model<StockModelAttributes, StockModelCreationAttributes> {
  declare uuid: string;
  declare organization_id: string | null;
  declare warehouse_id: string;
  declare product_id: string;
  declare variant_id: string | null;
  declare qty_on_hand: number;
  declare qty_reserved: number;
  declare status: StockStatus;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(stock: any): Stock {
    const warehouse = stock.warehouse ?? null;
    const product = stock.product ?? null;
    const variant = stock.variant ?? null;
    return {
      uuid: stock.uuid,
      organization_id: stock.organization_id ?? null,
      warehouse_id: stock.warehouse_id,
      product_id: stock.product_id,
      variant_id: stock.variant_id ?? null,
      qty_on_hand: typeof stock.qty_on_hand === "number" ? stock.qty_on_hand : 0,
      qty_reserved: typeof stock.qty_reserved === "number" ? stock.qty_reserved : 0,
      status: stock.status,
      warehouse: warehouse
        ? { id: warehouse.uuid ?? warehouse.id ?? "", code: warehouse.code ?? "", name: warehouse.name ?? "" }
        : null,
      product: product
        ? { id: product.uuid ?? product.id ?? "", name: product.name ?? "", sku: product.sku ?? "" }
        : null,
      variant: variant
        ? { id: variant.uuid ?? variant.id ?? "", name: variant.name ?? "", sku: variant.sku ?? "" }
        : null,
      created_at: stock.created_at ? new Date(stock.created_at).toISOString() : new Date().toISOString(),
      updated_at: stock.updated_at ? new Date(stock.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: stock.deleted_at ? new Date(stock.deleted_at).toISOString() : null,
    };
  }

  /** Available for future sales-order reservation. */
  static available(stock: Pick<Stock, "qty_on_hand" | "qty_reserved">): number {
    return stock.qty_on_hand - stock.qty_reserved;
  }
}

let stockModelPromise: Promise<typeof StockModel> | null = null;

export async function getStockModel(): Promise<typeof StockModel> {
  if ((StockModel as any).initialized) {
    return StockModel;
  }
  if (!stockModelPromise) {
    stockModelPromise = initStockModel().catch((error) => {
      stockModelPromise = null;
      throw error;
    });
  }
  return stockModelPromise;
}

async function initStockModel(): Promise<typeof StockModel> {
  const sequelize = await getSequelizeInstance();

  {
    StockModel.init(
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
        qty_on_hand: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        qty_reserved: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        status: {
          type: DataTypes.ENUM("active", "inactive", "deleted"),
          allowNull: false,
          defaultValue: "active",
        },
        created_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        updated_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        deleted_at: {
          type: DataTypes.DATE,
          allowNull: true,
          defaultValue: null,
        },
      },
      {
        sequelize,
        modelName: "Stock",
        tableName: "wrh_stocks",
        timestamps: false,
        underscored: true,
      },
    );

    (StockModel as any).initialized = true;
  }
  return StockModel;
}

export default async function StockModelFactory() {
  return getStockModel();
}
