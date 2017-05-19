// A modal for browsing past commits of a doc.

apos.define('apostrophe-workflow-history-modal', {

  extend: 'apostrophe-modal',

  source: 'history-modal',

  construct: function(self, options) {
    self.manager = options.manager;
    self.beforeShow = function(callback) {
      // various event handlers will go here
      return callback(null);
    };
  }
});
