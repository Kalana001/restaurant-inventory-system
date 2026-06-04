import { supabase } from '../config/supabase';

export const logAudit = async (
  userId: string | null,
  action: string,
  tableName: string,
  recordId: string | null,
  oldValues: any = null,
  newValues: any = null,
  ipAddress: string | null = null
): Promise<void> => {
  try {
    const { error } = await supabase.from('audit_logs').insert({
      user_id: userId,
      action,
      table_name: tableName,
      record_id: recordId,
      old_values: oldValues,
      new_values: newValues,
      ip_address: ipAddress
    });

    if (error) {
      console.error('[AUDIT ERROR]: Failed to insert audit log:', error);
    }
  } catch (err) {
    console.error('[AUDIT EXCEPTION]: Failed to run logAudit:', err);
  }
};
