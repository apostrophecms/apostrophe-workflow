// Extend the pieces editor modal to implement workflow

apos.define('apostrophe-pieces-editor-modal', {
  construct: function(self, options) {
    var superBeforeShow = self.beforeShow;
    self.beforeShow = function(callback) {
      self.link('apos-submit', function() {
        return self.save(function(err) {
          if (err) {
            return;
          }
          return apos.modules['apostrophe-workflow'].submit([ self.savedPiece._id ], callback);
        });
      });
      self.link('apos-commit', function() {
        return self.save(function(err) {
          if (err) {
            return;
          }
          return apos.modules['apostrophe-workflow'].commit([ self.savedPiece._id ], callback);
        });
      });
      return superBeforeShow(callback);
    };
  }
});
