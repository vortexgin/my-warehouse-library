# my-warehouse-library

**Module:** `warehouse` (git submodule `vortexgin/my-warehouse-library`)
**Entities:** `warehouse` · `stock` · `movement` (+ import)

## Purpose

Inventory truth for Sales Orders. Owns locations (warehouses), balances (stocks, written only via movements), and the append-only ledger (movements incl. opname `adjust`). Product data stays in `app/product` (FK `product_id`/`variant_id` only).

## Entities

| Entity | Table | Collection route | Writes |
|---|---|---|---|
| warehouse | `wrh_warehouses` | `/warehouse/api/v1/warehouses` | CRUD |
| stock | `wrh_stocks` | `/warehouse/api/v1/stocks` | read-only (List/Get; written via movement) |
| movement | `wrh_movements` | `/warehouse/api/v1/movements` (+ `/import`, `/import/preview`) | Create-only (append-only; reversal = new row) |

## Conventions

Same vertical slice as product/sales: `models/` → `useCases/` (`BaseUseCase`, Joi in `preExec`) → `api/[version]/` (`runtime="nodejs"`, `withAuthorization`, `ok()`/`fail()`) → `components/` + `views/` + `paths.ts`. Soft delete (movements append-only, never edited), org-scoped, encrypted JSON-only transport. Opname `adjust` takes absolute counted qty, `balance_after >= 0`, `notes` required.

## Sample data

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/seed-product-sample.sql   # prerequisite
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/seed-warehouse-sample.sql
python3 tools/reset-warehouse-seed.py --run                                    # remove it again
```

`seed-warehouse-sample.sql` is idempotent (fixed primary keys + `ON CONFLICT DO NOTHING`),
so rerunning is a no-op even after rows have been soft-deleted. It requires
`seed-product-sample.sql` and raises an exception if `PRD-*` products are missing.

It seeds 4 warehouses, 10 `CMP-*` component products, 14 BoM rows, 23 stock rows, and a
56-row movement ledger: opening receipts, sale `out`s with their exploded BoM component
legs, a main→retail and a retail→main transfer pair, absolute stocktake/damage `adjust`s,
and a quarantine intake + write-off. Component products are held as stock so the BoM
legs can actually draw on them.

Ledger invariants the seed maintains, all re-checkable with the queries at the bottom of
the file:

- `wrh_stocks.qty_on_hand` equals the final `balance_after` of its
  `(warehouse_id, product_id, variant_id)` chain.
- `balance_after` is a running balance: `in`/`transfer_in` add, `out`/`transfer_out`
  subtract, `adjust` **sets** the absolute counted quantity.
- Every `out` of a product with an active BoM has component `out` legs carrying
  `ref_type='bom'` and `ref_id=<parent movement uuid>`, matching
  `resolveBomComponents()` in `insertMovementRow.ts`.
- `transfer_in`/`transfer_out` pairs share one `ref_id`.
- No two movements in one chain share a `created_at` — `balance_after` is only
  reconstructible when the chain has a strict order. (`created_at` has a second
  resolution, so same-second rows are ambiguous to any ledger reader. The app itself is
  unaffected: it writes `balance_after` under a row lock at write time.)

`WH-RETAIL` / `PRD-001` is seeded **fully reserved** (`qty_reserved == qty_on_hand`) so
`available == 0` gives the LOW badge and `filter[low_only]` a live sample, and an `out`
against it correctly 422s. There is no reservation table in V1, so that balance is
illustrative only.

### BoM caveats

- `prd_product_boms.qty` is `INTEGER` (`Joi.integer().min(1)`) and `wrh_movements.qty` is
  `INTEGER`, so component quantities are always whole units per parent unit. Fractional
  recipes ("0.18 kg of fabric per shirt") are **not** representable — the sample
  components are discrete pieces for that reason.
- A variant-specific BoM set **replaces** the generic set wholesale, it does not merge
  with it. Seed the complete build under the variant.
- `status='inactive'` BoM rows never explode. The seed includes one retired row
  (`CMP-CELL-OLD`) to keep that path observable.
- **The BoM is write-only.** `ProductCreateUseCase`/`ProductUpdateUseCase` accept `bom`,
  but `ProductModel.toApi()` exposes no `bom` field and neither `ProductGetUseCase` nor
  `ProductListUseCase` loads it, so there is no API that reads a BoM back. Inspecting one
  currently requires SQL.
- **Every uuid the app validates is checked with `Joi.string().uuid({version:"uuidv4"})`**,
  which rejects uuid5 values. Seed UUIDs must therefore look like v4 — the seed derives
  them deterministically and forces the RFC 4122 version/variant bits.
