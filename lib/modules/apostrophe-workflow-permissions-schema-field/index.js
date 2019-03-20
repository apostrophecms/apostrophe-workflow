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
    }
  }
};
