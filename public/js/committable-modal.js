// A modal for reviewing workflow submissions.

apos.define('apostrophe-workflow-committable-modal', {

  extend: 'apostrophe-modal',

  source: 'committable-modal',

  construct: function(self, options) {
    self.manager = options.manager;
    // The route already rendered the content with normal links, so there's nothing more to do here,
    // unless we add pagination
  }
});
