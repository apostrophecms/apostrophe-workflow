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
          apos.notify('An error occurred.', { type: 'error', dismiss: true });
          return callback(result.status);
        }
        if (result.title) {
          apos.notify('%s was committed successfully.', result.title, { type: 'success', dismiss: true });
        } else {
          apos.notify('The document was committed successfully.', { type: 'success', dismiss: true });
        }
        if (_.keys(self.manager.locales).length > 2) {
          // We have more than two locales (more than default and default-draft),
          // so exporting is a logical feature to offer
          return apos.create('apostrophe-workflow-export-modal', 
            _.assign({
              manager: self.manager,
              body: { id: result.commitId },
              after: callback
            }, self.manager.options)
          );
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
