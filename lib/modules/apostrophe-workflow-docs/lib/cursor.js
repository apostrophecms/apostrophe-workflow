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
        if (self.get('type')) {
          if (workflow.includeType(self.get('type'))) {
            // query is restricted by type to a type that definitely involves workflow
            self.and({ workflowLocale: setting });
          } else {
            // Restricted by type to a type that definitely does not involve workflow,
            // no criteria needed
          }
        } else {
          // console.log('generic');
          // Content not participating in localization will have no locale at all,
          // take care not to block access to that. However we can use `$in`,
          // which works just like the equality filter and will accept `null` as
          // a match for "property does not exist at all". This avoids a slow
          // $or query
          self.and({
            workflowLocale: {
              $in: [ setting, null ]
            }
          });
        }
      }
    });

  }
};
