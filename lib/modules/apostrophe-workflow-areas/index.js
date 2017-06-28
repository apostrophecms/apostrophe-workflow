module.exports = {
  improve: 'apostrophe-areas',
  beforeConstruct: function(self, options) {
    options.addWidgetControlGroups = [
      {
        controls: [
          {
            tooltip: 'Force Export',
            icon: 'sign-out',
            action: 'workflow-force-export-widget'
          }
        ]
      }
    ].concat(options.addWidgetControlGroups || []);
  }
};
