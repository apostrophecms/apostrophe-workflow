module.exports = function(self, options) {
  self.addHelpers({
    lang: function() {
      var locale = self.apos.templates.contextReq.locale || self.defaultLocale;
      locale = self.liveify(locale);
      if (self.locales[locale] && self.locales[locale].lang) {
        return self.locales[locale].lang;
      }
      return locale.replace(/[\-\_]\w+$/, '');
    }
  }); 
};

