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
          	if ((workflow.options.exportAfterCommit !== false)){
          		return workflow.batchExport(_.values(results), callback);
          	}
          	return callback(null);            
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

    self.batchRevertToLive = function() {
      return self.batchSimple(
        'revert-to-live',
        "Are you sure you want to revert " + self.choices.length + " item(s) to their live content?",
        {}
      );
    };

  }
});
