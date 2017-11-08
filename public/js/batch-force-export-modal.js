// A modal for force-exporting a group of docs
// to other locales. Acts as a dataSource for
// the force-export batch operation, does not
// invoke the force export API on its own

apos.define('apostrophe-workflow-batch-force-export-modal', {

  extend: 'apostrophe-workflow-export-modal',

  source: 'batch-force-export-modal',
  
  construct: function(self, options) {

    self.saveContent = function(callback) {
      var locales = self.getLocales();
      if (!locales.length) {
        apos.notify('Select at least one locale to export to.', { type: 'error' });
        return callback('user');
      }
      // Modifying the `body` object passed to us
      // by batchForceExportGetLocales allows that
      // method to see the locales that were chosen
      self.options.body.locales = locales;
      return callback(null);
    };

  }
});
