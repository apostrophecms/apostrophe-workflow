var _ = require('@sailshq/lodash');

module.exports = function(self, options) {
  self.enableHelpers = function() {
    self.addHelpers({
      localizations: function() {
        var localizations = [];
        _.each((self.apos.templates.contextReq.data.workflow && self.apos.templates.contextReq.data.workflow.localizations) || [], function(localization, locale) {
          if (!self.locales[locale].private) {
            localizations.push(localization);
          }
        });
        return localizations;
      },
      lang: function() {
        var locale = self.apos.templates.contextReq.locale || self.defaultLocale;
        locale = self.liveify(locale);
        if (self.locales[locale] && self.locales[locale].lang) {
          return self.locales[locale].lang;
        }
        return locale.replace(/[-_]\w+$/, '');
      },
      committable: function(draft) {
        return self.filterCommittableDrafts(self.apos.templates.contextReq, [ draft ]).length > 0;
      }
    });
  };
};
