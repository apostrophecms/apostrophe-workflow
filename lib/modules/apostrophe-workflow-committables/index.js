module.exports = {
  // A virtual "piece type" only used to display a universal manage modal
  // for documents that are commit-ready. No "committable" is ever
  // inserted into the database. -Tom
  extend: 'apostrophe-pieces',
  name: 'committable',
  label: 'Document',
  pluralLabel: 'Modified',
  sort: {
    updatedAt: -1
  },
  construct: function(self, options) {
    self.getManagerControls = function(req) {
      // Committables are not real things and cannot be "added"
      return [
        {
          type: 'minor',
          label: 'Finished',
          action: 'cancel'
        }
      ];
    };
  }
};

