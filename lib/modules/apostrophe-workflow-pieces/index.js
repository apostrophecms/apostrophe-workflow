var _ = require('lodash');
var async = require('async');

module.exports = {

  improve: 'apostrophe-pieces',

  canEditTrash: true,
  
  construct: function(self, options) {
    
    var superGetEditControls = self.getEditControls;
    self.getEditControls = function(req) {
      return upgradeControls(req, superGetEditControls(req), 'edit');
    };

    var superGetCreateControls = self.getCreateControls;
    self.getCreateControls = function(req) {
      return upgradeControls(req, superGetCreateControls(req), 'create');
    };

    function upgradeControls(req, controls, verb) {
      var workflow = self.apos.modules['apostrophe-workflow'];
      if (!workflow.includeType(self.name)) {
        // Not subject to workflow
        return controls;
      }
      var save = _.find(controls, { action: 'save' });
      if (save) {
        save.label = 'Save Draft';
      }
      
      controls.push({
        type: 'dropdown',
        label: 'Workflow',
        dropdownOptions: {
          direction: 'down'
        },
        // Frontend takes care of visibility decisions for these
        items: [
          {
            label: 'Submit',
            action: 'workflow-submit'
          },
          {
            label: 'Commit',
            action: 'workflow-commit'
          },
        ].concat((workflow.localized && (verb === 'edit')) ?
          [
            {
              label: 'History',
              action: 'workflow-history'
            }
          ] : []
        ).concat(workflow.localized ?
          [
            {
              label: 'Force Export',
              action: 'workflow-force-export'
            }
          ] : []
        )
      });
      return controls;
    }
  }
};
