// A modal for reviewing the changes in a past commit.
// The template does a lot of the work via the preview iframe.

apos.define('apostrophe-workflow-review-modal', {

  extend: 'apostrophe-modal',

  source: 'review-modal',

  construct: function(self, options) {
    self.manager = options.manager;
    self.beforeShow = function(callback) {
      return apos.areas.saveAllIfNeeded(callback);
    };
    self.saveContent = function(callback) {
      return apos.create('apostrophe-workflow-export-modal',
        _.assign({
          manager: self.manager,
          body: { id: options.body.id },
          after: callback
        }, self.manager.options)
      );
    };
  }
});
