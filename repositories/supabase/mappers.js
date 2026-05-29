const asId = (value) => {
  if (!value) return value;
  if (typeof value === 'object') return value.id || value._id || value;
  return value;
};

const compactObject = (value, fallback = {}) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;

const mapRating = (row = {}) => ({
  average: Number(row.rating_average || 0),
  count: Number(row.rating_count || 0)
});

const mapWallet = (row = {}) => ({
  balance: Number(row.wallet_balance || 0),
  currency: row.wallet_currency || 'NGN',
  transactions: row.wallet_transactions || []
});

const mapUserRow = (row) => {
  if (!row) return null;

  return {
    _id: row.id,
    id: row.id,
    authUserId: row.auth_user_id || null,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role || 'customer',
    profile: compactObject(row.profile),
    providerDetails: compactObject(row.provider_details),
    rating: mapRating(row),
    completedJobsCount: Number(row.completed_jobs_count || 0),
    wallet: mapWallet(row),
    isActive: row.is_active !== false,
    fcmToken: row.fcm_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const mapServiceRow = (row) => {
  if (!row) return null;

  return {
    _id: row.id,
    id: row.id,
    name: row.name,
    provider: row.provider ? mapUserRow(row.provider) : row.provider_id,
    category: row.category,
    description: row.description,
    price: Number(row.price || 0),
    priceType: row.price_type || 'hourly',
    duration: Number(row.duration_minutes || 0),
    images: row.images || [],
    location: compactObject(row.location),
    rating: mapRating(row),
    servicesOffered: row.services_offered || [],
    gallery: row.gallery || [],
    isActive: row.is_active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const mapBookingRow = (row) => {
  if (!row) return null;

  return {
    _id: row.id,
    id: row.id,
    customer: row.customer ? mapUserRow(row.customer) : row.customer_id,
    provider: row.provider ? mapUserRow(row.provider) : row.provider_id,
    service: row.service ? mapServiceRow(row.service) : row.service_id,
    date: row.date,
    time: row.start_time,
    duration: Number(row.duration_minutes || 0),
    status: row.status || 'pending',
    totalAmount: Number(row.total_amount || 0),
    currency: row.currency || 'NGN',
    paymentStatus: row.payment_status || 'pending',
    notes: row.notes,
    address: compactObject(row.address),
    completedAt: row.completed_at,
    rating: compactObject(row.rating, null),
    serviceImages: row.service_images || [],
    reminderSent: Boolean(row.reminder_sent),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const mapWalletTransactionRow = (row) => {
  if (!row) return null;

  return {
    _id: row.id,
    id: row.id,
    user: row.user ? mapUserRow(row.user) : row.user_id,
    type: row.type,
    amount: Number(row.amount || 0),
    currency: row.currency || 'NGN',
    description: row.description,
    reference: row.reference,
    status: row.status || 'pending',
    metadata: compactObject(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const mapReviewRow = (row) => {
  if (!row) return null;

  return {
    _id: row.id,
    id: row.id,
    customer: row.customer ? mapUserRow(row.customer) : row.customer_id,
    provider: row.provider ? mapUserRow(row.provider) : row.provider_id,
    booking: row.booking ? mapBookingRow(row.booking) : row.booking_id,
    service: row.service ? mapServiceRow(row.service) : row.service_id,
    rating: Number(row.rating || 0),
    comment: row.comment,
    images: row.images || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const mapMessageRow = (row) => {
  if (!row) return null;

  return {
    _id: row.id,
    id: row.id,
    conversation: row.conversation_id,
    sender: row.sender ? mapUserRow(row.sender) : row.sender_id,
    recipient: row.recipient ? mapUserRow(row.recipient) : row.recipient_id,
    content: row.content,
    contentType: row.content_type || 'text',
    attachments: row.attachments || [],
    read: Boolean(row.read),
    readBy: row.read_by || [],
    delivered: Boolean(row.delivered),
    deliveredAt: row.delivered_at,
    status: row.status || 'sent',
    repliedTo: asId(row.replied_to_id),
    reactions: row.reactions || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const mapCategoryRow = (row) => {
  if (!row) return null;

  return {
    _id: row.id,
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon || 'services',
    image: row.image,
    isActive: row.is_active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const mapAuditLogRow = (row) => {
  if (!row) return null;

  const actor = row.actor ? mapUserRow(row.actor) : row.actor_id;

  return {
    _id: row.id,
    id: row.id,
    actor,
    actorName: row.actor_name || row.actor?.name || 'System',
    actorRole: row.actor_role || row.actor?.role || 'system',
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    target: row.target,
    metadata: compactObject(row.metadata),
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: row.created_at
  };
};

const mapAvailabilityRow = (row) => {
  if (!row) return null;

  return {
    _id: row.id,
    id: row.id,
    provider: row.provider ? mapUserRow(row.provider) : row.provider_id,
    date: row.date,
    slots: row.slots || [],
    isAvailable: row.is_available !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const mapPrivateUserRow = (row) => {
  const user = mapUserRow(row);
  if (!user) return null;

  return {
    ...user,
    passwordHash: row.password_hash,
    refreshTokenHash: row.refresh_token_hash,
    resetPasswordToken: row.reset_password_token,
    resetPasswordExpire: row.reset_password_expire
  };
};

const mapConversationRow = (row) => {
  if (!row) return null;

  const cp = row.conversation_participants || [];

  return {
    _id: row.id,
    id: row.id,
    participants: cp.map(item => mapUserRow(item.user) || item.user_id),
    participantReadStatus: cp.map(item => ({
      user: mapUserRow(item.user) || item.user_id,
      lastReadMessage: item.last_read_message_id,
      lastReadAt: item.last_read_at,
      unreadCount: Number(item.unread_count || 0)
    })),
    service: row.service ? mapServiceRow(row.service) : row.service_id,
    booking: row.booking ? mapBookingRow(row.booking) : row.booking_id,
    name: row.name,
    isArchived: Boolean(row.is_archived),
    isPinned: Boolean(row.is_pinned),
    unreadCount: Number(row.unread_count || 0),
    type: row.type || 'direct',
    membersCount: Number(row.members_count || 2),
    lastMessage: row.last_message ? {
      content: row.last_message.content,
      type: row.last_message.type,
      sender: row.last_message.sender,
      timestamp: row.last_message.timestamp
    } : null,
    lastMessageAt: row.last_message_at,
    isGroup: Boolean(row.is_group),
    groupInfo: compactObject(row.group_info),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const mapVerificationRow = (row) => {
  if (!row) return null;

  return {
    _id: row.id,
    id: row.id,
    user: row.user ? mapUserRow(row.user) : row.user_id,
    documentType: row.document_type,
    documentNumber: row.document_number,
    documentFront: row.document_front,
    documentBack: row.document_back,
    status: row.status || 'PENDING',
    verifiedBy: row.verified_by ? (typeof row.verified_by === 'object' ? mapUserRow(row.verified_by) : row.verified_by) : null,
    verificationDate: row.verification_date,
    rejectionReason: row.rejection_reason,
    additionalInfo: compactObject(row.additional_info),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const mapPaymentCardRow = (row) => {
  if (!row) return null;

  return {
    _id: row.id,
    id: row.id,
    user: row.user_id,
    brand: row.brand,
    last4: row.last4,
    expiryMonth: row.expiry_month,
    expiryYear: row.expiry_year,
    cardHolderName: row.card_holder_name,
    provider: row.provider || 'paystack',
    isDefault: Boolean(row.is_default),
    status: row.status || 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const mapPrivatePaymentCardRow = (row) => {
  const card = mapPaymentCardRow(row);
  if (!card) return null;
  return {
    ...card,
    authorizationCode: row.authorization_code
  };
};

const mapProviderProfileRow = (row) => {
  if (!row) return null;

  return {
    _id: row.id,
    id: row.id,
    userId: row.user_id,
    providerType: row.provider_type || 'individual',
    displayName: row.display_name,
    businessName: row.business_name || null,
    contactPersonName: row.contact_person_name || null,
    description: row.description,
    phone: row.phone,
    email: row.email,
    address: row.address,
    location: compactObject(row.location),
    operatingLocations: row.operating_locations || [],
    verificationStatus: row.verification_status || 'pending',
    rejectionReason: row.rejection_reason || null,
    rating: Number(row.rating || 0),
    isActive: row.is_active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const mapProviderServiceRow = (row) => {
  if (!row) return null;

  return {
    _id: row.id,
    id: row.id,
    providerId: row.provider_id,
    serviceName: row.service_name,
    category: row.category,
    description: row.description,
    startingPrice: row.starting_price !== null ? Number(row.starting_price) : null,
    priceType: row.price_type || 'fixed',
    isAvailable: row.is_available !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const mapTeamMemberRow = (row) => {
  if (!row) return null;

  return {
    _id: row.id,
    id: row.id,
    providerId: row.provider_id,
    fullName: row.full_name,
    role: row.role,
    phone: row.phone,
    email: row.email || null,
    status: row.status || 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const mapServiceRequestRow = (row) => {
  if (!row) return null;

  return {
    _id: row.id,
    id: row.id,
    customerId: row.customer_id,
    customer: row.customer ? mapUserRow(row.customer) : null,
    customerType: row.customer_type || 'individual',
    serviceCategory: row.service_category,
    description: row.description,
    location: compactObject(row.location),
    budget: row.budget !== null ? Number(row.budget) : null,
    urgency: row.urgency || 'normal',
    preferredDate: row.preferred_date,
    status: row.status || 'pending',
    assignedProviderId: row.assigned_provider_id || null,
    assignedTeamMemberId: row.assigned_team_member_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const mapJobQuoteRow = (row) => {
  if (!row) return null;

  return {
    _id: row.id,
    id: row.id,
    requestId: row.request_id,
    providerId: row.provider_id,
    quotedAmount: Number(row.quoted_amount || 0),
    estimatedDeliveryTime: row.estimated_delivery_time || null,
    message: row.message || null,
    status: row.status || 'pending',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

module.exports = {
  mapUserRow,
  mapPrivateUserRow,
  mapServiceRow,
  mapBookingRow,
  mapWalletTransactionRow,
  mapReviewRow,
  mapMessageRow,
  mapCategoryRow,
  mapAuditLogRow,
  mapAvailabilityRow,
  mapConversationRow,
  mapVerificationRow,
  mapPaymentCardRow,
  mapPrivatePaymentCardRow,
  mapProviderProfileRow,
  mapProviderServiceRow,
  mapTeamMemberRow,
  mapServiceRequestRow,
  mapJobQuoteRow
};
