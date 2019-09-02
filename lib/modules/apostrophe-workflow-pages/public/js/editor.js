// Extend the pieces editor modal to implement workflow

apos.define('apostrophe-pages-editor', {
  construct: function(self, options) {
    var superBeforeShow = self.beforeShow;
    self.beforeShow = function(callback) {
      self.link('apos-workflow-submit', function() {
        self.submitting = true;
        return self.save(function(err) {
          if (err) {
            self.submitting = false;

          }
          // Never reached due to redirect
        });
      });
      self.link('apos-workflow-commit', function() {
        self.committing = true;
        apos.notify('The page has been created and saved.', { type: 'success', dismiss: true });
        return self.save(function(err) {
          if (err) {
            self.committing = false;

          }
          // Never reached due to redirect
        });
      });
      self.link('apos-workflow-force-export', function() {
        self.forceExporting = true;
        return self.save(function(err) {
          if (err) {
            self.forceExporting = false;

          }
          // Never reached due to redirect
        });
      });
      self.link('apos-workflow-history', function() {
        return apos.modules['apostrophe-workflow'].history(self.page._id, callback);
      });
      self.workflowControlsVisibility();
      return superBeforeShow(callback);
    };

    self.workflowControlsVisibility = function() {
      var workflow = apos.modules['apostrophe-workflow'];
      var args = {
        type: self.page.type
      };
      if (self.verb === 'update') {
        args.id = self.page._id;
      }
      return workflow.api('committable', args, function(results) {
        if (results.status === 'ok') {
          self.$controls.addClass('apos-workflow-committable');
        }
      });
    };

    self.afterSave = function(callback) {
      if (self.submitting) {
        return apos.modules['apostrophe-workflow'].submit([ self.savedPage._id ], callback);
      }
      if (self.committing) {
        return apos.modules['apostrophe-workflow'].commit([ self.savedPage._id ], callback);
      }
      if (self.forceExporting) {
        return apos.modules['apostrophe-workflow'].forceExport(self.savedPage._id, callback);
      }
      if (self.accessingHistory) {
        return apos.modules['apostrophe-workflow'].history(self.page._id, callback);
      }
      return setImmediate(callback);
    };
  }
});
