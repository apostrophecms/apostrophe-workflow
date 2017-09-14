module.exports = {
  construct: function(self, options) {
    var superGetReq = self.getReq();
    self.getReq = function(properties) {
      return superGetReq(_.assign({ locale: self.apos.argv['workflow-locale'] }, properties));
    };
  }
};
