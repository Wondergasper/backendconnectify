const { BaseRepository, ensureNoError } = require('./baseRepository');
const { mapReviewRow } = require('./mappers');

const USER_COLUMNS = 'id,name,email,phone,role,profile,provider_details,rating_average,rating_count,completed_jobs_count,wallet_balance,wallet_currency,is_active,created_at,updated_at';
const SERVICE_COLUMNS = 'id,name,provider_id,category,description,price,price_type,duration_minutes,images,location,rating_average,rating_count,services_offered,gallery,is_active,created_at,updated_at';
const BOOKING_COLUMNS = 'id,customer_id,provider_id,service_id,date,start_time,duration_minutes,status,total_amount,currency,payment_status,notes,address,completed_at,rating,service_images,reminder_sent,created_at,updated_at';
const REVIEW_SELECT = `*,customer:customer_id(${USER_COLUMNS}),provider:provider_id(${USER_COLUMNS}),service:service_id(${SERVICE_COLUMNS}),booking:booking_id(${BOOKING_COLUMNS})`;

const calculateAverage = (reviews) => {
  if (!reviews.length) return 0;
  const total = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);
  return Number((total / reviews.length).toFixed(1));
};

const getPagination = ({ page, limit, total }) => ({
  page,
  limit,
  total,
  pages: Math.ceil(total / limit)
});

class ReviewRepository extends BaseRepository {
  constructor(clientFactory) {
    super('reviews', mapReviewRow, clientFactory);
  }

  async createForCompletedBooking({ bookingId, customerId, rating, comment, images = [] }) {
    const result = await this.client.rpc('create_review_for_completed_booking', {
      p_booking_id: bookingId,
      p_customer_id: customerId,
      p_rating: rating,
      p_comment: comment,
      p_images: images
    });
    const data = ensureNoError(result, 'Create review for completed booking') || {};
    return this.findById(data.reviewId || data.review_id || data.id);
  }

  async findById(id) {
    const result = await this.table()
      .select(REVIEW_SELECT)
      .eq('id', id)
      .maybeSingle();

    return mapReviewRow(ensureNoError(result, 'Find review by id'));
  }

  async listByService({ serviceId, page = 1, limit = 10 } = {}) {
    return this.listReviews({ filters: { service_id: serviceId }, page, limit });
  }

  async listByProvider({ providerId, page = 1, limit = 10 } = {}) {
    return this.listReviews({ filters: { provider_id: providerId }, page, limit });
  }

  async listByCustomer({ customerId, page = 1, limit = 10 } = {}) {
    return this.listReviews({ filters: { customer_id: customerId }, page, limit });
  }

  async listAll({ page = 1, limit = 25, rating, search } = {}) {
    return this.listReviews({
      filters: rating ? { rating } : {},
      page,
      limit,
      search
    });
  }

  async listReviews({ filters = {}, page = 1, limit = 10, search } = {}) {
    const numericPage = Number(page) || 1;
    const numericLimit = Number(limit) || 10;
    let query = this.table().select(REVIEW_SELECT, { count: 'exact' });

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query = query.eq(key, value);
      }
    });

    if (search) {
      query = query.ilike('comment', `%${String(search).replace(/[%_]/g, '\\$&')}%`);
    }

    const from = (numericPage - 1) * numericLimit;
    const to = from + numericLimit - 1;
    const result = await query.order('created_at', { ascending: false }).range(from, to);
    const data = (ensureNoError(result, 'List reviews') || []).map(mapReviewRow);

    return {
      data,
      averageRating: calculateAverage(data),
      pagination: getPagination({
        page: numericPage,
        limit: numericLimit,
        total: result.count || 0
      })
    };
  }

  async deleteAndRecalculate(reviewId) {
    const result = await this.client.rpc('delete_review_and_recalculate_ratings', {
      p_review_id: reviewId
    });
    const data = ensureNoError(result, 'Delete review and recalculate ratings') || {};

    return {
      ...data,
      review: mapReviewRow(data.review)
    };
  }
}

module.exports = {
  REVIEW_SELECT,
  ReviewRepository,
  reviewRepository: new ReviewRepository(),
  calculateAverage
};
