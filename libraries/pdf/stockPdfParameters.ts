import type { Stock } from "@/app/warehouse/models/StockModel";
import { formatPdfDate, type ValidatedPdfRequest } from "@/libraries/google/PdfRequest";
import { generatedParameters } from "@/libraries/google/PdfGeneration";

export function stockPdfParameters(rows: Stock[], filters: { q?: string; warehouse_id?: string; product_id?: string; variant_id?: string; low_only?: boolean }, options: ValidatedPdfRequest & { actorName: string; organizationId: string | null; organizationName: string }) {
  const first = rows[0];
  return {
    ...generatedParameters(options),
    report: { title: "Stock Report", generated_at: formatPdfDate(new Date(), options.locale, options.timezone, true), generated_by: options.actorName, total_rows: rows.length },
    filters: {
      query: filters.q || "—",
      warehouse: first?.warehouse?.name ?? filters.warehouse_id ?? "All",
      product: first?.product?.name ?? filters.product_id ?? "All",
      variant: first?.variant?.name ?? filters.variant_id ?? "All",
      low_only: filters.low_only ? "yes" : "no",
    },
    stocks: rows.map((row) => ({
      warehouse_id: row.warehouse_id, warehouse_code: row.warehouse?.code ?? "—", warehouse_name: row.warehouse?.name ?? row.warehouse_id,
      product_id: row.product_id, product_sku: row.product?.sku ?? "—", product_name: row.product?.name ?? row.product_id,
      variant_id: row.variant_id ?? "—", variant_sku: row.variant?.sku ?? "—", variant_name: row.variant?.name ?? row.variant_id ?? "—",
      qty_on_hand: row.qty_on_hand, qty_reserved: row.qty_reserved, qty_available: row.qty_on_hand - row.qty_reserved,
      status: row.status, updated_at: formatPdfDate(row.updated_at, options.locale, options.timezone, true),
    })),
  };
}
