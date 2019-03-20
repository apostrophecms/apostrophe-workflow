apos.define('apostrophe-permissions-schema-field', {

  construct: function(self, options) {

    var superPopulate = self.populate;

    self.populate = function(object, name, $field, $el, field, callback) {
      return superPopulate(object, name, $field, $el, field, function(err) {
        if (err) {
          return callback(err);
        }
        var $fieldset = apos.schemas.findFieldset($el, name);
        _.each(object[name + 'Locales'] || {}, function(level, locale) {
          var $select = $fieldset.findByName(name + 'Locales[' + locale + ']');
          $select.val(level);
        });
        return setImmediate(callback);
      });
    };

    var superConvert = self.convert;
    self.convert = function(data, name, $field, $el, field, callback) {
      return superConvert(data, name, $field, $el, field, function(err) {
        if (err) {
          return callback(err);
        }
        var $fieldset = apos.schemas.findFieldset($el, name);
        data[name + 'Locales'] = {};
        _.each(apos.modules['apostrophe-workflow'].locales, function(locale, localeName) {
          var $levels = $fieldset.findByName(name + 'Locales[' + localeName + ']');
          var level = $levels.val();
          if (level) {
            data[name + 'Locales'][localeName] = level;
          }  
        });
        return setImmediate(callback);
      });
    };
  }
});

