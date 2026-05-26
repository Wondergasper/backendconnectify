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
    const aiResponse = await aiService.analyzeIntent(message, session);
    const nextSession = await sessionService.updateSession(phoneNumber, {
      step: 'AWAITING_INFO',
      ...aiResponse.sessionUpdates
    });

    if (!nextSession.isConfirmed) {
      return whatsappService.sendMessage(phoneNumber, aiResponse.replyText);
    }

    await whatsappService.sendMessage(
      phoneNumber,
      `Searching for ${nextSession.service} providers near ${nextSession.location}...`
    );

    const providers = await matchingEngine.findBestProviders({
      service: nextSession.service,
      location: nextSession.location,
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
        messages.noProviders(nextSession.service, nextSession.location)
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

    const selectedProvider = providers[choiceIndex];
    await connectifyRepository.createBookingRequest({
      customerId: getUserId(user),
      provider: selectedProvider,
      session
    });

    await sessionService.clearSession(phoneNumber);
    return whatsappService.sendMessage(phoneNumber, messages.bookingCreated(selectedProvider));
  }
}

module.exports = new ConversationManager();
