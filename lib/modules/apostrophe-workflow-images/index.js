module.exports = {
  improve: 'apostrophe-images',
  construct: function(self, options) {
    self.workflowPreview = function(req, before, after) {
      return self.render(req, 'workflowPreview', { image: after });
    };
  }
};
