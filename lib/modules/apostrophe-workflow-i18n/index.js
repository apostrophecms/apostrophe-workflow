// Reconfigure apos.i18n, this time with the workflow locales.
//
// It is a singleton anyway, so requiring it again to make a new
// one wouldn't work.

var _ = require('lodash');
var fs = require('fs');

console.log('loading');

module.exports = {

  construct: function(self, options) {
    console.log('constructing');
  }
};
