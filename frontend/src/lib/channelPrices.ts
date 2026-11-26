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
const SETTING_KEY_PRICES = 'MENU_CHANNEL_PRICES';
const SETTING_KEY_CUSTOM = 'CUSTOM_MENU_ITEMS';

/**
 * Loads channel prices from:
 * 1. Supabase system_settings
 * 2. Supabase recipes (instructions json backup)
 * 3. LocalStorage
 * 4. Default SEED_MENU_ITEMS prices
 */
export async function loadChannelPrices(): Promise<ChannelPriceMap> {
  const merged: ChannelPriceMap = {};

  // 1. Initialize with seed data defaults (restaurant_price = pickme_price = current_price)
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

  // 3. Try to load from Supabase system_settings
  try {
    const { data: settingData } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', SETTING_KEY_PRICES)
      .maybeSingle();

    if (settingData?.value) {
      const parsed = typeof settingData.value === 'string' ? JSON.parse(settingData.value) : settingData.value;
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
  } catch (err) {
    console.warn('Could not load channel prices from system_settings:', err);
  }

  // Also mirror back into localStorage for instant offline access
  try {
    localStorage.setItem(LOCAL_STORAGE_PRICES_KEY, JSON.stringify(merged));
  } catch (e) {}

  return merged;
}

/**
 * Saves updated channel prices to:
 * 1. LocalStorage
 * 2. Supabase system_settings
 */
export async function saveChannelPrices(pricesMap: ChannelPriceMap): Promise<boolean> {
  // 1. Save to LocalStorage immediately
  try {
    localStorage.setItem(LOCAL_STORAGE_PRICES_KEY, JSON.stringify(pricesMap));
  } catch (e) {
    console.warn('Failed to save to localStorage:', e);
  }

  // 2. Save to Supabase system_settings
  try {
    const payloadStr = JSON.stringify(pricesMap);
    const { error } = await supabase
      .from('system_settings')
      .upsert({
        key: SETTING_KEY_PRICES,
        value: payloadStr,
        description: 'Stores channel-specific menu prices (Restaurant vs PickMe)',
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });

    if (error) {
      console.warn('Could not save to system_settings:', error.message);
      return false;
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

  // Supabase system_settings
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', SETTING_KEY_CUSTOM)
      .maybeSingle();

    if (data?.value) {
      const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      if (Array.isArray(parsed) && parsed.length > 0) {
        items = parsed;
        try {
          localStorage.setItem(LOCAL_STORAGE_CUSTOM_ITEMS_KEY, JSON.stringify(items));
        } catch (e) {}
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
    await supabase
      .from('system_settings')
      .upsert({
        key: SETTING_KEY_CUSTOM,
        value: JSON.stringify(items),
        description: 'Stores user-created custom menu items',
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });
    return true;
  } catch (e) {
    return false;
  }
}
