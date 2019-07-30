module.exports = {
  beforeConstruct: function(self, options) {
    options.addFields = [
      {
        name: '_related',
        type: 'joinByOne',
        withType: 'product'
      }
    ].concat(options.addFields || []);
  }
};
