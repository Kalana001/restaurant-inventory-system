import { supabase } from './supabase';
import { SEED_MENU_ITEMS } from '../data/menuSeedData';

export interface ChannelPriceEntry {
  restaurant_price: number;
  pickme_price: number;
  updated_at?: string;
}

export type ChannelPriceMap = Record<string, ChannelPriceEntry>;

export interface CustomMenuItem {
  id: string;
  item_code: string;
  name: string;
  category: string;
  restaurant_price: number;
  pickme_price: number;
  is_active: boolean;
}

const LOCAL_STORAGE_PRICES_KEY = 'restaurant_menu_channel_prices_v1';
const LOCAL_STORAGE_CUSTOM_ITEMS_KEY = 'restaurant_custom_menu_items_v1';
const SKU_CHANNEL_PRICES = 'CONFIG-CHANNEL-PRICES';
const SKU_CUSTOM_ITEMS = 'CONFIG-CUSTOM-MENU-ITEMS';

/**
 * Loads channel prices from:
 * 1. Supabase recipes (CONFIG-CHANNEL-PRICES)
 * 2. LocalStorage
 * 3. Default SEED_MENU_ITEMS
 */
export async function loadChannelPrices(): Promise<ChannelPriceMap> {
  const merged: ChannelPriceMap = {};

  // 1. Initialize with seed data defaults (restaurant_price = current_price, pickme_price = current_price)
  SEED_MENU_ITEMS.forEach(seed => {
    merged[seed.item_code] = {
      restaurant_price: Number(seed.current_price) || 0,
      pickme_price: Number(seed.current_price) || 0
    };
  });

  // 2. Load from localStorage (fast sync recovery)
  try {
    const rawLocal = localStorage.getItem(LOCAL_STORAGE_PRICES_KEY);
    if (rawLocal) {
      const parsed = JSON.parse(rawLocal);
      if (parsed && typeof parsed === 'object') {
        Object.entries(parsed).forEach(([code, p]: [string, any]) => {
          if (p && typeof p === 'object') {
            merged[code] = {
              restaurant_price: Number(p.restaurant_price) || merged[code]?.restaurant_price || 0,
              pickme_price: Number(p.pickme_price) || merged[code]?.pickme_price || 0,
              updated_at: p.updated_at
            };
          }
        });
      }
    }
  } catch (e) {
    console.warn('Could not read channel prices from localStorage:', e);
  }

  // 3. Load from Supabase via recipes (sku = CONFIG-CHANNEL-PRICES)
  try {
    const { data: menuItem } = await supabase
      .from('menu_items')
      .select('id')
      .eq('sku', SKU_CHANNEL_PRICES)
      .maybeSingle();

    if (menuItem?.id) {
      const { data: recData } = await supabase
        .from('recipes')
        .select('instructions')
        .eq('menu_item_id', menuItem.id)
        .maybeSingle();

      if (recData?.instructions) {
        const parsed = typeof recData.instructions === 'string' ? JSON.parse(recData.instructions) : recData.instructions;
        if (parsed && typeof parsed === 'object') {
          Object.entries(parsed).forEach(([code, p]: [string, any]) => {
            if (p && typeof p === 'object') {
              merged[code] = {
                restaurant_price: Number(p.restaurant_price) || merged[code]?.restaurant_price || 0,
                pickme_price: Number(p.pickme_price) || merged[code]?.pickme_price || 0,
                updated_at: p.updated_at
              };
            }
          });
        }
      }
    }
  } catch (err) {
    console.warn('Could not load channel prices from database:', err);
  }

  // Mirror back to localStorage
  try {
    localStorage.setItem(LOCAL_STORAGE_PRICES_KEY, JSON.stringify(merged));
  } catch (e) {}

  return merged;
}

/**
 * Saves updated channel prices to:
 * 1. LocalStorage immediately
 * 2. Supabase recipes (CONFIG-CHANNEL-PRICES)
 */
