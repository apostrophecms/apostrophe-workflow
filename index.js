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
  'apostrophe-workflow-i18n'
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

  afterConstruct: function(self, callback) {
    self.composeLocales();
    self.composeOptions();
    self.reconfigureI18n();
    self.enableAddMissingLocalesTask();
    self.enableAddLocalePrefixesTask();
    self.enableRemoveNumberedParkedPagesTask();
    self.enableResolveJoinIdsTask();
    self.pushAssets();
    self.addToAdminBar();
    self.apos.pages.addAfterContextMenu(self.menu);
    self.enableHelpers();
    self.enableCrossDomainSessionCache();
    return self.enableCollection(callback);
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
