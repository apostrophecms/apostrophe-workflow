// A modal for displaying information about an unavailable locale.

apos.define('apostrophe-workflow-locale-unavailable-modal', {

  extend: 'apostrophe-modal',

  source: 'locale-unavailable-modal',

  construct: function(self, options) {
    self.manager = options.manager;
    self.beforeShow = function(callback) {
      // various event handlers could go here
      return callback(null);
    };
    self.saveContent = function(callback) {
      return self.api('activate', {
        locale: self.options.body.locale,
        workflowGuid: self.options.body.workflowGuid
      }, function(result) {
        if (result.status === 'ok') {
          window.location.href = result.url;
        } else {
          error();
        }
        return callback(null);
      }, function(err) {
        apos.utils.error(err);
        error();
        return callback(null);
      });
      function error() {
        apos.notify('An error occurred activating the document. It may not be available or you may not have permission.', { type: 'error' });
      }
    };
  }
});
