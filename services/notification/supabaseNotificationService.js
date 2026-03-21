const { createClient } = require('@supabase/supabase-js');

class SupabaseNotificationService {
  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.table = process.env.SUPABASE_NOTIFICATION_TABLE || 'notifications';
    this.client = null;

    this.initSupabase();
  }

  initSupabase() {
    if (!this.supabaseUrl || !this.supabaseServiceKey) {
      return;
    }

    this.client = createClient(this.supabaseUrl, this.supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  isConfigured() {
    return Boolean(this.client && this.table);
  }

  async createNotification({ userId, title, message, type = 'system', data = {}, read = false }) {
    if (!this.isConfigured()) {
      throw new Error('Supabase notifications are not configured');
    }

    const payload = {
      user_id: userId,
      title,
      message,
      type,
      read,
      data
    };

    const { data: row, error } = await this.client
      .from(this.table)
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return row;
  }

  async getUserNotifications(userId, limit = 50, unreadOnly = false) {
    if (!this.isConfigured()) {
      throw new Error('Supabase notifications are not configured');
    }

    let query = this.client
      .from(this.table)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      query = query.eq('read', false);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data || [];
  }

  async markAsRead(notificationId, userId) {
    if (!this.isConfigured()) {
      throw new Error('Supabase notifications are not configured');
    }

    const { data, error } = await this.client
      .from(this.table)
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async markAllAsRead(userId) {
    if (!this.isConfigured()) {
      throw new Error('Supabase notifications are not configured');
    }

    const { error } = await this.client
      .from(this.table)
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) {
      throw error;
    }

    return true;
  }

  async deleteNotification(notificationId, userId) {
    if (!this.isConfigured()) {
      throw new Error('Supabase notifications are not configured');
    }

    const { error } = await this.client
      .from(this.table)
      .delete()
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    return true;
  }
}

module.exports = new SupabaseNotificationService();
