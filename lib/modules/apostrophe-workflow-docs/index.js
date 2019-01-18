var Promise = require('bluebird');

module.exports = {

  improve: 'apostrophe-docs',

  trashInSchema: true,

  construct: function(self, options) {

    self.apos.define('apostrophe-cursor', require('./lib/cursor.js'));

    var superIsUniqueError = self.isUniqueError;
    self.isUniqueError = function(err) {
      var result = superIsUniqueError(err);
      if (!result) {
        return result;
      }
      if (err && err.message && err.message.match(/workflowGuid/)) {
        return false;
      }
      return result;
    };

    var superGetSlugIndexParams = self.getSlugIndexParams;
    self.getSlugIndexParams = function() {
      var params = superGetSlugIndexParams();
      params.workflowLocale = 1;
      return params;
    };

    var superGetPathLevelIndexParams = self.getPathLevelIndexParams;
    self.getPathLevelIndexParams = function() {
      var params = superGetPathLevelIndexParams();
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
        self.ensureSlug(doc);
        workflow.ensureWorkflowLocale(req, doc);
      }
      return superTestInsertPermissions(req, doc, options);
    };

    // An afterSave handler is a good place to set or clear the
    // workflowModified flag because it guarantees any properties
    // added by beforeSave handlers are taken into account. It would
    // be nice if promise events had a way to say "after all the
    // others," but they don't so far.

    self.on('apostrophe-docs:afterSave', 'setWorkflowModified', function(req, doc, options) {
      if (!self.includeType(doc)) {
        return;
      }
      const isModified = Promise.promisify(self.isModified);
      return isModified(req, doc).then(function(modified) {
        if (modified === doc.workflowModified) {
          return;
        }
        return self.apos.docs.update({
          _id: doc._id
        }, {
          $set: {
            workflowModified: modified
          }
        });
      });
    });

  }
};
