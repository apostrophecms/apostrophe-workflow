// A modal for forcing export of a single widget to other locales

apos.define('apostrophe-workflow-force-export-widget-modal', {

  extend: 'apostrophe-workflow-export-modal',

  source: 'force-export-widget-modal',

  verb: 'force-export-widget',

  construct: function(self, options) {
    // Can't be done in the same way because we don't send a commit id
    self.exportRelatedUnexported = function(locales, callback) {
      return setImmediate(callback);
    };
  }

  // The base class already sends everything in options.body so no
  // further modifications are needed on the front end so far

});
