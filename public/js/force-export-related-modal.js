// A modal for exporting the changes in a given commit to other locales

apos.define('apostrophe-workflow-force-export-related-modal', {

  extend: 'apostrophe-workflow-force-export-modal',

  source: 'force-export-related-modal',

  verb: 'force-export',

  construct: function(self, options) {

    var superBeforeShow = self.beforeShow;
    self.beforeShow = function(callback) {
      return superBeforeShow(function(err) {
        if (err) {
          return callback(err);
        }
        self.$el.find('[name="related"]').prop('checked', true);
        self.$el.find('[for="related"]').hide();
        self.$el.find('[for="relatedExisting"]').show();
        return callback(null);
      });
    };

    self.saveContent = function(callback) {
      var locales = self.getLocales();

      if (!locales.length) {
        apos.notify('Select at least one locale to export to.', { type: 'error' });
        return callback('user');
      }

      var workflow = apos.modules['apostrophe-workflow'];
      workflow.nextExportHint = locales;

      return self.exportRelatedUnexported(locales, callback);
    };

  }
});
