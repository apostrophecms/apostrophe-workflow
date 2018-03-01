// Make a new apos.i18n object, replacing the one installed
// by the apostrophe core. Does not use improve because it would
// then initialize too early to be much help, see the
// apostrophe-workflow-bridge-i18n module for how we resolved this. -Tom

var _ = require('lodash');
var i18n = require('i18n');

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
    i18n.configure(i18nOptions);

    // Make the new i18n instance available globally in Apostrophe
    self.apos.i18n = i18n;
  }
};
