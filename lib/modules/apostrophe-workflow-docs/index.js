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

    // Solve chicken and egg problem by making sure we have a
    // workflow locale before we test insert permissions
    
    var superTestInsertPermissions = self.testInsertPermissions;
    self.testInsertPermissions = function(req, doc, options) {
      var workflow = self.apos.modules['apostrophe-workflow'];
      // If not enabled yet, this will be a startup task
      if (workflow) {
        workflow.ensureWorkflowLocale(req, doc);
      }
      return superTestInsertPermissions(req, doc, options);
    };

  }
};
