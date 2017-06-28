var _ = require('lodash');
var async = require('async');

module.exports = {

  improve: 'apostrophe-groups',

  construct: function(self, options) {

    var superModulesReady = self.modulesReady;
    self.modulesReady = function() {
      // Can't be done sooner because the workflow module has to exist first
      superModulesReady();
      self.workflowModifyPermissionsField();
    };
    
    self.workflowModifyPermissionsField = function() {
      var workflow = self.apos.modules['apostrophe-workflow'];
      var permissions = _.find(self.schema, { name: 'permissions' });
      if (!permissions) {
        return;
      }
      permissions.type = 'apostrophe-workflow-permissions';
      permissions.nestedLocales = workflow.nestedLocales;
      permissions.locales = {};
      permissions.excludeActions = workflow.excludeActions;
      _.each(workflow.locales, function(locale, name) {
        permissions.locales[name] = _.pick(locale, 'label');
      });
    };
  }
};
