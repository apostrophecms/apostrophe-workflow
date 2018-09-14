// A modal for committing draft changes to a live locale.

apos.define('apostrophe-workflow-commit-modal', {

  extend: 'apostrophe-modal',

  source: 'commit-modal',

  construct: function(self, options) {
    self.manager = options.manager;
    self.beforeShow = function(callback) {
      return apos.areas.saveAllIfNeeded(callback);
    };
    self.saveContent = function(callback) {
      return self.api('commit', { id: options.body.id }, function(result) {
        if (result.status !== 'ok') {
          apos.notify('An error occurred.', { type: 'error' });
          return callback(result.status);
        }
        if (result.title) {
          apos.notify('%s was committed successfully.', result.title, { type: 'success', dismiss: true });
        } else {
          apos.notify('The document was committed successfully.', { type: 'success', dismiss: true });
        }
        var commitId = result.commitId;
        return self.api('editable-locales', {
          id: options.body.id
        }, function(result) {
          if (result.status !== 'ok') {
            return callback(result.status);
          }
          if ((apos.modules['apostrophe-workflow'].options.exportAfterCommit !== false) && (result.locales.length > 1)) {
            return self.manager.export(commitId, callback);
          }
          return callback(null);
        }, function(err) {
          return callback(err);
        });
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
