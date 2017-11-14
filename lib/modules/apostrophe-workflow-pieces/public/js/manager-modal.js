apos.define('apostrophe-pieces-manager-modal', {

  construct: function(self, options) {

    var workflow = apos.modules['apostrophe-workflow'];

    self.batchSubmit = function() {
      return self.batchSimple(
        'submit',
        "Are you sure you want to submit " + self.choices.length + " item(s)?",
        {}
      );
    };

    self.batchCommit = function() {
      return self.batchSimple(
        'commit',
        "Are you sure you want to commit " + self.choices.length + " item(s)?",
        {
          success: function(results, callback) {
            return workflow.batchExport(_.values(results), callback);
          }
        }
      );
    };

    self.batchForceExport = function() {
      return self.batchSimple(
        'force-export',
        "Are you sure you want to force export " + self.choices.length + " item(s)?",
        {
          dataSource: workflow.batchForceExportGetLocales,
          success: function(result, callback) {
            workflow.presentBatchExportResult(result);
            return callback(null);
          }
        }
      );
    };
  }
});
