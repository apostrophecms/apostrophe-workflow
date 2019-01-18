// A modal for reviewing workflow submissions.

apos.define('apostrophe-workflow-committable-modal', {

  extend: 'apostrophe-modal',

  source: 'committable-modal',

  construct: function(self, options) {

    self.manager = options.manager;

    var superBeforeShow = self.beforeShow;
    self.beforeShow = function(callback) {
      apos.on('workflowCommitted', self.removeRows);
      apos.on('workflowRevertedToLive', self.removeRow);
      return superBeforeShow(callback);
    };

    self.afterHide = function() {
      apos.off('workflowCommitted', self.removeRows);
      apos.off('workflowRevertedToLive', self.removeRow);
    };

    self.removeRows = function(ids) {
      _.each(ids, function(id) {
        self.removeRow(id);
      });
    };

    self.removeRow = function(id) {
      self.$el.find('[data-apos-workflow-committable="' + id + '"]').remove();
    };

  }

});
