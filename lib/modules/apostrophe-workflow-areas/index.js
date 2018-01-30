module.exports = {
  improve: 'apostrophe-areas',
  construct: function(self, options) {
    var superWidgetControlGroups = self.widgetControlGroups;
    self.widgetControlGroups = function(req, widget, options) {
      var controlGroups = superWidgetControlGroups(req, widget, options);
      var workflow = self.apos.modules['apostrophe-workflow'];
      if (!workflow.localized) {
        return controlGroups;
      }
      return controlGroups.concat([
        {
          controls: [
            {
              tooltip: 'Force Export',
              icon: 'sign-out',
              action: 'workflow-force-export-widget'
            }
          ]
        }
      ]);
    };
  }
};
