// Extend the pieces editor modal to implement workflow

apos.define('apostrophe-pages-editor', {
  construct: function(self, options) {
    var superBeforeShow = self.beforeShow;
    self.beforeShow = function(callback) {
      self.link('apos-submit', function() {
        self.submitting = true;
        return self.save(function(err) {
          if (err) {
            self.submitting = false;
            return;
          }
          // Never reached due to redirect
        });
      });
      self.link('apos-commit', function() {
        self.committing = true;
        return self.save(function(err) {
          if (err) {
            self.committing = false;
            return;
          }
          // Never reached due to redirect
        });
      });
      return superBeforeShow(callback);
    };
    var superAfterSave = self.afterSave;
    self.afterSave = function(callback) {
      if (self.submitting) {
        return apos.modules['apostrophe-workflow'].submit([ self.savedPage._id ], callback);
      }
      if (self.committing) {
        return apos.modules['apostrophe-workflow'].commit([ self.savedPage._id ], callback);
      }
      return setImmediate(callback);
    };
  }
});
