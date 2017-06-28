var _ = require('lodash');
var async = require('async');

module.exports = {

  improve: 'apostrophe-schemas',

  afterConstruct: function(self) {
    self.workflowAddPermissionsFieldType();
  },

  construct: function(self, options) {
    self.workflowAddPermissionsFieldType = function() {
      var workflow = self.apos.modules['apostrophe-workflow'];
      self.apos.schemas.addFieldType({
        name: 'apostrophe-workflow-permissions',
        partial: self.workflowPermissionsPartial,
        converters: self.workflowPermissionsConverters
      });
    };

    self.workflowPermissionsPartial = function(data) {
      var workflow = self.apos.modules['apostrophe-workflow'];
      _.each(data.choices, function(choice) {
        if (_.contains(workflow.excludeActions, choice.value)) {
          choice.exempt = true;
        }
        var matches = choice.value.match(self.apos.permissions.permissionPattern);
        if (matches) {
          var verb = matches[1];
          if (!_.contains(workflow.includeVerbs, verb)) {
            choice.exempt = true;
          }
        }
      });
      data.choices = _.filter(data.choices, function(choice) {
        // Exclude submit- actions from the UI as we're replacing that with edit permissions on the
        // draft locales
        var matches = choice.value.match(self.apos.permissions.permissionPattern);
        if (!matches) {
          return true;
        }
        if (matches[1] === 'submit') {
          if (workflow.includeType(matches[2])) {
            return false;
          }
        }
        return true;
      })
      return self.partial('workflow-permissions-schema-field', data);
    };

    self.workflowPermissionsConverters = {
      string: function(req, data, name, object, field, callback) {
        // For now importing permissions is not a concern
        return setImmediate(callback);
      },
      form: function(req, data, name, object, field, callback) {
        if (!Array.isArray(data[name])) {
          object[name] = [];
          return setImmediate(callback);
        }

        object[name] = _.filter(data[name], function(choice) {
          return _.contains(_.pluck(field.choices, 'value'), choice);
        });
        
        var permissionsLocales = {};
        var raw = data[name + 'Locales'];
        if ((!raw) || (typeof(raw) !== 'object')) {
          return setImmediate(callback);
        }
        _.each(raw, function(locales, permission) {
          permissionsLocales[permission] = {};
          _.each(field.locales, function(locale, name) {
            if (locales[name]) {
              permissionsLocales[permission][name] = true;
            }
          });
        });

        // For bc, this schema field uses a separate property for the extended
        // information about the locales for which the user has the permission
        object[name + 'Locales'] = permissionsLocales;

        return setImmediate(callback);
      }
    };
  }
};
