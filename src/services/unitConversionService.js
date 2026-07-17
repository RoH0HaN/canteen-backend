import pool from "../config/database.js";
import { cacheHelper } from "../utils/cacheHelper.js";

export class UnitConversionService {
  // ---------- Helper to get DB client ----------
  static _getDb(client) {
    return client || pool;
  }

  // ---------- Get the base unit ID for an item ----------
  static async getItemBaseUnitId(itemId, client = null) {
    const db = this._getDb(client);
    const cacheKey = `item:base_unit:${itemId}`;
    let baseUnitId = cacheHelper.get(cacheKey);
    if (baseUnitId !== undefined) return baseUnitId;

    const query = "SELECT base_unit_id FROM items WHERE id = $1";
    const result = await db.query(query, [itemId]);
    if (!result.rows.length) throw new Error(`Item ${itemId} not found`);
    baseUnitId = result.rows[0].base_unit_id;
    cacheHelper.set(cacheKey, baseUnitId);
    return baseUnitId;
  }

  // ---------- Get all packaging entries for an item (cached) ----------
  static async getItemPackaging(itemId, client = null) {
    const db = this._getDb(client);
    const cacheKey = `packaging:item:${itemId}`;
    let packaging = cacheHelper.get(cacheKey);
    if (packaging) return packaging;

    const query = `
      SELECT 
        from_unit_id,
        quantity_in_base_unit
      FROM product_packaging
      WHERE item_id = $1
    `;
    const result = await db.query(query, [itemId]);
    packaging = result.rows;
    cacheHelper.set(cacheKey, packaging);
    return packaging;
  }

  // ---------- Get unit details from the units table (cached) ----------
  static async getUnit(unitId, client = null) {
    const db = this._getDb(client);
    const cacheKey = `unit:${unitId}`;
    let unit = cacheHelper.get(cacheKey);
    if (unit) return unit;

    const query = "SELECT * FROM units WHERE id = $1";
    const result = await db.query(query, [unitId]);
    if (!result.rows.length) throw new Error(`Unit ${unitId} not found`);
    unit = result.rows[0];
    cacheHelper.set(cacheKey, unit);
    return unit;
  }

  // ---------- Convert a quantity to the item's base unit ----------
  static async convertToBaseUnit(itemId, quantity, fromUnitId, client = null) {
    const db = this._getDb(client);
    // 1. If fromUnitId is the base unit, return as is
    const baseUnitId = await this.getItemBaseUnitId(itemId, client);
    if (fromUnitId === baseUnitId) return quantity;

    // 2. Check product_packaging for a specific conversion
    const packaging = await this.getItemPackaging(itemId, client);
    const pack = packaging.find((p) => p.from_unit_id == fromUnitId);
    if (pack) {
      return quantity * pack.quantity_in_base_unit;
    }

    // 3. Fallback to global unit conversion (using units table)
    const unit = await this.getUnit(fromUnitId, client);
    // If the unit has no base_unit_id or conversion factor, we cannot convert
    if (!unit.base_unit_id || unit.conversion_factor_to_base == 1) {
      // It might be a packaging unit without product_packaging entry – throw error
      throw new Error(
        `No conversion found from unit ${fromUnitId} to base unit for item ${itemId}`,
      );
    }
    // Ensure the unit's base unit matches the item's base unit (or category?)
    // For simplicity, we assume that if unit.base_unit_id equals the item's base unit,
    // the conversion factor is valid. Otherwise, we need to traverse, but we keep it simple.
    // We'll multiply by conversion_factor_to_base if unit.base_unit_id == baseUnitId.
    if (unit.base_unit_id !== baseUnitId) {
      throw new Error(
        `Unit ${fromUnitId} belongs to a different base unit category (${unit.base_unit_id}) than item base (${baseUnitId})`,
      );
    }
    return quantity * unit.conversion_factor_to_base;
  }

  // ---------- Convert a base quantity to a target unit ----------
  static async convertFromBaseUnit(
    itemId,
    baseQuantity,
    toUnitId,
    client = null,
  ) {
    const db = this._getDb(client);
    const baseUnitId = await this.getItemBaseUnitId(itemId, client);
    if (toUnitId === baseUnitId) return baseQuantity;

    // 1. Check product_packaging for a specific conversion
    const packaging = await this.getItemPackaging(itemId, client);
    console.log(packaging);
    const pack = packaging.find((p) => p.from_unit_id == toUnitId);
    if (pack) {
      return baseQuantity / pack.quantity_in_base_unit;
    }

    // 2. Fallback to global unit conversion
    const unit = await this.getUnit(toUnitId, client);
    if (!unit.base_unit_id || unit.conversion_factor_to_base == 1) {
      throw new Error(
        `No conversion found to unit ${toUnitId} from base unit for item ${itemId}`,
      );
    }
    if (unit.base_unit_id !== baseUnitId) {
      throw new Error(
        `Unit ${toUnitId} belongs to a different base unit category`,
      );
    }
    return baseQuantity / unit.conversion_factor_to_base;
  }

  // ---------- Get all available units for an item (for dropdowns) ----------
  static async getAvailableUnits(itemId, client = null) {
    const db = this._getDb(client);
    const cacheKey = `item:available_units:${itemId}`;
    const cached = cacheHelper.get(cacheKey);
    if (cached) return cached;

    const baseUnitId = await this.getItemBaseUnitId(itemId, client);
    const packaging = await this.getItemPackaging(itemId, client);

    // Get base unit details
    const baseUnit = await this.getUnit(baseUnitId, client);
    const units = [
      {
        id: baseUnit.id,
        name: baseUnit.name,
        symbol: baseUnit.symbol,
        category: baseUnit.category,
        is_base: true,
        quantity_in_base_unit: 1,
      },
    ];

    // Add packaging units
    for (const pack of packaging) {
      const unit = await this.getUnit(pack.from_unit_id, client);
      units.push({
        id: unit.id,
        name: unit.name,
        symbol: unit.symbol,
        category: unit.category,
        is_base: false,
        quantity_in_base_unit: pack.quantity_in_base_unit,
      });
    }

    // Optionally, add standard sub‑units (like Gram, Milliliter) if they share the same base unit category
    // This can be done by querying units where base_unit_id = baseUnitId and id != baseUnitId
    // We'll add them for flexibility.
    const subUnitQuery = `
      SELECT id, name, symbol, category, conversion_factor_to_base
      FROM units
      WHERE base_unit_id = $1 AND id != $1
      ORDER BY name
    `;
    const subUnitResult = await db.query(subUnitQuery, [baseUnitId]);
    for (const sub of subUnitResult.rows) {
      // Avoid duplicates if already in packaging (though unlikely)
      if (!units.some((u) => u.id == sub.id)) {
        units.push({
          id: sub.id,
          name: sub.name,
          symbol: sub.symbol,
          category: sub.category,
          is_base: false,
          quantity_in_base_unit: sub.conversion_factor_to_base, // 1 sub unit = conversion factor base units
        });
      }
    }

    cacheHelper.set(cacheKey, units);
    return units;
  }

  // ---------- Helper: Invalidate all unit conversion caches ----------
  static _invalidateConversionCaches(itemId) {
    cacheHelper.del(`item:base_unit:${itemId}`);
    cacheHelper.del(`packaging:item:${itemId}`);
    cacheHelper.del(`item:available_units:${itemId}`);
    // Also invalidate generic lists
    cacheHelper.delPattern("units:");
    cacheHelper.delPattern("packaging:");
  }
}
