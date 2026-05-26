const { clearCache } = require('../middleware/cache');
const { serviceRepository } = require('../repositories/supabase/serviceRepository');

const buildServicePayload = (body, providerId) => ({
  providerId,
  name: body.name,
  category: body.category,
  description: body.description,
  price: body.price,
  priceType: body.priceType,
  duration: body.duration,
  images: body.images,
  location: body.location,
  servicesOffered: body.servicesOffered || []
});

const buildUpdatePayload = ({ name, category, description, price, priceType, duration, images, location, servicesOffered, isActive }) => {
  const payload = {};
  if (name !== undefined) payload.name = name;
  if (category !== undefined) payload.category = category;
  if (description !== undefined) payload.description = description;
  if (price !== undefined) payload.price = price;
  if (priceType !== undefined) payload.price_type = priceType;
  if (duration !== undefined) payload.duration_minutes = duration;
  if (images !== undefined) payload.images = images;
  if (location !== undefined) payload.location = location;
  if (servicesOffered !== undefined) payload.services_offered = servicesOffered;
  if (isActive !== undefined) payload.is_active = isActive;
  return payload;
};

const clearServiceCaches = (serviceId) => {
  clearCache('/services');
  clearCache('/services/search');
  if (serviceId) {
    clearCache(`/services/${serviceId}`);
  }
};

exports.createService = async (req, res) => {
  try {
    if (req.user.role !== 'provider') {
      return res.status(403).json({ error: 'Only service providers can create services' });
    }

    const service = await serviceRepository.createService(buildServicePayload(req.body, req.user._id));
    clearServiceCaches(service._id);

    res.status(201).json({
      success: true,
      data: service
    });
  } catch (error) {
    console.error('Create service error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getServices = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;

    const { data, pagination } = await serviceRepository.listServices({
      page,
      limit,
      category: req.query.category,
      search: req.query.search,
      minPrice: req.query.minPrice,
      maxPrice: req.query.maxPrice,
      minRating: req.query.minRating,
      providerId: req.query.providerId
    });

    res.json({
      success: true,
      data,
      pagination
    });
  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getServiceById = async (req, res) => {
  try {
    const service = await serviceRepository.findById(req.params.id);

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

exports.updateService = async (req, res) => {
  try {
    const service = await serviceRepository.updateService(
      req.params.id,
      buildUpdatePayload(req.body),
      req.user
    );

    if (!service) {
      return res.status(404).json({ error: 'Service not found or you do not have permission' });
    }

    clearServiceCaches(service._id);

    res.json({
      success: true,
      service
    });
  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.deleteService = async (req, res) => {
  try {
    const service = await serviceRepository.deleteService(req.params.id, req.user);

    if (!service) {
      return res.status(404).json({ error: 'Service not found or you do not have permission' });
    }

    clearServiceCaches(service._id);

    res.json({
      success: true,
      message: 'Service deleted successfully'
    });
  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.searchServices = async (req, res) => {
  try {
    const data = await serviceRepository.searchServices({
      search: req.query.search,
      category: req.query.category,
      minPrice: req.query.minPrice,
      maxPrice: req.query.maxPrice,
      minRating: req.query.minRating,
      providerId: req.query.providerId
    });

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Search services error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
