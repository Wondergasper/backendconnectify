const Review = require('../models/Review');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Service = require('../models/Service');

// Create a review for a completed booking
exports.createReview = async (req, res) => {
  try {
    const { bookingId, rating, comment, images } = req.body;

    // Find the booking to ensure it's completed and belongs to the user
    const booking = await Booking.findOne({
      _id: bookingId,
      customer: req.user._id,
      status: 'completed'
    }).populate('provider service');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found or not completed' });
    }

    // Check if user has already reviewed this service/provider
    const existingReview = await Review.findOne({
      customer: req.user._id,
      booking: bookingId
    });

    if (existingReview) {
      return res.status(400).json({ error: 'You have already reviewed this booking' });
    }

    // Create the review
    const review = new Review({
      customer: req.user._id,
      provider: booking.provider._id,
      booking: bookingId,
      service: booking.service._id,
      rating,
      comment,
      images: images || []
    });

    await review.save();

    // Update the booking with the review reference
    booking.rating = {
      value: rating,
      comment,
      date: new Date()
    };
    await booking.save();

    // Update provider's overall rating
    const providerReviews = await Review.find({ provider: booking.provider._id });
    const totalProviderRating = providerReviews.reduce((sum, r) => sum + r.rating, 0);
    const avgProviderRating = totalProviderRating / providerReviews.length;

    await User.findByIdAndUpdate(booking.provider._id, {
      rating: {
        average: avgProviderRating,
        count: providerReviews.length
      }
    });

    // Update service's average rating
    const serviceReviews = await Review.find({ service: booking.service._id });
    const totalServiceRating = serviceReviews.reduce((sum, r) => sum + r.rating, 0);
    const avgServiceRating = totalServiceRating / serviceReviews.length;

    await Service.findByIdAndUpdate(booking.service._id, {
      rating: {
        average: avgServiceRating,
        count: serviceReviews.length
      }
    });

    await review.populate([
      { path: 'customer', select: 'name profile.avatar' },
      { path: 'provider', select: 'name profile.avatar' },
      { path: 'service', select: 'name' }
    ]);

    res.status(201).json({
      success: true,
      review
    });
  } catch (error) {
    console.error('Create review error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get reviews for a service
exports.getServiceReviews = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const reviews = await Review.find({ service: serviceId })
      .populate([
        { path: 'customer', select: 'name profile.avatar' },
        { path: 'provider', select: 'name profile.avatar' }
      ])
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Review.countDocuments({ service: serviceId });

    // Calculate average rating for the service
    const service = await Service.findById(serviceId);
    const averageRating = reviews.length > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : 0;

    res.json({
      success: true,
      data: reviews,
      averageRating: parseFloat(averageRating.toFixed(1)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get service reviews error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get reviews for a provider
exports.getProviderReviews = async (req, res) => {
  try {
    const { providerId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const reviews = await Review.find({ provider: providerId })
      .populate([
        { path: 'customer', select: 'name profile.avatar' },
        { path: 'service', select: 'name' }
      ])
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Review.countDocuments({ provider: providerId });

    // Calculate average rating for the provider
    const averageRating = reviews.length > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : 0;

    res.json({
      success: true,
      data: reviews,
      averageRating: parseFloat(averageRating.toFixed(1)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get provider reviews error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get reviews by current user
exports.getUserReviews = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const reviews = await Review.find({ customer: req.user._id })
      .populate([
        { path: 'provider', select: 'name profile.avatar' },
        { path: 'service', select: 'name' }
      ])
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Review.countDocuments({ customer: req.user._id });

    res.json({
      success: true,
      data: reviews,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get user reviews error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get a specific review
exports.getReviewById = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id)
      .populate([
        { path: 'customer', select: 'name profile.avatar' },
        { path: 'provider', select: 'name profile.avatar' },
        { path: 'service', select: 'name' }
      ]);

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