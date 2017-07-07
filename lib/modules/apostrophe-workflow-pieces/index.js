var _ = require('lodash');
var async = require('async');

module.exports = {

  improve: 'apostrophe-pieces',

  canEditTrash: true,
  
  construct: function(self, options) {
    
    // var superFindForEditing = self.findForEditing;
    // self.findForEditing = function(req, criteria, projection) {
    //   var workflow = self.apos.modules['apostrophe-workflow'];
    //   var cursor = superFindForEditing(req, criteria, projection);
    //   if (!workflow.includeType(self.name)) {
    //     return cursor;
    //   }
    //   var req = cursor.get('req');
    //   if (!req.locale.match(/\-draft$/)) {
    //     var locale = cursor.get('workflowLocale');
    //     if (locale === undefined) {
    //       cursor.workflowLocale(workflow.draftify(req.locale));
    //     }
    //   }
    //   return cursor;
    // };

    var superGetEditControls = self.getEditControls;
    self.getEditControls = function(req) {
      return upgradeControls(req, superGetEditControls(req));
    };

    var superGetCreateControls = self.getCreateControls;
    self.getCreateControls = function(req) {
      return upgradeControls(req, superGetCreateControls(req));
    };

    function upgradeControls(req, controls) {
      var workflow = self.apos.modules['apostrophe-workflow'];
      if (!workflow.includeType(self.name)) {
        // Not subject to workflow
        return controls;
      }
      // TODO use req, check whether committing is a thing they can do
      // per Stuart's notes on permissions design.
      //
      // Also Submit operation.
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
          {
            label: 'History',
            action: 'workflow-history'
          },
          {
            label: 'Force Export',
            action: 'workflow-force-export'
          }
        ]
      });
      return controls;
    }    
  }
};
