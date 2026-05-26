const { BaseRepository, ensureNoError } = require('./baseRepository');
const { mapBookingRow } = require('./mappers');
const { normalizeDateString } = require('./availabilityRepository');

const USER_COLUMNS = 'id,name,email,phone,role,profile,provider_details,rating_average,rating_count,completed_jobs_count,wallet_balance,wallet_currency,is_active,created_at,updated_at';
const SERVICE_COLUMNS = 'id,name,provider_id,category,description,price,price_type,duration_minutes,images,location,rating_average,rating_count,services_offered,gallery,is_active,created_at,updated_at';
const BOOKING_SELECT = `*,customer:customer_id(${USER_COLUMNS}),provider:provider_id(${USER_COLUMNS}),service:service_id(${SERVICE_COLUMNS})`;

const quotePostgrestValue = (val) => {
  if (val === null || val === undefined) return 'null';
  const escaped = String(val).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
};

const stripUndefined = (payload) =>
  Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));

const toBookingUpdatePayload = (updates = {}) =>
  stripUndefined({
    date: updates.date !== undefined ? normalizeDateString(updates.date) : undefined,
    start_time: updates.time,
    duration_minutes: updates.duration,
    status: updates.status,
    total_amount: updates.totalAmount,
    currency: updates.currency,
    payment_status: updates.paymentStatus,
    notes: updates.notes,
    address: updates.address,
    completed_at: updates.completedAt,
    rating: updates.rating,
    service_images: updates.serviceImages,
    reminder_sent: updates.reminderSent
  });

const getTomorrowDateString = (fromDate = new Date()) => {
  const tomorrow = fromDate instanceof Date ? new Date(fromDate) : new Date(fromDate);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return normalizeDateString(tomorrow);
};

class BookingRepository extends BaseRepository {
  constructor(clientFactory) {
    super('bookings', mapBookingRow, clientFactory);
  }

  async createBooking({
    id,
    customerId,
    providerId,
    serviceId,
    date,
    time,
    duration,
    status = 'pending',
    totalAmount,
    currency = 'NGN',
    paymentStatus = 'pending',
    notes,
    address
  }) {
    const result = await this.table()
      .insert(stripUndefined({
        id,
        customer_id: customerId,
        provider_id: providerId,
        service_id: serviceId,
        date: normalizeDateString(date),
        start_time: time,
        duration_minutes: duration,
        status,
        total_amount: totalAmount,
        currency,
        payment_status: paymentStatus,
        notes,
        address: address || {}
      }))
      .select(BOOKING_SELECT)
      .single();

    return mapBookingRow(ensureNoError(result, 'Create booking'));
  }

  async listUserBookings({ userId, type, status, page = 1, limit = 10 } = {}) {
    let query = this.table().select(BOOKING_SELECT, { count: 'exact' });
    const quotedUserId = quotePostgrestValue(userId);

    if (type === 'provider') {
      query = query.eq('provider_id', userId);
    } else if (type === 'customer') {
      query = query.eq('customer_id', userId);
    } else {
      query = query.or(`customer_id.eq.${quotedUserId},provider_id.eq.${quotedUserId}`);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const numericPage = Number(page) || 1;
    const numericLimit = Number(limit) || 10;
    const from = (numericPage - 1) * numericLimit;
    const to = from + numericLimit - 1;
    const result = await query.order('created_at', { ascending: false }).range(from, to);
    const data = ensureNoError(result, 'List user bookings') || [];

    return {
      data: data.map(mapBookingRow),
      pagination: {
        page: numericPage,
        limit: numericLimit,
        total: result.count || 0,
        pages: Math.ceil((result.count || 0) / numericLimit)
      }
    };
  }

  async findById(id) {
    const result = await this.table()
      .select(BOOKING_SELECT)
      .eq('id', id)
      .maybeSingle();

    return mapBookingRow(ensureNoError(result, 'Find booking by id'));
  }

  async updateBooking(id, updates) {
    const result = await this.table()
      .update(toBookingUpdatePayload(updates))
      .eq('id', id)
      .select(BOOKING_SELECT)
      .single();

    return mapBookingRow(ensureNoError(result, 'Update booking'));
  }

  async listUpcomingReminders(fromDate = new Date()) {
    const date = getTomorrowDateString(fromDate);
    const result = await this.table()
      .select(BOOKING_SELECT)
      .eq('status', 'confirmed')
      .eq('reminder_sent', false)
      .gte('date', date)
      .lte('date', date)
      .order('start_time', { ascending: true });

    return (ensureNoError(result, 'List booking reminders') || []).map(mapBookingRow);
  }

  async markReminderSent(id) {
    return this.updateBooking(id, { reminderSent: true });
  }

  async createBookingAtomic({
    id,
    customerId,
    providerId,
    serviceId,
    date,
    time,
    duration,
    totalAmount,
    notes,
    address
  }) {
    const result = await this.client.rpc('create_booking_atomic', {
      p_booking_id: id,
      p_customer_id: customerId,
      p_provider_id: providerId,
      p_service_id: serviceId,
      p_date: normalizeDateString(date),
      p_time: time,
      p_duration: duration,
      p_total_amount: totalAmount,
      p_notes: notes || null,
      p_address: address || {}
    });

    ensureNoError(result, 'Create booking atomic');
    return this.findById(id);
  }

  async updateBookingStatusAtomic({
    bookingId,
    userId,
    status,
    newDate,
    newTime,
    duration,
    notes,
    address,
    completedAt
  }) {
    const result = await this.client.rpc('update_booking_status_atomic', {
      p_booking_id: bookingId,
      p_user_id: userId,
      p_status: status,
      p_new_date: newDate ? normalizeDateString(newDate) : null,
      p_new_time: newTime || null,
      p_duration: duration || null,
      p_notes: notes || null,
      p_address: address || null,
      p_completed_at: completedAt || null
    });

    ensureNoError(result, 'Update booking status atomic');
    return this.findById(bookingId);
  }
}

module.exports = {
  BOOKING_SELECT,
  BookingRepository,
  bookingRepository: new BookingRepository(),
  toBookingUpdatePayload,
  getTomorrowDateString
};
