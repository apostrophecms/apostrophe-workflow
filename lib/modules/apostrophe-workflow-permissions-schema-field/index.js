var _ = require('@sailshq/lodash');

module.exports = {
  improve: 'apostrophe-permissions-schema-field',
  construct: function(self, options) {
    var superConvertForm = self.converters.form;
    self.converters.form = function(req, data, name, object, field, callback) {
      return superConvertForm(req, data, name, object, field, function(err) {
        if (err) {
          return callback(err);
        }
        var permissionsLocales = {};
        var raw = data[name + 'Locales'];
        if ((!raw) || ((typeof raw) !== 'object')) {
          return setImmediate(callback);
        }
        object[name + 'Locales'] = {};
        var workflow = self.apos.modules['apostrophe-workflow'];
        _.each(workflow.locales, function(locale, localeName) {
          if (workflow.liveify(localeName) !== localeName) {
            return;
          }
          if (raw[localeName]) {
            object[name + 'Locales'][localeName] = self.apos.launder.select(raw[localeName], [ 'edit', 'commit' ], null);
          }
        });
        return setImmediate(callback);
      });
    };
    self.presentation = [
      {
        type: 'independent',
        name: 'default',
        label: 'Overall'
      },
      {
        type: 'typed',
        name: 'exempt',
        label: 'Document Types Without Workflow'
      },
      {
        type: 'typed',
        name: 'workflow',
        label: 'Document Types With Workflow'
      },
      {
        type: 'independent',
        name: 'last',
        label: 'Permissions Usually Implied by Others'
      }
    ];
    var superTypeGroup = self.typeGroup;
    self.typeGroup = function(field, group) {
      var workflow = self.apos.modules['apostrophe-workflow'];
      var types = superTypeGroup(field, group);
      if (group.name === 'exempt') {
        console.log('finding exempt');
        return _.filter(types, function(type) {
          return !workflow.includeType(type.name);
        });
      } else if (group.name === 'workflow') {
        console.log('finding workflow');
        return _.filter(types, function(type) {
          return workflow.includeType(type.name);
        });
      }
    };
    self.typeGroupPrologue = function(field, typeGroup) {
      console.log(typeGroup);
      if (typeGroup.name === 'workflow') {
        console.log('name is workflow');
        var s = self.partial('locale-picker', { field: field });
        console.log(s);
        return s;
      } else {
        console.log('never mind');
        return '';
      }
    };
  }
};
