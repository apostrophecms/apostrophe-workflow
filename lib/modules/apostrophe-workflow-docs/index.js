module.exports = {

  improve: 'apostrophe-docs',

  trashInSchema: true,

  construct: function(self, options) {

    self.apos.define('apostrophe-cursor', require('./lib/cursor.js'));

    var superGetSlugIndexParams = self.getSlugIndexParams;
    self.getSlugIndexParams = function() {
      var params = superGetSlugIndexParams();
      params.workflowLocale = 1;
      return params;
    };

  }
};
