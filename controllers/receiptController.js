const { bookingRepository } = require('../repositories/supabase/bookingRepository');

const getId = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
};

const canAccessBooking = (booking, user) =>
  user?.role === 'admin' ||
  getId(booking.customer) === String(user?._id) ||
  getId(booking.provider) === String(user?._id);

const loadAccessibleBooking = async (req, res) => {
  const booking = await bookingRepository.findById(req.params.id);

  if (!booking) {
    res.status(404).json({ error: 'Booking not found' });
    return null;
  }

  if (!canAccessBooking(booking, req.user)) {
    res.status(403).json({ error: 'Access denied' });
    return null;
  }

  return booking;
};

exports.generateReceipt = async (req, res) => {
  try {
    const booking = await loadAccessibleBooking(req, res);
    if (!booking) return;

    const receiptData = {
      bookingId: booking._id,
      receiptDate: booking.createdAt,
      service: booking.service?.name,
      serviceDescription: booking.service?.description,
      customerName: booking.customer?.name,
      customerEmail: booking.customer?.email,
      providerName: booking.provider?.name,
      providerEmail: booking.provider?.email,
      bookingDate: booking.date,
      bookingTime: booking.time,
      duration: booking.duration,
      address: booking.address,
      notes: booking.notes,
      totalAmount: booking.totalAmount,
      status: booking.status,
      paymentStatus: booking.paymentStatus || 'Pending'
    };

    res.json({
      success: true,
      data: receiptData
    });
  } catch (error) {
    console.error('Generate receipt error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getReceiptAsPDF = async (req, res) => {
  try {
    const booking = await loadAccessibleBooking(req, res);
    if (!booking) return;

    const receiptHTML = generateReceiptHTML(booking);

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename=booking-receipt-${booking._id}.html`);
    res.setHeader('Content-Length', Buffer.byteLength(receiptHTML, 'utf8'));

    res.send(receiptHTML);
  } catch (error) {
    console.error('Get receipt as PDF error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const escapeHTML = (str) => {
  if (str === null || str === undefined) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const formatAddress = (address) => {
  if (!address) return 'N/A';
  if (typeof address === 'string') return address;
  return [address.street, address.city, address.state, address.country].filter(Boolean).join(', ') || 'N/A';
};

function generateReceiptHTML(booking) {
  const safeId = escapeHTML(booking._id);
  const safeProviderName = escapeHTML(booking.provider?.name || '');
  const safeProviderEmail = escapeHTML(booking.provider?.email || '');
  const safeCustomerName = escapeHTML(booking.customer?.name || '');
  const safeCustomerEmail = escapeHTML(booking.customer?.email || '');
  const safeServiceName = escapeHTML(booking.service?.name || '');
  const safeServiceDescription = escapeHTML(booking.service?.description || 'N/A');
  const safeDate = escapeHTML(booking.date ? new Date(booking.date).toLocaleDateString() : 'N/A');
  const safeTime = escapeHTML(booking.time || '');
  const safeDuration = escapeHTML(booking.duration || 'N/A');
  const safeAddress = escapeHTML(formatAddress(booking.address));
  const safeStatus = escapeHTML(booking.status || '');
  const safeNotes = escapeHTML(booking.notes || 'N/A');
  const safePaymentStatus = escapeHTML(booking.paymentStatus || 'Pending');
  const safeTotalAmount = escapeHTML(booking.totalAmount?.toLocaleString() || '0');

  return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Booking Receipt - ${safeId}</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 20px; margin-bottom: 20px; }
            .receipt-details { display: flex; justify-content: space-between; margin-bottom: 30px; }
            .section { margin-bottom: 20px; }
            .section h3 { color: #3b82f6; border-bottom: 1px solid #eee; padding-bottom: 5px; }
            .detail-row { display: flex; justify-content: space-between; padding: 5px 0; }
            .total { font-weight: bold; font-size: 18px; border-top: 2px solid #eee; padding-top: 10px; margin-top: 10px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Booking Receipt</h1>
            <p>Receipt #${safeId}</p>
            <p>Date: ${escapeHTML(new Date().toLocaleDateString())}</p>
        </div>
        
        <div class="receipt-details">
            <div>
                <h3>Service Provider</h3>
                <p>${safeProviderName}</p>
                <p>${safeProviderEmail}</p>
            </div>
            
            <div>
                <h3>Customer</h3>
                <p>${safeCustomerName}</p>
                <p>${safeCustomerEmail}</p>
            </div>
        </div>
        
        <div class="section">
            <h3>Service Details</h3>
            <div class="detail-row"><span>Service:</span> <span>${safeServiceName}</span></div>
            <div class="detail-row"><span>Description:</span> <span>${safeServiceDescription}</span></div>
            <div class="detail-row"><span>Date:</span> <span>${safeDate}</span></div>
            <div class="detail-row"><span>Time:</span> <span>${safeTime}</span></div>
            <div class="detail-row"><span>Duration:</span> <span>${safeDuration}</span></div>
            <div class="detail-row"><span>Address:</span> <span>${safeAddress}</span></div>
        </div>
        
        <div class="section">
            <h3>Booking Information</h3>
            <div class="detail-row"><span>Booking ID:</span> <span>${safeId}</span></div>
            <div class="detail-row"><span>Status:</span> <span>${safeStatus}</span></div>
            <div class="detail-row"><span>Notes:</span> <span>${safeNotes}</span></div>
            <div class="detail-row"><span>Payment Status:</span> <span>${safePaymentStatus}</span></div>
        </div>
        
        <div class="section">
            <h3>Payment</h3>
            <div class="detail-row total"><span>Total Amount:</span> <span>NGN ${safeTotalAmount}</span></div>
        </div>
        
        <div style="text-align: center; margin-top: 40px; color: #666; font-size: 12px;">
            <p>Thank you for using Connectify!</p>
            <p>This is a computer-generated receipt. No signature required.</p>
        </div>
    </body>
    </html>
  `;
}

exports.getReceiptDetails = async (req, res) => {
  try {
    const booking = await loadAccessibleBooking(req, res);
    if (!booking) return;

    res.json({
      success: true,
      data: {
        bookingId: booking._id,
        service: {
          name: booking.service?.name,
          description: booking.service?.description
        },
        customer: {
          name: booking.customer?.name,
          avatar: booking.customer?.profile?.avatar
        },
        provider: {
          name: booking.provider?.name,
          avatar: booking.provider?.profile?.avatar
        },
        date: booking.date,
        time: booking.time,
        duration: booking.duration,
        address: booking.address,
        notes: booking.notes,
        totalAmount: booking.totalAmount,
        status: booking.status,
        createdAt: booking.createdAt,
        completedAt: booking.completedAt
      }
    });
  } catch (error) {
    console.error('Get receipt details error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
