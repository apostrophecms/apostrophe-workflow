apos.define('apostrophe-workflow-committables-manager-modal', {
  extend: 'apostrophe-pieces-manager-modal',
  construct: function(self, option) {
    self.onChange = function() {
      // We refresh list view on *all* doc changes, not just one piece type
      self.refresh();
    };
    var superBeforeShow = self.beforeShow;
    self.beforeShow = function(callback) {
      // Watch for more types of changes that should refresh the list
      apos.on('workflowSubmitted', self.onChange);
      apos.on('workflowCommitted', self.onChange);
      apos.on('workflowRevertedToLive', self.onChange);
      return superBeforeShow(callback);
    };
    var superAfterHide = self.afterHide;
    self.afterHide = function() {
      superAfterHide();
      // So we don't leak memory and keep refreshing
      // after we're gone
      apos.off('workflowSubmitted', self.onChange);
      apos.off('workflowCommitted', self.onChange);
      apos.off('workflowRevertedToLive', self.onChange);
    };
  }
});

