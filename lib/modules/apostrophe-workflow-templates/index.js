var _ = require('lodash');

module.exports = {
  improve: 'apostrophe-templates',
  construct: function(self, options) {
    var superShowContextMenu = self.showContextMenu;
    self.showContextMenu = function(req) {
      var already = superShowContextMenu(req);
      if (already) {
        return already;
      }
      // Because the draft/live switch is in this area,
      // it doesn't make sense to hide the context menu
      // in the presence of workflow, unless they have
      // no editing privileges
      return _.find(Object.keys(self.apos.docs.managers), function(name) {
        return self.apos.permissions.can(req, 'edit-' + name);
      });
    };
  }
};
