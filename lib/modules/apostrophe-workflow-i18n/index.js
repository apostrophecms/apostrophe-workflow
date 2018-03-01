// Reconfigure apos.i18n, this time with the workflow locales.
//
// It is a singleton anyway, so requiring it again to make a new
// one wouldn't work.

var _ = require('lodash');

module.exports = {

  construct: function(self, options) {
    var workflow = self.apos.modules['apostrophe-workflow'];
    var locales = _.keys(workflow.locales);
    locales = _.uniq(
      _.map(locales, workflow.liveify)
    );

    var i18nOptions = self.options || {};
    _.defaults(i18nOptions, {
      locales: [ locales ],
      cookie: 'apos_language',
      defaultLocale: workflow.defaultLocale,
      directory: self.apos.rootDir + '/locales'
    });
    self.apos.i18n.configure(i18nOptions);
  }
};
