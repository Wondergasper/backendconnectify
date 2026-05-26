const { reviewRepository } = require('../repositories/supabase/reviewRepository');
const { logAudit } = require('../utils/auditLogger');
const notificationService = require('../services/notification/inappService');

const getStatusCode = (error) => {
  const message = error.message || '';
  if (message.includes('not found')) return 404;
  if (message.includes('already reviewed') || message.includes('between 1 and 5')) return 400;
  return 500;
};

exports.createReview = async (req, res) => {
  try {
    const { bookingId, rating, comment, images } = req.body;

    const review = await reviewRepository.createForCompletedBooking({
      bookingId,
      customerId: req.user._id,
      rating,
      comment,
      images: images || []
    });

    // Fire real-time notification to the provider
    try {
      const io = req.app.get('io');
      const providerId = review.provider?._id || review.provider?.id || review.provider;
      if (providerId) {
        const notification = await notificationService.sendInApp({
          userId: String(providerId),
          title: 'New Review',
          body: `You received a ${rating}-star review.`,
          type: 'review',
          data: {
            bookingId,
            serviceId: review.service?._id || review.service?.id || review.service,
            rating
          }
        });
        if (io) {
          io.to(`user_${providerId}`).emit('newNotification', notification.notification);
          io.to(`notifications_${providerId}`).emit('newNotification', notification.notification);
        }
      }
    } catch (notifError) {
      console.error('Review notification error (non-fatal):', notifError.message);
    }

    res.status(201).json({
      success: true,
      review
    });
  } catch (error) {
    console.error('Create review error:', error);
    res.status(getStatusCode(error)).json({ error: error.message || 'Server error' });
  }
};

exports.getServiceReviews = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const { data, averageRating, pagination } = await reviewRepository.listByService({
      serviceId: req.params.serviceId,
      page,
      limit
    });

    res.json({
      success: true,
      data,
      averageRating,
      pagination
    });
  } catch (error) {
    console.error('Get service reviews error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getProviderReviews = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const { data, averageRating, pagination } = await reviewRepository.listByProvider({
      providerId: req.params.providerId,
      page,
      limit
    });

    res.json({
      success: true,
      data,
      averageRating,
      pagination
    });
  } catch (error) {
    console.error('Get provider reviews error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getUserReviews = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const { data, pagination } = await reviewRepository.listByCustomer({
      customerId: req.user._id,
      page,
      limit
    });

    res.json({
      success: true,
      data,
      pagination
    });
  } catch (error) {
    console.error('Get user reviews error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getReviewById = async (req, res) => {
  try {
    const review = await reviewRepository.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    res.json({
      success: true,
      review
    });
  } catch (error) {
    console.error('Get review by ID error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getAllReviews = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 25;
    const rating = req.query.rating ? Number(req.query.rating) : undefined;

    const { data, pagination } = await reviewRepository.listAll({
      page,
      limit,
      rating,
      search: req.query.search
    });

    res.json({
      success: true,
      data,
      pagination
    });
  } catch (error) {
    console.error('Get all reviews error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.deleteReview = async (req, res) => {
  try {
    const result = await reviewRepository.deleteAndRecalculate(req.params.id);

    await logAudit({
      req,
      action: 'Deleted review',
      entityType: 'review',
      entityId: req.params.id,
      target: result.review?.comment?.slice(0, 80) || 'Review',
      metadata: {
        rating: result.review?.rating,
        customer: result.review?.customer,
        provider: result.review?.provider,
        service: result.review?.service
      }
    });

    res.json({
      success: true,
      message: 'Review deleted successfully'
    });
  } catch (error) {
    console.error('Delete review error:', error);
    res.status(getStatusCode(error)).json({ error: error.message || 'Server error' });
  }
};
