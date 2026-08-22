const aiService = require('./aiService');
const matchingEngine = require('./matchingEngine');
const whatsappService = require('./whatsappService');
const sessionService = require('./sessionService');
const connectifyRepository = require('./connectifyRepository');
const messages = require('../templates/messages');

const getUserName = (user) =>
  user?.name || user?.full_name || user?.fullName || '';

const getUserId = (user) =>
  user?.id || user?._id;

const isInactive = (user) =>
  user?.is_active === false || user?.isActive === false || user?.is_blocked === true || user?.isBlocked === true;

// Only ever persist keys the flow understands. Anything the model or the user
// tries to smuggle in (step overrides, matchedProviders, aiCalls, ...) is dropped.
const sanitizeSessionUpdates = (updates) => {
  const clean = {};
  for (const key of aiService.ALLOWED_SESSION_KEYS) {
    if (updates[key] !== undefined) clean[key] = updates[key];
  }
  return clean;
};

const hasDateTime = (session) =>
  Boolean(session.date && aiService.normalizeTime(session.time));

class ConversationManager {
  async handleIncomingMessage(phoneNumber, message) {
    try {
      const trimmed = String(message || '').trim();
      if (!trimmed) return;

      const lower = trimmed.toLowerCase();
      const user = await connectifyRepository.findOrCreateWhatsAppUser(phoneNumber);

      if (isInactive(user)) {
        return whatsappService.sendMessage(phoneNumber, 'Your account is currently restricted. Please contact support.');
      }

      if (['cancel', 'exit', 'restart', 'reset'].includes(lower)) {
        await sessionService.clearSession(phoneNumber);
        return whatsappService.sendMessage(phoneNumber, 'Conversation reset. What service do you need today?');
      }

      if (['hi', 'hello', 'hey', 'help', 'start'].includes(lower)) {
        const firstName = getUserName(user).split(' ')[0];
        await sessionService.updateSession(phoneNumber, { step: 'READY' });
        return whatsappService.sendMessage(phoneNumber, messages.help(firstName));
      }

      const session = await sessionService.getSession(phoneNumber);
      const hasName = Boolean(getUserName(user));

      if (!hasName && session.step !== 'ONBOARDING') {
        await sessionService.updateSession(phoneNumber, { step: 'ONBOARDING' });
        return whatsappService.sendMessage(phoneNumber, messages.welcome());
      }

      if (session.step === 'ONBOARDING') {
        if (trimmed.length < 2) {
          return whatsappService.sendMessage(phoneNumber, 'Please enter your full name to continue.');
        }

        const updatedUser = await connectifyRepository.updateUserName(getUserId(user), trimmed);
        await sessionService.updateSession(phoneNumber, { step: 'READY' });

        const firstName = getUserName(updatedUser).split(' ')[0] || trimmed.split(' ')[0];
        return whatsappService.sendMessage(
          phoneNumber,
          `Nice to meet you, ${firstName}. What service do you need?`
        );
      }

      if (session.step === 'PROVIDER_SELECTION') {
        return this.handleProviderSelection(phoneNumber, trimmed, user, session);
      }

      if (session.step === 'AWAITING_CONFIRMATION') {
        return this.handleConfirmationResponse(phoneNumber, trimmed, session);
      }

      if (session.step === 'AWAITING_DATETIME') {
        return this.handleDateTimeCapture(phoneNumber, trimmed, session);
      }

      return this.handleServiceSearch(phoneNumber, trimmed, session);
    } catch (error) {
      console.error('[WhatsAppConversation] Error:', error.message || error);
      return whatsappService.sendMessage(
        phoneNumber,
        'Sorry, something went wrong while processing that. Please try again in a moment.'
      );
    }
  }

  async handleServiceSearch(phoneNumber, message, session) {
    const currentCalls = Number(session.aiCalls || 0);
    const aiResponse = await aiService.analyzeIntent(message, session);

    if (aiResponse.rateLimited) {
      await sessionService.updateSession(phoneNumber, { step: 'READY' });
      return whatsappService.sendMessage(
        phoneNumber,
        'I think we got a bit stuck there. Could you tell me the service you need and your area, e.g. "a plumber in Ikeja"?'
      );
    }

    const nextUpdates = {
      ...sanitizeSessionUpdates(aiResponse.sessionUpdates || {}),
      aiCalls: currentCalls + 1
    };

    const nextSession = await sessionService.updateSession(phoneNumber, nextUpdates);

    if (!nextSession.isConfirmed) {
      return whatsappService.sendMessage(phoneNumber, aiResponse.replyText);
    }

    await sessionService.updateSession(phoneNumber, { step: 'AWAITING_CONFIRMATION' });
    return whatsappService.sendMessage(phoneNumber, messages.confirmSummary(nextSession));
  }

