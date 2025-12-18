const Service = require('../models/Service');
const User = require('../models/User');
const { clearCache } = require('../middleware/cache');
const redisService = require('../services/redisService');

// Create a new service
exports.createService = async (req, res) => {
  try {
    const { name, category, description, price, priceType, duration, images, location, servicesOffered } = req.body;

    // Check if user is a provider
    const user = await User.findById(req.user._id);
    if (user.role !== 'provider') {
      return res.status(403).json({ error: 'Only service providers can create services' });
    }

    const service = new Service({
      name,
      provider: req.user._id,
      category,
      description,
      price,
      priceType,
      duration,
      images,
      location,
      servicesOffered: servicesOffered || []
    });

    await service.save();

    // Clear relevant cache entries after creating a service
    clearCache('/services');
    clearCache('/services/search');

    res.status(201).json({
      success: true,
      data: service
    });
  } catch (error) {
    console.error('Create service error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get all services (with search and filtering)
exports.getServices = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const category = req.query.category;
    const search = req.query.search;
    const location = req.query.location;
    const minPrice = req.query.minPrice;
    const maxPrice = req.query.maxPrice;
    const minRating = req.query.minRating;

    // Generate cache key based on query parameters
    const cacheKey = `services:${JSON.stringify({
      page, limit, category, search, location, minPrice, maxPrice, minRating
    })}`;

    // Try to get from Redis cache first
    const cachedData = await redisService.getCachedServices({
      page, limit, category, search, location, minPrice, maxPrice, minRating
    });

    if (cachedData) {
      console.log(`Cache HIT for key: ${cacheKey}`);
      return res.json({
        success: true,
        data: cachedData.services,
        pagination: cachedData.pagination,
        cache: true
      });
    }


    const query = { isActive: true };

    if (category) query.category = new RegExp(category, 'i');

    // If searching, find matching providers first
    let providerIds = [];
    if (search) {
      // Search for providers by name or bio  
      const matchingProviders = await User.find({
        role: 'provider',
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { 'profile.bio': { $regex: search, $options: 'i' } }
        ]
      }).select('_id');

      providerIds = matchingProviders.map(p => p._id);

      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'servicesOffered': { $in: [new RegExp(search, 'i')] } },
        { provider: { $in: providerIds } }
      ];
    }

    if (minPrice) query.price = { ...query.price, $gte: minPrice };
    if (maxPrice) query.price = { ...query.price, $lte: maxPrice };
    if (minRating) query['rating.average'] = { $gte: minRating };

    // If location is provided, use geospatial query
    if (location) {
      // Assuming location is provided as "lng,lat" string
      const [lng, lat] = location.split(',').map(Number);
      if (lng && lat) {
        query['location.coordinates'] = {
          $geoWithin: {
            $centerSphere: [[lng, lat], 50 / 3963.2] // 50km radius in miles (3963.2 is Earth's radius in miles)
          }
        };
      }
    }

    const services = await Service.find(query)
      .populate('provider', 'name profile.avatar profile.verification')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Service.countDocuments(query);

    const responseData = {
      success: true,
      data: services,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };

    // Cache the result in Redis for 5 minutes
    await redisService.cacheServices(
      { page, limit, category, search, location, minPrice, maxPrice, minRating },
      {
        services: services,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      },
      300 // 5 minutes
    );

    res.json(responseData);
  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get service by ID
exports.getServiceById = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id)
      .populate('provider', 'name profile.avatar profile.verification rating count')
      .populate({
        path: 'provider',
        populate: {
          path: 'reviews',
          model: 'Review'
        }
      });

    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    res.json({
      success: true,
      service
    });
  } catch (error) {
    console.error('Get service by ID error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Update service (provider only)
exports.updateService = async (req, res) => {
  try {
    const { name, category, description, price, priceType, duration, images, location, servicesOffered, isActive } = req.body;

    const service = await Service.findOneAndUpdate(
      { _id: req.params.id, provider: req.user._id },
      {
        $set: {
          name,
          category,
          description,
          price,
          priceType,
          duration,
          images,
          location,
          servicesOffered,
          isActive
        }
      },
      { new: true, runValidators: true }
    );

    if (!service) {
      return res.status(404).json({ error: 'Service not found or you are not the owner' });
    }

    // Clear relevant cache entries after updating a service
    clearCache('/services');
    clearCache('/services/search');
    clearCache(`/services/${service._id}`);

    res.json({
      success: true,
      service
    });
  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Delete service (provider only)
exports.deleteService = async (req, res) => {
  try {
    const service = await Service.findOneAndDelete({
      _id: req.params.id,
      provider: req.user._id
    });

    if (!service) {
      return res.status(404).json({ error: 'Service not found or you are not the owner' });
    }

    // Clear relevant cache entries after deleting a service
    clearCache('/services');
    clearCache('/services/search');
    clearCache(`/services/${service._id}`);

    res.json({
      success: true,
      message: 'Service deleted successfully'
    });
  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Search services with advanced filters
exports.searchServices = async (req, res) => {
  try {
    const {
      search,
      category,
      minPrice,
      maxPrice,
      minRating,
      location,
      providerId
    } = req.query;

    // Generate cache key based on query parameters
    const cacheKey = `search:${JSON.stringify({
      search, category, minPrice, maxPrice, minRating, location, providerId
    })}`;

    // Try to get from Redis cache first
    const cachedData = await redisService.getClient().get(cacheKey);
    if (cachedData) {
      console.log(`Search cache HIT for key: ${cacheKey}`);
      return res.json({
        success: true,
        data: JSON.parse(cachedData),
        cache: true
      });
    }

    const query = { isActive: true };


    if (category) query.category = new RegExp(category, 'i');
    if (providerId) query.provider = providerId;

    // If searching, we need to first find matching providers
    let providerIds = [];
    if (search) {
      // Search for providers by name or bio
      const matchingProviders = await User.find({
        role: 'provider',
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { 'profile.bio': { $regex: search, $options: 'i' } }
        ]
      }).select('_id');

      providerIds = matchingProviders.map(p => p._id);

      // Build search query for services and providers
      query.$or = [
        { name: { $regex: search, $options: 'i' } },               // Service name
        { description: { $regex: search, $options: 'i' } },        // Service description
        { 'servicesOffered': { $in: [new RegExp(search, 'i')] } }, // Services array
        { provider: { $in: providerIds } }                          // Provider IDs that match
      ];
    }

    if (minPrice || maxPrice || minRating) {
      if (minPrice) query.price = { ...query.price, $gte: minPrice };
      if (maxPrice) query.price = { ...query.price, $lte: maxPrice };
      if (minRating) query['rating.average'] = { $gte: minRating };
    }

    // Handle location search if provided
    if (location) {
      // Assuming location is provided as "lng,lat" string
      const [lng, lat] = location.split(',').map(Number);
      if (lng && lat) {
        query['location.coordinates'] = {
          $geoWithin: {
            $centerSphere: [[lng, lat], 50 / 3963.2] // 50km radius in miles
          }
        };
      }
    }

    const services = await Service.find(query)
      .populate('provider', 'name profile.avatar profile.verification')
      .sort({ createdAt: -1 });

    // Cache the result in Redis for 5 minutes
    await redisService.getClient().setEx(cacheKey, 300, JSON.stringify(services)); // 5 minutes

    res.json({
      success: true,
      data: services
    });
  } catch (error) {
    console.error('Search services error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};