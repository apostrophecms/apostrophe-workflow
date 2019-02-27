var _ = require('@sailshq/lodash');

module.exports = {
  improve: 'apostrophe-tasks',
  construct: function(self, options) {
    var superGetReq = self.getReq;
    self.getReq = function(properties) {
      var workflow = self.apos.modules['apostrophe-workflow'];
      return superGetReq(_.assign({ locale: self.apos.argv['workflow-locale'] || (workflow && workflow.defaultLocale) }, properties));
    };
  }
};
