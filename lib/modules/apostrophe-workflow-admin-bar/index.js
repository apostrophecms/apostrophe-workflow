var _ = require('@sailshq/lodash');

module.exports = {
  improve: 'apostrophe-admin-bar',
  construct: function(self, options) {
    // Hide most admin bar buttons in draft mode, specifically
    // those that manage pieces; you must be in draft mode to
    // do most things. Later perhaps we'll introduce a manage modal
    // for live mode that lets you preview things
    var superItemIsVisible = self.itemIsVisible;
    self.itemIsVisible = function(req, item) {
      var result = superItemIsVisible(req, item);
      if (!result) {
        return result;
      }
      if (req.locale && req.locale.match(/-draft$/)) {
        return result;
      }
      var notSafeLiveList = [ 'apostrophe-pages', 'apostrophe-tags', 'apostrophe-workflow-manage-modal' ];
      if (_.contains(notSafeLiveList, item.name)) {
        return false;
      }
      // In addition, pieces manage buttons are not safe live
      // if the type is included in workflow; look
      // for subclasses
      var manager = self.apos.modules[item.name];
      if (!manager) {
        return result;
      }
      if (!(self.apos.synth.instanceOf(manager, 'apostrophe-pieces'))) {
        return result;
      }
      var workflow = self.apos.modules['apostrophe-workflow'];
      if (!workflow.includeType(manager.name)) {
        return result;
      }
      return false;
    };
  }
};
