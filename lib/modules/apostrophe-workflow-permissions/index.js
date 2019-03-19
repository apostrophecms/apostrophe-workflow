var _ = require('@sailshq/lodash');

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

      // Types excluded from workflow should not be subject to any of this
      if (!workflow.includeType(info.type)) {
        return;
      }

      // Flunk any access to a nonexistent locale or, if
      // we don't have the private-locale permission,
      // any access to a private locale
      var locale = workflow.locales[req.locale || workflow.defaultLocale];
      if (
        (!locale) ||
        (locale.private &&
          ((!req.user) || (
            (!req.user._permissions['private-locales']) &&
            (!req.user._permissions['admin'])
          ))
        )
      ) {
        info.response = info._false;
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
      var verb = info.verb;
      
      if (!self.apos.permissions.extended) {
        // publish is not a separate verb in workflow since we already control whether you can edit
        // in draft vs. live locales
        if (verb === 'publish') {
          verb = 'edit';
          action = action.replace(/^publish-/, 'edit-');
        }
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

      // publish is not a separate verb in workflow since we already control whether you can edit
      // in draft vs. live locales
      if (!self.apos.permissions.extended) {
        if (info.verb === 'publish') {
          action = action.replace(/^publish-/, 'edit-');
        }
      }

      if (!(req.user && req.user._permissionsLocales)) {
        info.response = info._false;
        return;
      }

      var adminAction = 'admin-' + info.type;

      var permissionsLocales = _.assign({},

      if (!self.apos.permissions.extended) {
        // 'VERB', 'VERB-this-type' or 'admin-this-type' is acceptable
        permissionsLocales = _.assign({},
          req.user._permissionsLocales[action] || {},
          req.user._permissionsLocales[adminAction] || {},
          req.user._permissionsLocales[verb] || {}
        );
      } else {
        // Per-locale x per-action = way too many fussy settings.
        // With extended permissions we transitioned to a single
        // locale picker separate from the action pickers.
        // "Jane can edit only blog posts in English, and only
        // products in French" is a highly unusual user story.
        permissionsLocales = req.user._permissionsLocales;
      }

      if (_.isEmpty(permissionsLocales)) {
        info.response = info._false;
        return;
      }

      if (event === 'criteria') {
        info.response = { $and: [ info.response, { workflowLocale: { $in: _.keys(permissionsLocales) } } ] };
      } else {
        object = info.object || info.newObject;
        if (object) {
          if (!permissionsLocales[object.workflowLocale]) {
            info.response = info._false;
          }
        } else if (!permissionsLocales[req.locale]) {
          info.response = info._false;
        }
      }

    };

  }
};
