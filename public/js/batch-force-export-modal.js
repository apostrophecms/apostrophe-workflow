// A modal for force-exporting a group of docs
// to other locales. Acts as a dataSource for
// the force-export batch operation, does not
// invoke the force export API on its own

apos.define('apostrophe-workflow-batch-force-export-modal', {

  extend: 'apostrophe-workflow-export-modal',

  source: 'batch-force-export-modal',

  construct: function(self, options) {

    var superBeforeShow = self.beforeShow;

    self.beforeShow = function(callback) {
      return superBeforeShow(function(err) {
        if (err) {
          return callback(err);
        }
        self.$el.find('[for="relatedExisting"]').hide();
        self.$el.on('change', '[name="related"]', function() {
          var value = $(this).prop('checked');
          if (!value) {
            self.$el.find('[for="relatedExisting"]').hide();
            self.$el.find('[data-related-types]').hide();
            return;
          }
          self.$el.find('[for="relatedExisting"]').show();
          self.$el.find('[data-related-types]').show();
          self.fetchRelatedByType();
        });
        return callback(null);
      });
    };

    self.fetchRelatedByType = function() {
      apos.ui.globalBusy(true);
      self.api('count-related-by-type', {
        ids: self.options.body.ids
      }, function(data) {
        apos.ui.globalBusy(false);
        if (data.status !== 'ok') {
          apos.utils.error(data.status);
        }
        self.$el.find('[data-related-types]').html(data.html);
      }, function(err) {
        apos.ui.globalBusy(false);
        apos.utils.error(err);
      });
    };

    self.saveContent = function(callback) {
      var locales = self.getLocales();
      if (!locales.length) {
        apos.notify('Select at least one locale to export to.', { type: 'error' });
        return callback('user');
      }
      var related = self.$el.findByName('related').prop('checked');
      // Modifying the `body` object passed to us
      // by batchForceExportGetLocales allows that
      // method to see the locales that were chosen
      self.options.body.locales = locales;
      self.options.body.related = related;
      self.options.body.relatedTypes = [];
      self.$el.find('[name="relatedTypes"]:checked').each(function() {
        self.options.body.relatedTypes.push($(this).attr('value'));
      });
      self.options.body.relatedExisting = self.$el.find('[name="relatedExisting"]').prop('checked');
      return callback(null);
    };
  }
});
