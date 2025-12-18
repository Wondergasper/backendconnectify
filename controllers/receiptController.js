const Booking = require('../models/Booking');
const User = require('../models/User');
const Service = require('../models/Service');
const fs = require('fs');
const path = require('path');

// Generate booking receipt
exports.generateReceipt = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('service', 'name price description')
      .populate('customer', 'name email phone')
      .populate('provider', 'name email phone');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check if user is customer or provider for this booking
    if (
      booking.customer.toString() !== req.user._id.toString() &&
      booking.provider.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Create receipt data
    const receiptData = {
      bookingId: booking._id,
      bookingDate: booking.createdAt,
      service: booking.service.name,
      serviceDescription: booking.service.description,
      customerName: booking.customer.name,
      customerEmail: booking.customer.email,
      providerName: booking.provider.name,
      providerEmail: booking.provider.email,
      bookingDate: booking.date,
      bookingTime: booking.time,
      duration: booking.duration,
      address: booking.address,
      notes: booking.notes,
      totalAmount: booking.totalAmount,
      status: booking.status,
      paymentStatus: booking.paymentStatus || 'Pending'
    };

    // In a real implementation, you would generate a PDF or HTML receipt
    // For now, we'll return the receipt data as JSON
    res.json({
      success: true,
      data: receiptData
    });
  } catch (error) {
    console.error('Generate receipt error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Generate and return receipt as PDF
exports.getReceiptAsPDF = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('service', 'name price description')
      .populate('customer', 'name email phone')
      .populate('provider', 'name email phone');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check if user is customer or provider for this booking
    if (
      booking.customer.toString() !== req.user._id.toString() &&
      booking.provider.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // For now, returning HTML with proper headers as a temporary solution
    // In production, integrate with a PDF library like puppeteer or pdfkit
    const receiptHTML = generateReceiptHTML(booking);

    // Set response headers for proper file download
    res.setHeader('Content-Type', 'text/html'); // Change back to HTML since we're sending HTML
    res.setHeader('Content-Disposition', `attachment; filename=booking-receipt-${booking._id}.html`);
    res.setHeader('Content-Length', Buffer.byteLength(receiptHTML, 'utf8'));

    res.send(receiptHTML);
  } catch (error) {
    console.error('Get receipt as PDF error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Helper function to generate HTML receipt
function generateReceiptHTML(booking) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Booking Receipt - ${booking._id}</title>
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
            <p>Receipt #${booking._id}</p>
            <p>Date: ${new Date().toLocaleDateString()}</p>
        </div>
        
        <div class="receipt-details">
            <div>
                <h3>Service Provider</h3>
                <p>${booking.provider.name}</p>
                <p>${booking.provider.email}</p>
            </div>
            
            <div>
                <h3>Customer</h3>
                <p>${booking.customer.name}</p>
                <p>${booking.customer.email}</p>
            </div>
        </div>
        
        <div class="section">
            <h3>Service Details</h3>
            <div class="detail-row"><span>Service:</span> <span>${booking.service.name}</span></div>
            <div class="detail-row"><span>Description:</span> <span>${booking.service.description || 'N/A'}</span></div>
            <div class="detail-row"><span>Date:</span> <span>${new Date(booking.date).toLocaleDateString()}</span></div>
            <div class="detail-row"><span>Time:</span> <span>${booking.time}</span></div>
            <div class="detail-row"><span>Duration:</span> <span>${booking.duration || 'N/A'}</span></div>
            <div class="detail-row"><span>Address:</span> <span>${booking.address || 'N/A'}</span></div>
        </div>
        
        <div class="section">
            <h3>Booking Information</h3>
            <div class="detail-row"><span>Booking ID:</span> <span>${booking._id}</span></div>
            <div class="detail-row"><span>Status:</span> <span>${booking.status}</span></div>
            <div class="detail-row"><span>Notes:</span> <span>${booking.notes || 'N/A'}</span></div>
            <div class="detail-row"><span>Payment Status:</span> <span>${booking.paymentStatus || 'Pending'}</span></div>
        </div>
        
        <div class="section">
            <h3>Payment</h3>
            <div class="detail-row total"><span>Total Amount:</span> <span>₦${booking.totalAmount?.toLocaleString() || '0'}</span></div>
        </div>
        
        <div style="text-align: center; margin-top: 40px; color: #666; font-size: 12px;">
            <p>Thank you for using Connectify!</p>
            <p>This is a computer-generated receipt. No signature required.</p>
        </div>
    </body>
    </html>
  `;
}

// Get booking receipt details
exports.getReceiptDetails = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('service', 'name price description')
      .populate('customer', 'name profile')
      .populate('provider', 'name profile');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check if user is customer or provider for this booking
    if (
      booking.customer.toString() !== req.user._id.toString() &&
      booking.provider.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      success: true,
      data: {
        bookingId: booking._id,
        service: {
          name: booking.service.name,
          description: booking.service.description
        },
        customer: {
          name: booking.customer.name,
          avatar: booking.customer.profile?.avatar
        },
        provider: {
          name: booking.provider.name,
          avatar: booking.provider.profile?.avatar
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