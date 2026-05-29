const { getSupabaseClient } = require('../../../services/supabaseClient');
const { randomUUID } = require('crypto');

const normalizePhone = (phoneNumber = '') => {
  const trimmed = String(phoneNumber).trim();
  return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
};

const quotePostgrestValue = (val) => {
  if (val === null || val === undefined) return 'null';
  const escaped = String(val).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
};

class ConnectifyRepository {
  get client() {
    return getSupabaseClient();
  }

  async findUserByPhone(phoneNumber) {
    const phone = normalizePhone(phoneNumber);
    const quotedPhone = quotePostgrestValue(phone);
    const quotedRawPhone = quotePostgrestValue(phoneNumber);

    const { data, error } = await this.client
      .from('app_users')
      .select('*')
      .or(`phone.eq.${quotedPhone},phone.eq.${quotedRawPhone}`)
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
      const quotedTerm = quotePostgrestValue(`%${escapedService}%`);
      query = query.or(`name.ilike.${quotedTerm},category.ilike.${quotedTerm},description.ilike.${quotedTerm}`);
    }

    if (location) {
      const escapedLoc = String(location).replace(/[%_]/g, '\\$&');
      const quotedLoc = quotePostgrestValue(`%${escapedLoc}%`);
      query = query.or(`location->>address.ilike.${quotedLoc},location->>city.ilike.${quotedLoc}`);
    }

    const { data, error } = await query
      .order('rating_average', { ascending: false, nullsFirst: false })
      .order('completed_jobs_count', { ascending: false });

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
    const bookingId = randomUUID();
    const { error } = await this.client.rpc('create_booking_atomic', {
      p_booking_id: bookingId,
      p_customer_id: customerId,
      p_provider_id: provider.providerId,
      p_service_id: provider.id,
      p_date: session.date || new Date().toISOString().split('T')[0],
      p_time: session.time || '09:00',
      p_duration: session.duration || 60,
      p_total_amount: provider.price || 0,
      p_notes: session.service ? `WhatsApp: ${session.service}` : 'WhatsApp Booking',
      p_address: { whatsapp_location: session.location || 'Unknown' }
    });

    if (error) throw error;
    
    // Fetch the full booking record to return expected structure
    const { data: booking, error: fetchErr } = await this.client
      .from('bookings')
      .select('*, provider:provider_id(name)')
      .eq('id', bookingId)
      .single();
      
    if (fetchErr) throw fetchErr;
    return booking;
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
