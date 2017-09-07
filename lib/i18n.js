const BabelFish = require('babelfish');

const defaultLocale = 'en-US';

module.exports = function (locale = defaultLocale) {
  const i18n = new BabelFish(defaultLocale);
  i18n.addPhrase(locale, 'e', require('../i18n/' + locale + '.json'));

  if (locale !== defaultLocale) {
    i18n.setFallback(locale, defaultLocale);
  }

  return function getText (key, options) {
    return i18n.t(locale, 'e.' + key, options);
  };
};
