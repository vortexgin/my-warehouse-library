import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type WarehouseStatus = "active" | "inactive" | "deleted";

export type Warehouse = {
  uuid: string;
  organization_id: string | null;
  code: string;
  name: string;
  address: string | null;
  status: WarehouseStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CreateWarehouseInput = {
  code: string;
  name: string;
  address?: string | null;
  status?: WarehouseStatus;
};

export type UpdateWarehouseInput = Partial<CreateWarehouseInput>;

export type WarehouseModelAttributes = Partial<Omit<Warehouse, "created_at" | "updated_at" | "deleted_at">> & {
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type WarehouseModelCreationAttributes = Partial<WarehouseModelAttributes>;

export class WarehouseModel extends Model<WarehouseModelAttributes, WarehouseModelCreationAttributes> {
  declare uuid: string;
  declare organization_id: string | null;
  declare code: string;
  declare name: string;
  declare address: string | null;
  declare status: WarehouseStatus;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(warehouse: any): Warehouse {
    return {
      uuid: warehouse.uuid,
      organization_id: warehouse.organization_id ?? null,
      code: warehouse.code,
      name: warehouse.name,
      address: warehouse.address ?? null,
      status: warehouse.status,
      created_at: warehouse.created_at ? new Date(warehouse.created_at).toISOString() : new Date().toISOString(),
      updated_at: warehouse.updated_at ? new Date(warehouse.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: warehouse.deleted_at ? new Date(warehouse.deleted_at).toISOString() : null,
    };
  }
}

let warehouseModelPromise: Promise<typeof WarehouseModel> | null = null;

export async function getWarehouseModel(): Promise<typeof WarehouseModel> {
  if ((WarehouseModel as any).initialized) {
    return WarehouseModel;
  }
  if (!warehouseModelPromise) {
    warehouseModelPromise = initWarehouseModel().catch((error) => {
      warehouseModelPromise = null;
      throw error;
    });
  }
  return warehouseModelPromise;
}

async function initWarehouseModel(): Promise<typeof WarehouseModel> {
  const sequelize = await getSequelizeInstance();

  {
    WarehouseModel.init(
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
        code: {
          type: DataTypes.STRING(30),
          allowNull: false,
        },
        name: {
          type: DataTypes.STRING(120),
          allowNull: false,
        },
        address: {
          type: DataTypes.STRING(255),
          allowNull: true,
          defaultValue: null,
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
        modelName: "Warehouse",
        tableName: "wrh_warehouses",
        timestamps: false,
        underscored: true,
      },
    );

    (WarehouseModel as any).initialized = true;
  }
  return WarehouseModel;
}

export default async function WarehouseModelFactory() {
  return getWarehouseModel();
}
