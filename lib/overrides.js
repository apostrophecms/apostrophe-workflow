var _ = require('lodash');
var async = require('async');

module.exports = function(self, options) {
  // Extend all apostrophe cursors to limit results to the current locale by default
  self.extendCursor = function() {
    self.apos.define('apostrophe-cursor', require('./cursor.js'));
  };
  
  // Extend the index parameters for the unique indexes on path and slug to allow for
  // two docs with the same slug in different locales

  self.extendIndexes = function() {
    self.apos.on('slugIndex', function(params) {
      params.workflowLocale = 1;
    });
    self.apos.on('pathIndex', function(params) {
      // Exactly like workflowLocale in every way except it exists only when
      // path exists. This allows the sparse index to work properly
      params.workflowLocaleForPathIndex = 1;
    });
  };
  
  self.extendPermissions = function() {
    self.apos.permissions.add({
      value: 'private-locales',
      label: 'View Private Locales'
    });
    self.apos.on('can', _.partial(self.onPermissions, 'can'));
    self.apos.on('criteria', _.partial(self.onPermissions, 'criteria'));
  };
  
  self.onPermissions = function(event, req, action, object, info) {
    if (_.contains(self.excludeActions, action)) {
      return;
    }
    if (!info.type) {
      return;
    }
    var manager = self.apos.docs.getManager(info.type);
    if (!manager) {
      return;
    }
    if (!self.includeType(info.type)) {
      return;
    }
    var verb = info.verb;
    // publish is not a separate verb in workflow since we already control whether you can edit
    // in draft vs. live locales
    if (verb === 'publish') {
      verb = 'edit';
    }
    if (!_.contains(self.includeVerbs, verb)) {
      return;
    }
    if (req.user && req.user._permissions.admin) {
      // Sitewide admins aren't restricted by locale because they can edit
      // groups, which would allow them to defeat that anyway
      return;
    }
    if (manager.isAdminOnly && manager.isAdminOnly()) {
      info.response = info._false;
      return;
    }

    // OK, now we know this is something we're entitled to an opinion about

    // Rebuild the action string using the effective verb and type name
    action = info.verb + '-' + info.type;

    if (!(req.user && req.user._permissionsLocales)) {
      info.response = info._false;
      return;
    }

    // Either 'edit' or 'edit-this-type' is acceptable
    var permissionsLocales = _.assign({}, 
      req.user._permissionsLocales[action] || {},
      req.user._permissionsLocales[verb] || {}
    );
    
    if (_.isEmpty(permissionsLocales)) {
      info.response = info._false;
      return;
    }

    if (event === 'criteria') {
      info.response = { $and: [ info.response, { workflowLocale: { $in: _.keys(permissionsLocales) } } ] };
    } else {
      var object = info.object || info.newObject;
      if (object) {
        if (!permissionsLocales[object.workflowLocale]) {
          info.response = info._false;
        }
      } else if (!(permissionsLocales[req.locale] || permissionsLocales[self.draftify(req.locale)])) {          
        info.response = info._false;
      }
    }

  };
  
  // When editing pieces, we should always get the draft version of
  // the content unless otherwise specified. Also, you should be able
  // to edit a piece in the trash, as otherwise you cannot export
  // its trashiness to other locales.
  //
  // TODO: a number of things here would be nicer if the workflow module
  // were a self-enabling bundle, but A2 doesn't have those yet.

  self.extendPieces = function() {
    _.each(self.apos.instancesOf('apostrophe-pieces'), function(module) {
      module.options.canEditTrash = true;
    });
    self.apos.on('piecesFindForEditing', function(type, cursor) {
      if (!self.includeType(type)) {
        return;
      }
      var req = cursor.get('req');
      if (!req.locale.match(/\-draft$/)) {
        var locale = cursor.get('workflowLocale');
        if (locale === undefined) {
          cursor.workflowLocale(self.draftify(req.locale));
        }
      }
    });
    self.apos.on('piecesEditControls', function(info) {
      upgradeControls(info);
    });
    self.apos.on('piecesCreateControls', function(info) {
      upgradeControls(info);
    });
    self.apos.on('pagesEditControls', function(info) {
      upgradeControls(info);
    });
    function upgradeControls(info) {
      if (!self.includeType(info.type)) {
        // Not subject to workflow
        return;
      }
      // TODO use info.req, check whether committing is a thing they can do
      // per Stuart's notes on permissions design.
      //
      // Also Submit operation.
      var save = _.find(info.controls, { action: 'save' });
      if (save) {
        save.label = 'Save Draft';
      }
      info.controls.push({
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
    }
  };
  
  self.extendPages = function() {

    var pages = self.apos.pages;

    // Trash must be managed at each level of the page tree so that
    // users lacking cross-locale permissions are not forbidden to
    // trash things locally. Moving pages requires permissions across
    // many locales
    //
    // This would be too late, we must fix that by making this module
    // a theme, for now it must be configured manually
    //
    // docs.options.trashInSchema = true;
          
    var superRemoveTrailingSlugSlashes = pages.removeTrailingSlugSlashes;
    pages.removeTrailingSlugSlashes = function(slug) {
      if (!self.options.prefixes) {
        return superRemoveTrailingSlugSlashes(slug);
      }
      var matches = slug.match(/^\/([^\/]+)(\/?)$/);
      if (matches && _.has(self.locales, matches[1])) {
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

    var superPruneCurrentPageForBrowser = pages.pruneCurrentPageForBrowser;
    pages.pruneCurrentPageForBrowser = function(page) {
      var pruned = superPruneCurrentPageForBrowser(page);
      pruned.workflowLocale = page.workflowLocale;
      pruned.workflowGuid = page.workflowGuid;
      return pruned;
    };

  };
  
  self.extendWidgetControls = function() {
    self.apos.on('widgetControlGroups', function(controlGroups) {
      controlGroups.push({
        controls: [
          {
            tooltip: 'Force Export',
            icon: 'sign-out',
            action: 'workflow-force-export-widget'
          }
        ]
      });
    });
  };
};
