module.exports = {
  improve: 'apostrophe-i18n',
  construct: function(self, options) {
    // The original apostrophe-i18n module added apos.i18n early in the
    // game and it will be connected as middleware by apostrophe-express
    // before apostrophe-workflow-i18n is initialized. To resolve this,
    // replace its "init" method (its middleware) with a new function
    // that "passes through" to the apostrophe-workflow-i18n module's
    // instance of i18n.
    console.log('bridging');
    // self.apos.i18n.init = function(req, res, next) {
    //   // "Wait, isn't this an infinite loop?" Nope. By this
    //   // time, self.apos.i18n is the new object added by
    //   // apostrophe-workflow-i18n.
    //   return self.apos.i18n.init(req, res, next);
    // };
  }
}