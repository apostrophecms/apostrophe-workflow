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
  }

};
