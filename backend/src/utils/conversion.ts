import { supabase } from '../config/supabase';
import { BadRequestError } from './errors';

/**
 * Calculates the conversion factor to convert a quantity from one unit to another.
 * 
 * @param itemId Optional inventory item ID (required for item-specific unit conversions)
 * @param fromUnitId The origin unit UUID
 * @param toUnitId The destination unit UUID
 * @returns The multiplier factor (toUnitValue = fromUnitValue * factor)
 */
export const getConversionFactor = async (
  fromUnitId: string,
  toUnitId: string,
  itemId?: string
): Promise<number> => {
  if (fromUnitId === toUnitId) {
    return 1.0;
  }

  // 1. Check Item-specific conversion factors first if itemId is provided
  if (itemId) {
    const { data: item, error } = await supabase
      .from('inventory_items')
      .select('base_unit_id, purchase_unit_id, issue_unit_id, purchase_to_base_factor, issue_to_base_factor')
      .eq('id', itemId)
      .single();

    if (!error && item) {
      // From Purchase Unit to Base Unit
      if (fromUnitId === item.purchase_unit_id && toUnitId === item.base_unit_id) {
        return Number(item.purchase_to_base_factor);
      }
      // From Issue Unit to Base Unit
      if (fromUnitId === item.issue_unit_id && toUnitId === item.base_unit_id) {
        return Number(item.issue_to_base_factor);
      }
      // From Base Unit to Purchase Unit
      if (fromUnitId === item.base_unit_id && toUnitId === item.purchase_unit_id) {
        return 1.0 / Number(item.purchase_to_base_factor);
      }
      // From Base Unit to Issue Unit
      if (fromUnitId === item.base_unit_id && toUnitId === item.issue_unit_id) {
        return 1.0 / Number(item.issue_to_base_factor);
      }
      // From Purchase Unit to Issue Unit
      if (fromUnitId === item.purchase_unit_id && toUnitId === item.issue_unit_id) {
        return Number(item.purchase_to_base_factor) / Number(item.issue_to_base_factor);
      }
      // From Issue Unit to Purchase Unit
      if (fromUnitId === item.issue_unit_id && toUnitId === item.purchase_unit_id) {
        return Number(item.issue_to_base_factor) / Number(item.purchase_to_base_factor);
      }
    }
  }

  // 2. Fallback: Check global conversions table
  const { data: globalConv, error: globalErr } = await supabase
    .from('unit_conversions')
    .select('factor')
    .eq('from_unit_id', fromUnitId)
    .eq('to_unit_id', toUnitId)
    .single();

  if (!globalErr && globalConv) {
    return Number(globalConv.factor);
  }

  // Check reverse global conversion
  const { data: revGlobalConv, error: revGlobalErr } = await supabase
    .from('unit_conversions')
    .select('factor')
    .eq('from_unit_id', toUnitId)
    .eq('to_unit_id', fromUnitId)
    .single();

  if (!revGlobalErr && revGlobalConv) {
    return 1.0 / Number(revGlobalConv.factor);
  }

  throw new BadRequestError(`No conversion path defined between the specified units.`);
};

/**
 * Converts a quantity from one unit to another.
 */
export const convertQuantity = async (
  quantity: number,
  fromUnitId: string,
  toUnitId: string,
  itemId?: string
): Promise<number> => {
  const factor = await getConversionFactor(fromUnitId, toUnitId, itemId);
  return quantity * factor;
};
