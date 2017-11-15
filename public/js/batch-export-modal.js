// A modal for exporting the changes in a given commit to other locales

apos.define('apostrophe-workflow-batch-export-modal', {

  extend: 'apostrophe-workflow-export-modal',

  source: 'batch-export-modal',
  
  verb: 'batch-export',

  construct: function(self, options) {

    self.saveContent = function(callback) {
      var locales = self.getLocales();

      if (!locales.length) {
        apos.notify('Select at least one locale to export to.', { type: 'error' });
        return callback('user');
      }

      var data = _.assign({
        locales: locales,
        job: true
      }, options.body);
      
      return self.api(self.options.verb, data, function(result) {
        if (result.status !== 'ok') {
          apos.notify('An error occurred.', { type: 'error' });
          return callback(result.status);
        }
        apos.modules['apostrophe-jobs'].progress(result.jobId);
        return callback(null);
      }, function(err) {
        return callback(err);
      });
    };
    
    self.presentResult = function(result) {
      var workflow = apos.modules['apostrophe-workflow'];
      workflow.presentBatchExportResult(result);
    };

  }
});
