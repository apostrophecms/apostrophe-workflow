// A modal for exporting the changes in a given commit to other locales

apos.define('apostrophe-workflow-batch-export-modal', {

  extend: 'apostrophe-workflow-export-modal',

  source: 'batch-export-modal',
  
  verb: 'batch-export',

  construct: function(self, options) {

    // Not a good idea for batch
    self.exportRelatedUnexported = function(locales, callback) {
      return callback(null);
    };
    
    self.presentResult = function(result) {
      var workflow = apos.modules['apostrophe-workflow'];
      workflow.presentBatchExportResult(result);
    };

  }
});
