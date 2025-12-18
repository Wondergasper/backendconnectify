const Availability = require('../models/Availability');
const Booking = require('../models/Booking');

// Get provider availability for a specific date
exports.getAvailability = async (req, res) => {
  try {
    const { providerId, date } = req.query;
    
    if (!providerId) {
      return res.status(400).json({ error: 'Provider ID is required' });
    }

    const queryDate = date ? new Date(date) : new Date();
    // Normalize to start of day
    queryDate.setHours(0, 0, 0, 0);

    let availability = await Availability.findOne({
      provider: providerId,
      date: queryDate
    }).populate('provider', 'name profile.avatar');

    if (!availability) {
      // Create default availability if none exists
      availability = await Availability.create({
        provider: providerId,
        date: queryDate,
        slots: generateDefaultSlots(),
        isAvailable: true
      });
    }

    res.json({
      success: true,
      data: availability
    });
  } catch (error) {
    console.error('Get availability error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get provider availability for a range of dates
exports.getAvailabilityRange = async (req, res) => {
  try {
    const { providerId, startDate, endDate } = req.query;
    
    if (!providerId) {
      return res.status(400).json({ error: 'Provider ID is required' });
    }

    const start = startDate ? new Date(startDate) : new Date();
    const end = endDate ? new Date(endDate) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // Next 14 days

    // Normalize dates to start of day
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    let availability = await Availability.find({
      provider: providerId,
      date: { $gte: start, $lte: end }
    }).populate('provider', 'name profile.avatar');

    // Generate availability for dates that don't exist yet
    const dateRange = generateDateRange(start, end);
    for (const date of dateRange) {
      const existing = availability.find(av => new Date(av.date).toDateString() === date.toDateString());
      if (!existing) {
        const newAv = await Availability.create({
          provider: providerId,
          date,
          slots: generateDefaultSlots(),
          isAvailable: true
        });
        availability.push(newAv);
      }
    }

    // Sort by date
    availability.sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({
      success: true,
      data: availability
    });
  } catch (error) {
    console.error('Get availability range error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Update provider availability
exports.updateAvailability = async (req, res) => {
  try {
    const { date, slots, isAvailable } = req.body;
    const providerId = req.user._id;

    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }

    const queryDate = new Date(date);
    queryDate.setHours(0, 0, 0, 0);

    let availability = await Availability.findOne({
      provider: providerId,
      date: queryDate
    });

    if (!availability) {
      // Create new availability for the date
      availability = await Availability.create({
        provider: providerId,
        date: queryDate,
        slots: slots || generateDefaultSlots(),
        isAvailable: isAvailable !== undefined ? isAvailable : true
      });
    } else {
      // Update existing availability
      if (slots !== undefined) {
        availability.slots = slots;
      }
      if (isAvailable !== undefined) {
        availability.isAvailable = isAvailable;
      }
      await availability.save();
    }

    res.json({
      success: true,
      data: availability
    });
  } catch (error) {
    console.error('Update availability error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Mark a specific time slot as booked
exports.bookSlot = async (req, res) => {
  try {
    const { date, startTime, bookingId } = req.body;
    const providerId = req.user._id;

    if (!date || !startTime || !bookingId) {
      return res.status(400).json({ error: 'Date, start time, and booking ID are required' });
    }

    const queryDate = new Date(date);
    queryDate.setHours(0, 0, 0, 0);

    const availability = await Availability.findOne({
      provider: providerId,
      date: queryDate
    });

    if (!availability) {
      return res.status(404).json({ error: 'Availability not found for this date' });
    }

    const slotIndex = availability.slots.findIndex(slot => slot.startTime === startTime);
    if (slotIndex === -1) {
      return res.status(400).json({ error: 'Time slot not found' });
    }

    if (availability.slots[slotIndex].isBooked) {
      return res.status(400).json({ error: 'Time slot is already booked' });
    }

    availability.slots[slotIndex].isBooked = true;
    availability.slots[slotIndex].bookingId = bookingId;

    await availability.save();

    res.json({
      success: true,
      data: availability
    });
  } catch (error) {
    console.error('Book slot error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Mark a specific time slot as unbooked (when booking is cancelled)
exports.unbookSlot = async (req, res) => {
  try {
    const { date, startTime, bookingId } = req.body;
    const providerId = req.user._id;

    if (!date || !startTime || !bookingId) {
      return res.status(400).json({ error: 'Date, start time, and booking ID are required' });
    }

    const queryDate = new Date(date);
    queryDate.setHours(0, 0, 0, 0);

    const availability = await Availability.findOne({
      provider: providerId,
      date: queryDate
    });

    if (!availability) {
      return res.status(404).json({ error: 'Availability not found for this date' });
    }

    const slotIndex = availability.slots.findIndex(slot => 
      slot.startTime === startTime && slot.bookingId.toString() === bookingId
    );
    
    if (slotIndex === -1) {
      return res.status(400).json({ error: 'Time slot not found or does not match booking' });
    }

    availability.slots[slotIndex].isBooked = false;
    availability.slots[slotIndex].bookingId = null;

    await availability.save();

    res.json({
      success: true,
      data: availability
    });
  } catch (error) {
    console.error('Unbook slot error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Helper function to generate default time slots (every hour from 8 AM to 8 PM)
function generateDefaultSlots() {
  const slots = [];
  for (let hour = 8; hour < 20; hour++) {
    const startTime = hour.toString().padStart(2, '0') + ':00';
    const endTime = (hour + 1).toString().padStart(2, '0') + ':00';
    slots.push({
      startTime,
      endTime,
      isBooked: false,
      bookingId: null
    });
  }
  return slots;
}

// Helper function to generate date range
function generateDateRange(startDate, endDate) {
  const dates = [];
  const currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    dates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return dates;
}