// A modal for exporting the changes in a given commit to other locales

apos.define('apostrophe-workflow-export-modal', {

  extend: 'apostrophe-modal',

  source: 'export-modal',

  construct: function(self, options) {
    self.manager = options.manager;
    self.beforeShow = function(callback) {
      self.$el.on('change', 'input[type="checkbox"]', function() {
        var checked = $(this).prop('checked');
        $(this).closest('li').find('input[type="checkbox"]').prop('checked', checked);
      });
      return callback(null);
    };
    self.saveContent = function(callback) {
      var locales = [];
      var $checkboxes = self.$el.find('input[type="checkbox"]:checked');
      $checkboxes.each(function() {
        var name = $(this).attr('name');
        var matches = name.match(/^locales\[(.*?)\]$/);
        if (matches) {
          locales.push(matches[1]);
        }
      });
      var result = {
        // id is a commit id, not a doc id
        id: options.body.id,
        locales: locales
      };
      return self.api('export', result, function(result) {
        if (result.status !== 'ok') {
          alert('An error occurred.');
          return callback(result.status);
        }
        if (result.errors && result.errors.length) {
          alert('These changes were too different to be applied to the following locales: ' + result.errors.join(', '));
        }
        return callback(null);
      }, function(err) {
        return callback(err);
      });
    };
    // Let the manager know we're done, so the manager can step through these modals
    // for several docs in series if needed
    self.afterHide = function() {
      return options.after && options.after();
    };
  }
});
