var _ = require('lodash');

module.exports = {
  construct: function(self, options) {
    // Apostrophe will fetch only documents for the locale of req unless
    // explicitly asked to do otherwise via .workflowLocale(false).
    // The filter can also be called with a specific locale string
    self.addFilter('workflowLocale', {
      def: true,
      finalize: function() {
        var setting = self.get('workflowLocale');
        if (!setting) {
          return;
        }
        if (setting === true) {
          setting = self.get('req').locale;
        } else {
          // It's an explicit locale string
        }
        self.and({ workflowLocale: locale });
      }
    });
    
    self.addFilter('workflowUrl', {
      def: true,
      after: function(results, callback) {
        // npm modules should play nice and not use `alias`
        var workflow = self.apos.modules['apostrophe-workflow'];
        _.each(results, function(result) {
          if (result.workflowLocale) {
            var locale = workflow.locales[result.workflowLocale];
            if (locale.slugPrefix.match(/^:/)) {
              // This is a "draft" URL that should not show up in user-visible
              // URLs. Instead URLs are swapped later as needed by the
              // workflow middleware
              workflow.removeSlugPrefix(result, result.workflowLocale);
            }
          }
        });
        return callback(null);
      }
    });
  }
};
