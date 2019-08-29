module.exports = {
  beforeConstruct: function(self, options) {
    options.addFields = [
      {
        name: '_related',
        type: 'joinByOne',
        withType: 'product'
      },
      {
        name: '_coolPages',
        type: 'joinByArray',
        withType: 'apostrophe-page'
      }
    ].concat(options.addFields || []);
  }
};
