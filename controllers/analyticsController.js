const analyticsService = require('../services/analyticsService');

exports.getStats = async (req, res) => {
  try {
    const stats = await analyticsService.getDashboardStats();
    
    if (!stats) {
      // Fallback for when Redis might not have all data yet
      const User = require('../models/User');
      const Service = require('../models/Service');
      const Booking = require('../models/Booking');
      
      const [totalUsers, totalServices, totalBookings] = await Promise.all([
        User.countDocuments(),
        Service.countDocuments(),
        Booking.countDocuments()
      ]);
      
      return res.json({
        success: true,
        data: {
          users: { total: totalUsers, growth: 0 },
          services: { total: totalServices },
          bookings: { total: totalBookings, daily: 0 },
          timestamp: new Date().toISOString(),
          isLive: false
        }
      });
    }

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};