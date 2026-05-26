const { getSupabaseClient } = require('../../../services/supabaseClient');

const normalizePhone = (phoneNumber = '') => {
  const trimmed = String(phoneNumber).trim();
  return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
};

class ConnectifyRepository {
  get client() {
    return getSupabaseClient();
  }

  async findUserByPhone(phoneNumber) {
    const phone = normalizePhone(phoneNumber);
    const { data, error } = await this.client
      .from('app_users')
      .select('*')
      .or(`phone.eq.${phone},phone.eq.${phoneNumber}`)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async findOrCreateWhatsAppUser(phoneNumber) {
    const existing = await this.findUserByPhone(phoneNumber);
    if (existing) {
      return existing;
    }

    const phone = normalizePhone(phoneNumber);
    const payload = {
      name: 'WhatsApp User',
      email: `whatsapp_${phone.replace('+', '')}@connectify.com`,
      phone,
      role: 'customer',
      source: 'whatsapp',
      is_active: true,
      profile: { whatsapp_id: phoneNumber }
    };

    const { data, error } = await this.client
      .from('app_users')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }

  async updateUserName(userId, fullName) {
    // Fetch the user first to preserve sibling profile fields
    const user = await this.client.from('app_users').select('*').eq('id', userId).single();
    if (user.error) throw user.error;
    
    const currentProfile = user.data.profile || {};
    const updatedProfile = {
      ...currentProfile,
      fullName: fullName,
      profileCompleted: true
    };
    
    const { data, error } = await this.client
      .from('app_users')
      .update({
        name: fullName,
        profile: updatedProfile
      })
      .eq('id', userId)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }

  async findMatchingServices({ service, location, limit = 3 }) {
    let query = this.client
      .from('services')
      .select('*,provider:provider_id(id,name,email,phone,role,profile,provider_details,rating_average,rating_count,completed_jobs_count,wallet_balance,wallet_currency,is_active,created_at,updated_at)')
      .limit(limit);

    if (service) {
      const escapedService = String(service).replace(/[%_]/g, '\\$&');
      query = query.or(`name.ilike.%${escapedService}%,category.ilike.%${escapedService}%,description.ilike.%${escapedService}%`);
    }

    if (location) {
      const escapedLoc = String(location).replace(/[%_]/g, '\\$&');
      query = query.or(`location->>address.ilike.%${escapedLoc}%,location->>city.ilike.%${escapedLoc}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((row) => ({
      id: row.id,
      providerId: row.provider_id || (row.provider && row.provider.id),
      displayName: (row.provider && row.provider.name) || 'Connectify Provider',
      category: row.category,
      price: row.price,
      priceLabel: this.formatPrice(row.price),
      locationLabel: row.location ? (row.location.address || row.location.city || '') : '',
      raw: row
    }));
  }

  async createBookingRequest({ customerId, provider, session }) {
    const payload = {
      customer_id: customerId,
      provider_id: provider.providerId,
      service_id: provider.id,
      date: session.date || new Date().toISOString().split('T')[0],
      start_time: session.time || '09:00',
      duration_minutes: session.duration || 60,
      status: 'pending',
      payment_status: 'pending',
      total_amount: provider.price || 0,
      notes: session.service ? `Booking for ${session.service} near ${session.location || ''}` : 'WhatsApp Booking',
      source: 'whatsapp',
      metadata: {
        whatsapp: true,
        service_name: session.service,
        location: session.location,
        selected_provider_snapshot: provider.raw || provider
      }
    };

    const { data, error } = await this.client
      .from('bookings')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }

  formatPrice(price) {
    if (price === null || price === undefined || price === '') {
      return null;
    }

    const numeric = Number(price);
    if (Number.isNaN(numeric)) {
      return String(price);
    }

    return `NGN ${numeric.toLocaleString()}`;
  }
}

module.exports = new ConnectifyRepository();
