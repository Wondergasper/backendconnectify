const analyticsService = require('../services/analyticsService');

exports.getStats = async (req, res) => {
  try {
    const stats = await analyticsService.getDashboardStats();
    
    if (!stats) {
      const { userRepository, serviceRepository, bookingRepository } = require('../repositories/supabase');
      
      const [userRes, serviceRes, bookingRes] = await Promise.all([
        userRepository.table().select('id', { count: 'exact', head: true }),
        serviceRepository.table().select('id', { count: 'exact', head: true }),
        bookingRepository.table().select('id', { count: 'exact', head: true })
      ]);
      
      const totalUsers = userRes.count || 0;
      const totalServices = serviceRes.count || 0;
      const totalBookings = bookingRes.count || 0;
      
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