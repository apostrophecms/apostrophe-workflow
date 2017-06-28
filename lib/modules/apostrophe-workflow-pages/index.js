var _ = require('lodash');

module.exports = {

  improve: 'apostrophe-pages',

  construct: function(self, options) {

    var superGetPathIndexParams = self.getPathIndexParams;
    self.getPathIndexParams = function() {
      var params = superGetPathIndexParams();
      params.workflowLocaleForPathIndex = 1;
      return params;
    };

    var superRemoveTrailingSlugSlashes = self.removeTrailingSlugSlashes;
    self.removeTrailingSlugSlashes = function(slug) {
      var workflow = self.apos.modules['apostrophe-workflow'];
      if (!workflow.options.prefixes) {
        return superRemoveTrailingSlugSlashes(slug);
      }
      var matches = slug.match(/^\/([^\/]+)(\/?)$/);
      if (matches && _.has(workflow.locales, matches[1])) {
        // Something like /en/, leave it alone,
        // it's a localized homepage. However if the
        // trailing slash *after* the locale is missing,
        // add it and redirect
        if (matches[2] === '') {
          return slug + '/';
        } else {
          return slug;
        }
      }
      return superRemoveTrailingSlugSlashes(slug);
    };

    var superPruneCurrentPageForBrowser = self.pruneCurrentPageForBrowser;
    self.pruneCurrentPageForBrowser = function(page) {
      var pruned = superPruneCurrentPageForBrowser(page);
      pruned.workflowLocale = page.workflowLocale;
      pruned.workflowGuid = page.workflowGuid;
      return pruned;
    };

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
        items: [
          {
            label: 'Submit',
            action: 'workflow-submit'
          },
          {
            // TODO: only if they have edit permission for the live version
            label: 'Commit',
            action: 'workflow-commit'
          },
          {
            // TODO: only if preexisting object
            label: 'History',
            action: 'workflow-history'
          },
          {
            // TODO: only if they have permissions for some other locales
            label: 'Force Export',
            action: 'workflow-force-export'
          }
        ]
      });
      return controls;
    }    

  }

};
