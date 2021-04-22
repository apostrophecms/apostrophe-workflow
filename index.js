var async = require('async');
var Promise = require('bluebird');

var modules = [
  'apostrophe-workflow-areas',
  'apostrophe-workflow-docs',
  'apostrophe-workflow-global',
  'apostrophe-workflow-groups',
  'apostrophe-workflow-pages',
  'apostrophe-workflow-permissions',
  'apostrophe-workflow-pieces',
  'apostrophe-workflow-schemas',
  'apostrophe-workflow-images',
  'apostrophe-workflow-admin-bar',
  'apostrophe-workflow-tasks',
  'apostrophe-workflow-assets',
  'apostrophe-workflow-modified-documents',
  'apostrophe-workflow-templates'
];

// ## Options
//
// `includeTypes: [ 'my-blog-post', 'my-event' ]`
//
// Apply workflow only to docs of the specified types. IF WORKFLOW IS ENABLED FOR ANY PAGE TYPE,
// AS OPPOSED TO A PIECE, IT MUST BE ENABLED FOR *ALL* PAGE TYPES.
//
// `excludeTypes: [ 'my-personal-profile' ]`
//
// Apply workflow to everything EXCEPT the specified types. IF WORKFLOW IS ENABLED FOR ANY PAGE TYPE,
// AS OPPOSED TO A PIECE, IT MUST BE ENABLED FOR *ALL* PAGE TYPES.
//
// If both options are present, a type must appear in `includeTypes`
// and NOT appear in `excludeTypes`.
//
// `baseExcludeTypes: [ 'apostrophe-user', 'apostrophe-group' ]`
//
// **Typically not changed.** A short list of types that should never be subject to workflow,
// no matter what the other options say. For security reasons this list contains users and groups
// by default. You will usually leave this alone.
//
// `excludeProperties: [ 'hitCounter' ]`
//
// A list of properties that should not be subject to workflow, but rather should be allowed to
// vary for each locale and never be copied. These are typically properties
// that don't make sense to edit as a "draft" and then submit as the new live version. For
// instance, you wouldn't want to overwrite a page view counter field.
//
// There is no `includeProperties` option. In Apostrophe 2.x workflow applies to properties by default,
// and excluded properties are unique to the locale (that is, either draft or live version of the doc).
//
// `baseExcludeProperties`
//
// Like `baseExcludeTypes`, this overrides a short list of properties that must not be modified
// by workflow. You don't want to change this.

module.exports = {

  moogBundle: {
    modules: modules,
    directory: 'lib/modules'
  },

  beforeConstruct: function(self, options) {
    if (options.replicateAcrossLocales === undefined) {
      options.replicateAcrossLocales = true;
    }
  },

  afterConstruct: function(self, callback) {
    self.composeLocales();
    self.composeOptions();
    self.enableAddMissingLocalesTask();
    self.enableAddLocalePrefixesTask();
    self.enableRemoveNumberedParkedPagesTask();
    self.enableResolveJoinIdsTask();
    self.enableHarmonizeWorkflowGuidsByParkedIdTask();
    self.enableDiffDraftAndLiveTask();
    self.enableReplicateLocaleTask();
    self.cleanPagesTree();
    self.pushAssets();
    self.addToAdminBar();
    self.apos.pages.addAfterContextMenu(self.menu);
    self.enableHelpers();
    self.enableCrossDomainSessionCache();
    self.refineOptimizeKey();
    self.composeApiCalls();
    self.addWorkflowModifiedMigration();
    self.addWorkflowLastCommittedMigration();
    self.on('apostrophe-pages:beforeParkAll', 'updateHistoricalPrefixesPromisified', function() {
      return Promise.promisify(self.updateHistoricalPrefixes)();
    });
    self.addRoutes();
    return async.series([
      self.enableCollection,
      self.enableFacts
    ], callback);
  },

  construct: function(self, options) {
    require('./lib/implementation.js')(self, options);
    require('./lib/api.js')(self, options);
    require('./lib/callAll.js')(self, options);
    require('./lib/browser.js')(self, options);
    require('./lib/middleware.js')(self, options);
    require('./lib/routes.js')(self, options);
    require('./lib/tasks.js')(self, options);
    require('./lib/helpers.js')(self, options);
  }

};
