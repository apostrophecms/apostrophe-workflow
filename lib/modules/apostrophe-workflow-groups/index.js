var _ = require('@sailshq/lodash');

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
      if (!self.apos.permissions.extended) {
        permissions.type = 'apostrophe-workflow-permissions';
      }
      permissions.nestedLocales = workflow.nestedLocales;
      permissions.locales = {};
      permissions.excludeActions = workflow.excludeActions;
      _.each(workflow.locales, function(locale, name) {
        permissions.locales[name] = _.pick(locale, 'label');
      });
    };
  }
};
