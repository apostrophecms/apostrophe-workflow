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
        _.each(self.apos.modules['apostrophe-workflow'].locales, function(locale, name) {
          if (raw[name]) {
            object[name + 'Locales'][name] = self.apos.launder.select(raw[name], [ 'edit', 'commit' ], null);
          }
        });
        object[name + 'Locales'] = permissionsLocales;
      });
    }
  }
};
