// A modal for reviewing workflow submissions.

console.log('hello');

apos.define('apostrophe-workflow-modal', {

  extend: 'apostrophe-modal',

  source: 'modal',

  construct: function(self, options) {
    self.manager = options.manager;
    // The route already rendered the content with normal links, so there's nothing more to do here,
    // unless we add pagination
  }
});
