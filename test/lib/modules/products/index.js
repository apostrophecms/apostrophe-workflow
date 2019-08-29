module.exports = {
  extend: 'apostrophe-pieces',
  name: 'product',
  alias: 'products',
  addFields: [
    {
      name: '_related',
      type: 'joinByOne',
      withType: 'product'
    }
  ],
  construct: function(self, options) {
    self.afterInsert = function(req, piece, options, callback) {
      piece.afterInsertRan = true;
      return self.update(req, piece, options, callback);
    };
  }
};
