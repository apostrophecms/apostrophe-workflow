var _ = require('lodash');
var async = require('async');

module.exports = function(self, options) {

  self.extendPermissionsField = function() {
    self.apos.schemas.addFieldType({
      name: 'apostrophe-workflow-permissions',
      partial: self.permissionsPartial,
      converters: self.permissionsConverters
    });
    var permissions = _.find(self.apos.groups.schema, { name: 'permissions' });
    if (!permissions) {
      return;
    }
    permissions.type = 'apostrophe-workflow-permissions';
    permissions.nestedLocales = self.nestedLocales || _.map(_.keys(self.locales), function(locale) {
      return { name: locale };
    });
    permissions.locales = {};
    _.each(self.locales, function(locale, name) {
      permissions.locales[name] = _.pick(locale, 'label');
    });
  };

  self.permissionsPartial = function(data) {
    return self.partial('permissions-schema-field', data);
  };

  self.permissionsConverters = {
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
