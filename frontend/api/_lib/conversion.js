import { supabaseAdmin } from './supabase.js';

export const getConversionFactor = async (fromUnitId, toUnitId, itemId) => {
  if (fromUnitId === toUnitId) return 1.0;

  if (itemId) {
    const { data: item } = await supabaseAdmin
      .from('inventory_items')
      .select('base_unit_id, purchase_unit_id, issue_unit_id, purchase_to_base_factor, issue_to_base_factor')
      .eq('id', itemId)
      .single();

    if (item) {
      if (fromUnitId === item.purchase_unit_id && toUnitId === item.base_unit_id) return Number(item.purchase_to_base_factor);
      if (fromUnitId === item.issue_unit_id && toUnitId === item.base_unit_id) return Number(item.issue_to_base_factor);
      if (fromUnitId === item.base_unit_id && toUnitId === item.purchase_unit_id) return 1.0 / Number(item.purchase_to_base_factor);
      if (fromUnitId === item.base_unit_id && toUnitId === item.issue_unit_id) return 1.0 / Number(item.issue_to_base_factor);
      if (fromUnitId === item.purchase_unit_id && toUnitId === item.issue_unit_id) return Number(item.purchase_to_base_factor) / Number(item.issue_to_base_factor);
      if (fromUnitId === item.issue_unit_id && toUnitId === item.purchase_unit_id) return Number(item.issue_to_base_factor) / Number(item.purchase_to_base_factor);
    }
  }

  const { data: globalConv } = await supabaseAdmin
    .from('unit_conversions')
    .select('factor')
    .eq('from_unit_id', fromUnitId)
    .eq('to_unit_id', toUnitId)
    .single();

  if (globalConv) return Number(globalConv.factor);

  const { data: revGlobalConv } = await supabaseAdmin
    .from('unit_conversions')
    .select('factor')
    .eq('from_unit_id', toUnitId)
    .eq('to_unit_id', fromUnitId)
    .single();

  if (revGlobalConv) return 1.0 / Number(revGlobalConv.factor);

  return 1.0;
};

export const convertQuantity = async (quantity, fromUnitId, toUnitId, itemId) => {
  const factor = await getConversionFactor(fromUnitId, toUnitId, itemId);
  return Number(quantity) * factor;
};
