var _ = require('lodash');

module.exports = {
  construct: function(self, options) {
    // npm modules should play nice and not use `alias`
    var workflow = self.apos.modules['apostrophe-workflow'];

    // Apostrophe will fetch only documents for the locale of req unless
    // explicitly asked to do otherwise via .workflowLocale(false).
    // The filter can also be called with a specific locale string.

    self.addFilter('workflowLocale', {
      def: true,
      finalize: function() {
        var setting = self.get('workflowLocale');
        if (setting === null) {
          return;
        }
        if (setting === true) {
          setting = self.get('req').locale;
          if (!setting) {
            setting = workflow.defaultLocale;
          }
        } else {
          // It's an explicit locale string
        }
        // Content not participating in localization will have no locale at all,
        // take care not to block access to that
        self.and({ $or: [ { workflowLocale: setting }, { workflowLocale: { $exists: 0 } } ] });
      }
    });
        
  }
};