export async function saveChannelPrices(pricesMap: ChannelPriceMap): Promise<boolean> {
  // 1. Save to LocalStorage immediately
  try {
    localStorage.setItem(LOCAL_STORAGE_PRICES_KEY, JSON.stringify(pricesMap));
  } catch (e) {
    console.warn('Failed to save channel prices to localStorage:', e);
  }

  // 2. Save to Supabase
  try {
    let { data: menuItem } = await supabase
      .from('menu_items')
      .select('id')
      .eq('sku', SKU_CHANNEL_PRICES)
      .maybeSingle();

    let menuItemId = menuItem?.id;

    if (!menuItemId) {
      const { data: newMenu, error: mErr } = await supabase
        .from('menu_items')
        .insert({
          name: 'Channel Menu Prices Config',
          sku: SKU_CHANNEL_PRICES,
          selling_price: 0,
          active: true
        })
        .select('id')
        .single();

      if (mErr) {
        console.warn('Could not insert config menu_item:', mErr.message);
        return false;
      }
      menuItemId = newMenu.id;
    }

    const payloadStr = JSON.stringify(pricesMap);
    const { data: existingRec } = await supabase
      .from('recipes')
      .select('id')
      .eq('menu_item_id', menuItemId)
      .maybeSingle();

    if (existingRec?.id) {
      const { error: updErr } = await supabase
        .from('recipes')
        .update({
          instructions: payloadStr,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingRec.id);

      if (updErr) {
        console.warn('Could not update recipe prices:', updErr.message);
        return false;
      }
    } else {
      const { data: units } = await supabase.from('units').select('id').limit(1);
      const { error: insErr } = await supabase
        .from('recipes')
        .insert({
          menu_item_id: menuItemId,
          yield_quantity: 1,
          yield_unit_id: units?.[0]?.id,
          instructions: payloadStr,
          active: true
        });

      if (insErr) {
        console.warn('Could not insert recipe prices:', insErr.message);
        return false;
      }
    }

    return true;
  } catch (err) {
    console.error('Error saving channel prices:', err);
    return false;
  }
}

/**
 * Loads custom menu items added by user
 */
export async function loadCustomMenuItems(): Promise<CustomMenuItem[]> {
  let items: CustomMenuItem[] = [];

  // LocalStorage
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CUSTOM_ITEMS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) items = parsed;
    }
  } catch (e) {}

  // Supabase
  try {
    const { data: menuItem } = await supabase
      .from('menu_items')
      .select('id')
      .eq('sku', SKU_CUSTOM_ITEMS)
      .maybeSingle();

    if (menuItem?.id) {
      const { data: recData } = await supabase
        .from('recipes')
        .select('instructions')
        .eq('menu_item_id', menuItem.id)
        .maybeSingle();

      if (recData?.instructions) {
        const parsed = typeof recData.instructions === 'string' ? JSON.parse(recData.instructions) : recData.instructions;
        if (Array.isArray(parsed) && parsed.length > 0) {
          items = parsed;
          try {
            localStorage.setItem(LOCAL_STORAGE_CUSTOM_ITEMS_KEY, JSON.stringify(items));
          } catch (e) {}
        }
      }
    }
  } catch (e) {}

  return items;
}

/**
 * Saves custom menu items added by user
 */
export async function saveCustomMenuItems(items: CustomMenuItem[]): Promise<boolean> {
  try {
    localStorage.setItem(LOCAL_STORAGE_CUSTOM_ITEMS_KEY, JSON.stringify(items));
  } catch (e) {}

  try {
    let { data: menuItem } = await supabase
      .from('menu_items')
      .select('id')
      .eq('sku', SKU_CUSTOM_ITEMS)
      .maybeSingle();

    let menuItemId = menuItem?.id;

    if (!menuItemId) {
      const { data: newMenu, error: mErr } = await supabase
        .from('menu_items')
        .insert({
          name: 'Custom Menu Items Config',
          sku: SKU_CUSTOM_ITEMS,
          selling_price: 0,
          active: true
        })
        .select('id')
        .single();

      if (mErr) return false;
      menuItemId = newMenu.id;
    }

    const payloadStr = JSON.stringify(items);
    const { data: existingRec } = await supabase
      .from('recipes')
      .select('id')
      .eq('menu_item_id', menuItemId)
      .maybeSingle();

    if (existingRec?.id) {
      await supabase
        .from('recipes')
        .update({
          instructions: payloadStr,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingRec.id);
    } else {
      const { data: units } = await supabase.from('units').select('id').limit(1);
      await supabase
        .from('recipes')
        .insert({
          menu_item_id: menuItemId,
          yield_quantity: 1,
          yield_unit_id: units?.[0]?.id,
          instructions: payloadStr,
          active: true
        });
    }

    return true;
  } catch (e) {
    return false;
  }
}
