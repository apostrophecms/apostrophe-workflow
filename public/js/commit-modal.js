// A modal for committing draft changes to a live locale.

apos.define('apostrophe-workflow-commit-modal', {

  extend: 'apostrophe-modal',

  source: 'commit-modal',

  construct: function(self, options) {
    self.manager = options.manager;
    self.saveContent = function(callback) {
      return self.api('commit', { id: options.body.id }, function(result) {
        if (result.status !== 'ok') {
          alert('An error occurred.');
          return callback(result.status);
        }
        return callback(null);
      }, function(err) {
        return callback(err);
      });
    };
    // Let the manager know we're done, so the manager can step through these modals
    // for several docs in series if needed
    self.afterHide = function() {
      return options.after();
    };
  }
});
