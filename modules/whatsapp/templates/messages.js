exports.welcome = () =>
  [
    'Welcome to Connectify!',
    '',
    'I can help you find and book trusted service providers nearby.',
    '',
    'First, what is your full name?'
  ].join('\n');

exports.help = (firstName = '') =>
  [
    `Hi${firstName ? ` ${firstName}` : ''}! I am Connectify.`,
    '',
    'Tell me what you need in one sentence, for example:',
    '"I need a plumber in Ikeja tomorrow"',
    '',
    'Type cancel anytime to start over.'
  ].join('\n');

exports.noProviders = (service, location) =>
  [
    `Sorry, I could not find available ${service || 'service'} providers near ${location || 'that area'} right now.`,
    '',
    'Try a nearby area, or type cancel to start over.'
  ].join('\n');

exports.providerList = (providers) => {
  const lines = [`I found ${providers.length} provider${providers.length === 1 ? '' : 's'} for you:`, ''];

  providers.forEach((provider, index) => {
    lines.push(`${index + 1}. ${provider.displayName}`);
    if (provider.category) lines.push(`Service: ${provider.category}`);
    if (provider.priceLabel) lines.push(`Price: ${provider.priceLabel}`);
    if (provider.locationLabel) lines.push(`Location: ${provider.locationLabel}`);
    lines.push('');
  });

  lines.push('Reply with the number of your preferred provider.');
  return lines.join('\n');
};

exports.bookingCreated = (provider) =>
  [
    `Done. I have created your booking request with ${provider.displayName}.`,
    '',
    'You can open the web or mobile app later and see the same booking there.'
  ].join('\n');
