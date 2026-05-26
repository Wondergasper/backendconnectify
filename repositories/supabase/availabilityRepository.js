const { BaseRepository, ensureNoError } = require('./baseRepository');
const { mapAvailabilityRow } = require('./mappers');

const AVAILABILITY_SELECT = '*,provider:provider_id(id,name,email,phone,role,profile,provider_details,rating_average,rating_count,completed_jobs_count,wallet_balance,wallet_currency,is_active,created_at,updated_at)';

const generateDefaultSlots = () => {
  const slots = [];
  for (let hour = 8; hour < 20; hour += 1) {
    slots.push({
      startTime: `${String(hour).padStart(2, '0')}:00`,
      endTime: `${String(hour + 1).padStart(2, '0')}:00`,
      isBooked: false,
      bookingId: null
    });
  }
  return slots;
};

const normalizeDateString = (date = new Date()) => {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) {
    return null;
  }
  return value.toISOString().slice(0, 10);
};

const generateDateRange = (startDate, endDate) => {
  const dates = [];
  const current = new Date(`${normalizeDateString(startDate)}T00:00:00.000Z`);
  const end = new Date(`${normalizeDateString(endDate)}T00:00:00.000Z`);

  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
};

class AvailabilityRepository extends BaseRepository {
  constructor(clientFactory) {
    super('availability', mapAvailabilityRow, clientFactory);
  }

  async findByProviderAndDate(providerId, date) {
    const normalizedDate = normalizeDateString(date);
    const result = await this.table()
      .select(AVAILABILITY_SELECT)
      .eq('provider_id', providerId)
      .eq('date', normalizedDate)
      .maybeSingle();

    return mapAvailabilityRow(ensureNoError(result, 'Find availability'));
  }

  async createAvailability({ providerId, date, slots = generateDefaultSlots(), isAvailable = true }) {
    const result = await this.table()
      .insert({
        provider_id: providerId,
        date: normalizeDateString(date),
        slots,
        is_available: isAvailable
      })
      .select(AVAILABILITY_SELECT)
      .single();

    return mapAvailabilityRow(ensureNoError(result, 'Create availability'));
  }

  async getOrCreate({ providerId, date }) {
    const existing = await this.findByProviderAndDate(providerId, date);
    if (existing) return existing;

    return this.createAvailability({
      providerId,
      date,
      slots: generateDefaultSlots(),
      isAvailable: true
    });
  }

  async listRange({ providerId, startDate, endDate }) {
    const start = normalizeDateString(startDate || new Date());
    const end = normalizeDateString(endDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));

    const result = await this.table()
      .select(AVAILABILITY_SELECT)
      .eq('provider_id', providerId)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true });

    const existing = (ensureNoError(result, 'List availability range') || []).map(mapAvailabilityRow);
    const byDate = new Map(existing.map((availability) => [availability.date, availability]));

    for (const date of generateDateRange(start, end)) {
      if (!byDate.has(date)) {
        const created = await this.createAvailability({ providerId, date });
        byDate.set(date, created);
      }
    }

    return Array.from(byDate.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  async upsertAvailability({ providerId, date, slots, isAvailable }) {
    const existing = await this.findByProviderAndDate(providerId, date);
    if (!existing) {
      return this.createAvailability({
        providerId,
        date,
        slots: slots || generateDefaultSlots(),
        isAvailable: isAvailable !== undefined ? isAvailable : true
      });
    }

    const payload = {};
    if (slots !== undefined) payload.slots = slots;
    if (isAvailable !== undefined) payload.is_available = isAvailable;

    const result = await this.table()
      .update(payload)
      .eq('id', existing._id)
      .select(AVAILABILITY_SELECT)
      .single();

    return mapAvailabilityRow(ensureNoError(result, 'Update availability'));
  }

  async bookSlot({ providerId, date, startTime, bookingId }) {
    const availability = await this.findByProviderAndDate(providerId, date);
    if (!availability) {
      const error = new Error('Availability not found for this date');
      error.statusCode = 404;
      throw error;
    }

    const slotIndex = availability.slots.findIndex((slot) => slot.startTime === startTime);
    if (slotIndex === -1) {
      const error = new Error('Time slot not found');
      error.statusCode = 400;
      throw error;
    }

    if (availability.slots[slotIndex].isBooked) {
      const error = new Error('Time slot is already booked');
      error.statusCode = 400;
      throw error;
    }

    const slots = availability.slots.map((slot, index) =>
      index === slotIndex ? { ...slot, isBooked: true, bookingId } : slot
    );

    return this.upsertAvailability({ providerId, date, slots, isAvailable: availability.isAvailable });
  }

  async unbookSlot({ providerId, date, startTime, bookingId }) {
    const availability = await this.findByProviderAndDate(providerId, date);
    if (!availability) {
      const error = new Error('Availability not found for this date');
      error.statusCode = 404;
      throw error;
    }

    const slotIndex = availability.slots.findIndex((slot) =>
      slot.startTime === startTime && slot.bookingId && String(slot.bookingId) === String(bookingId)
    );

    if (slotIndex === -1) {
      const error = new Error('Time slot not found or does not match booking');
      error.statusCode = 400;
      throw error;
    }

    const slots = availability.slots.map((slot, index) =>
      index === slotIndex ? { ...slot, isBooked: false, bookingId: null } : slot
    );

    return this.upsertAvailability({ providerId, date, slots, isAvailable: availability.isAvailable });
  }
}

module.exports = {
  AVAILABILITY_SELECT,
  AvailabilityRepository,
  availabilityRepository: new AvailabilityRepository(),
  generateDefaultSlots,
  normalizeDateString,
  generateDateRange
};
