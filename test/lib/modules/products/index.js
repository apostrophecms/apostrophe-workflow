module.exports = {
  extend: 'apostrophe-pieces',
  name: 'product',
  construct: function(self, options) {
    self.afterInsert = function(req, piece, options, callback) {
      piece.afterInsertRan = true;
      return self.update(req, piece, options, callback);
    };
  }
};
