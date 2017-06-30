var _ = require('lodash');
var async = require('async');

module.exports = {

  improve: 'apostrophe-permissions',

  afterConstruct: function(self) {
    self.workflowAddPermissions();
    self.apos.on('can', _.partial(self.workflowOnPermissions, 'can'));
    self.apos.on('criteria', _.partial(self.workflowOnPermissions, 'criteria'));
  },

  construct: function(self, options) {

    self.workflowAddPermissions = function() {
      self.add({
        value: 'private-locales',
        label: 'View Private Locales'
      });
    };

    self.workflowOnPermissions = function(event, req, action, object, info) {

      var workflow;
      workflow = self.apos.modules['apostrophe-workflow'];

      if (!workflow) {
        // Workflow module not initialized yet
        return;
      }

      if (_.contains(workflow.excludeActions, action)) {
        return;
      }
      if (!info.type) {
        return;
      }
      var manager = self.apos.docs.getManager(info.type);
      if (!manager) {
        return;
      }
      if (!workflow.includeType(info.type)) {
        return;
      }
      var verb = info.verb;
      // publish is not a separate verb in workflow since we already control whether you can edit
      // in draft vs. live locales
      if (verb === 'publish') {
        verb = 'edit';
      }
      if (!_.contains(workflow.includeVerbs, verb)) {
        return;
      }
      if (req.user && req.user._permissions.admin) {
        // Sitewide admins aren't restricted by locale because they can edit
        // groups, which would allow them to defeat that anyway
        return;
      }
      if (manager.isAdminOnly && manager.isAdminOnly()) {
        info.response = info._false;
        return;
      }

      // OK, now we know this is something we're entitled to an opinion about

      // Rebuild the action string using the effective verb and type name
      action = info.verb + '-' + info.type;

      if (!(req.user && req.user._permissionsLocales)) {
        info.response = info._false;
        return;
      }

      // Either 'edit' or 'edit-this-type' is acceptable
      var permissionsLocales = _.assign({}, 
        req.user._permissionsLocales[action] || {},
        req.user._permissionsLocales[verb] || {}
      );
      
      if (_.isEmpty(permissionsLocales)) {
        info.response = info._false;
        return;
      }

      if (event === 'criteria') {
        info.response = { $and: [ info.response, { workflowLocale: { $in: _.keys(permissionsLocales) } } ] };
      } else {
        var object = info.object || info.newObject;
        if (object) {
          if (!permissionsLocales[object.workflowLocale]) {
            info.response = info._false;
          }
        } else if (!permissionsLocales[req.locale]) {
          if (permissionsLocales[workflow.draftify(req.locale)]) {
            // Specifically convey that this response is only because
            // we can create drafts, but for forward compatibility,
            // only if our response would otherwise have been a simple boolean
            if (info.response === true) {
              info.response = { draftOnly: true };
            }
          } else {
            info.response = info._false;
          }
        }
      }

    };
    
  }
};