  async handleConfirmationResponse(phoneNumber, message, session) {
    const text = message.toLowerCase();

    if (['yes', 'yup', 'correct', 'confirm'].includes(text)) {
      if (!aiService.normalizeDate(session.date) || !aiService.normalizeTime(session.time)) {
        await sessionService.updateSession(phoneNumber, { step: 'AWAITING_DATETIME' });
        return whatsappService.sendMessage(phoneNumber, messages.askDateTime());
      }

      await whatsappService.sendMessage(
        phoneNumber,
        `Searching for ${session.service} providers near ${session.location}...`
      );

      return this.findAndPresentProviders(phoneNumber, session);
    }

    await sessionService.clearSession(phoneNumber);
    return whatsappService.sendMessage(phoneNumber, 'No problem! Let\'s start fresh. What service do you need today?');
  }

  /**
   * Collect date (and optionally time) from the user before looking for providers.
   */
  async handleDateTimeCapture(phoneNumber, message, session) {
    const date = aiService.normalizeDate(message) || session.date;
    const time = aiService.normalizeTime(message) || session.time;

    const updated = await sessionService.updateSession(phoneNumber, {
      ...(date ? { date } : {}),
      ...(time ? { time } : {})
    });

    if (updated.date && aiService.normalizeTime(updated.time)) {
      return await this.findAndPresentProviders(phoneNumber, updated);
    }

    const missing = [];
    if (!aiService.normalizeDate(updated.date)) missing.push('date');
    if (!aiService.normalizeTime(updated.time)) missing.push('time');
    return whatsappService.sendMessage(
      phoneNumber,
      `Almost there. Could you tell me the ${missing.join(' and ')}? e.g. "tomorrow 5pm".`
    );
  }

  async findAndPresentProviders(phoneNumber, session) {
    const providers = await matchingEngine.findBestProviders({
      service: session.service,
      location: session.location,
      limit: 3
    });

    if (providers.length === 0) {
      await sessionService.updateSession(phoneNumber, {
        step: 'READY',
        isConfirmed: false,
        matchedProviders: []
      });
      return whatsappService.sendMessage(
        phoneNumber,
        messages.noProviders(session.service, session.location)
      );
    }

    await sessionService.updateSession(phoneNumber, {
      step: 'PROVIDER_SELECTION',
      matchedProviders: providers
    });

    return whatsappService.sendMessage(phoneNumber, messages.providerList(providers));
  }

  async handleProviderSelection(phoneNumber, message, user, session) {
    const providers = session.matchedProviders || [];
    const choiceIndex = Number.parseInt(message, 10) - 1;

    if (Number.isNaN(choiceIndex) || choiceIndex < 0 || choiceIndex >= providers.length) {
      return whatsappService.sendMessage(phoneNumber, 'Please reply with a number from the list.');
    }

    if (!hasDateTime(session)) {
      await sessionService.updateSession(phoneNumber, { step: 'AWAITING_DATETIME' });
      return whatsappService.sendMessage(phoneNumber, messages.askDateTime());
    }

    const selectedProvider = providers[choiceIndex];

    try {
      await connectifyRepository.createBookingRequest({
        customerId: getUserId(user),
        provider: selectedProvider,
        session
      });

      await sessionService.clearSession(phoneNumber);
      return whatsappService.sendMessage(phoneNumber, messages.bookingCreated(selectedProvider));
    } catch (error) {
      console.error('[WhatsAppConversation] Booking error:', error.message || error);
      if (error && /(already booked|Time slot)/i.test(error.message || '')) {
        return whatsappService.sendMessage(
          phoneNumber,
          `The ${session.time} slot on ${session.date} is unfortunately already taken. Reply with a different time (e.g. "5pm") and I will try again.`
        );
      }
      await sessionService.updateSession(phoneNumber, { step: 'AWAITING_DATETIME' });
      return whatsappService.sendMessage(phoneNumber, messages.bookingFailed(session));
    }
  }
}

module.exports = new ConversationManager();