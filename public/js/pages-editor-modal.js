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
      console.log('in afterSave');
      if (self.submitting) {
        console.log('submit');
        return apos.modules['apostrophe-workflow'].submit([ self.savedPage._id ], callback);
      }
      if (self.committing) {
        console.log('commit');
        return apos.modules['apostrophe-workflow'].commit([ self.savedPage._id ], callback);
      }
      console.log('finished');
      return setImmediate(callback);
    };
  }
});
