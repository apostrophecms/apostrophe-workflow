// Extend the pieces editor modal to implement workflow

apos.define('apostrophe-pieces-editor-modal', {
  construct: function(self, options) {

    var superBeforeShow = self.beforeShow;
    self.beforeShow = function(callback) {
      self.link('apos-workflow-submit', function() {
        return self.workflowSaveThen(function(callback) {
          return apos.modules['apostrophe-workflow'].submit([ self.savedPiece._id ], callback);
        });
      });
      self.link('apos-workflow-commit', function() {
        return self.workflowSaveThen(function(callback) {
          return apos.modules['apostrophe-workflow'].commit([ self.savedPiece._id ], callback);
        });
      });
      self.link('apos-workflow-force-export', function() {
        return self.workflowSaveThen(function(callback) {
          return apos.modules['apostrophe-workflow'].forceExport(self.savedPiece._id, callback);
        });
      });
      self.link('apos-workflow-history', function() {
        if (!self._id) {
          return;
        }
        return apos.modules['apostrophe-workflow'].history(self._id);
      });
      self.workflowControlsVisibility();
      return superBeforeShow(callback);
    };

    // Save the modal normally, then invoke the given callback.
    // The callback is invoked only if the modal is saved successfully

    self.workflowSaveThen = function(callback) {
      self.workflowBeforeDisplayResponse = callback;
      return self.save(function(err) {
        if (err) {
          console.error(err);
        }
        self.workflowBeforeDisplayResponse = null;
      });
    };

    var superDisplayResponse = self.displayResponse;

    // Invoke `workflowBeforeDisplayResponse` if present, then
    // respond to the saving of the piece in the normal way
    self.displayResponse = function(result, callback) {
      if (!self.workflowBeforeDisplayResponse) {
        return superDisplayResponse(result, callback);
      }
      return self.workflowBeforeDisplayResponse(function(err) {
        if (err) {
          console.log('error: ', err);
          return callback(err);
        }
        return superDisplayResponse(result, callback);
      });
    };

    self.workflowControlsVisibility = function() {
      var workflow = apos.modules['apostrophe-workflow'];
      return workflow.api('committable', { type: self.name, id: self._id }, function(results) {
        if (results.status === 'ok') {
          self.$controls.addClass('apos-workflow-committable');
        }
      });
    };
  }
});
