// A modal for exporting the changes in a given commit to other locales

apos.define('apostrophe-workflow-export-modal', {

  extend: 'apostrophe-modal',

  source: 'export-modal',
  
  verb: 'export',

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
      if (!locales.length) {
        apos.notify('Select at least one locale to export to.', { type: 'error' });
        return callback('user');
      }
      var data = _.assign({
        locales: locales
      }, options.body);
      
      return self.api(self.options.verb, data, function(result) {
        if (result.status !== 'ok') {
          apos.notify('An error occurred.', { type: 'error' });
          return callback(result.status);
        }
        _.each(result.errors, function(error) {
          apos.notify('%s: ' + error.message, error.locale, { type: 'error' });
        });
        if (result.success.length) {
          apos.notify('Successfully exported to: %s', result.success.join(', '), { type: 'success' });
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
