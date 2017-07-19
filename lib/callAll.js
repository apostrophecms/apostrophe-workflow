var _ = require('lodash');
var async = require('async');

module.exports = function(self, options) {
  // Every time a doc is saved, check whether its type is included in
  // workflow. If so invoke `ensureWorkflowLocale` and
  // `ensurePageSlugPrefix`.

  self.docBeforeSave = function(req, doc, options) {

    if (!self.includeType(doc.type)) {
      return;
    }
        
    self.ensureWorkflowLocale(req, doc);

    self.ensurePageSlugPrefix(doc);
    
  };

  // Every time a doc is saved, check whether its type is included in workflow. If it is,
  // check for locales in which that workflowGuid does not exist yet, and bring it into existence
  // there. If the doc has the `_workflowNew` property as set by `docBeforeSave`, we can assume
  // it is new in all other locales, otherwise query to find out.
  //
  // These newly created docs in other locales are initially trash so they
  // don't clutter reorganize as "unpublished."

  self.docAfterSave = function(req, doc, options, callback) {

    var missingLocales;
    
    if (doc._workflowPropagating) {
      // Recursion guard
      return callback(null);
    }
    
    if (!self.includeType(doc.type)) {
      return callback(null);
    }

    return async.series([
      findMissingLocales,
      insertInMissingLocales,
      permissionsAcrossLocales
    ], function(err) {
      if (err) {
        console.error(err);
      }
      return callback(err);
    });

    function findMissingLocales(callback) {
      if (doc._workflowNew) {
        missingLocales = _.filter(_.keys(self.locales), function(locale) {
          return locale !== doc.workflowLocale;
        });
        return callback(null);
      }
      return self.apos.docs.db.find({ workflowGuid: doc.workflowGuid }, { workflowLocale: 1 }).toArray(function(err, docs) {
        if (err) {
          return callback(err);
        }
        var locales = _.pluck(docs, 'workflowLocale');
        missingLocales = _.filter(_.keys(self.locales), function(locale) {
          return (locale !== doc.workflowLocale) && (!_.contains(locales, locale));
        });
        return callback(null);
      });
    }

    function insertInMissingLocales(callback) {
      if (!missingLocales.length) {
        return callback(null);
      }
      // A new doc needs to be brought into existence across all locales
      return async.eachSeries(_.keys(self.locales), function(locale, callback) {

        var _doc = self.apos.utils.clonePermanent(doc);
        if (locale === doc.workflowLocale) {
          return setImmediate(callback);
        }
        delete _doc._workflowNew;
        delete _doc._id;
        _doc.workflowLocale = locale;
        _doc._workflowPropagating = true;
        // Otherwise you can make something happen in public across
        // all locales just by creating a new doc
        // and watching it propagate.
        //
        // If the doc in question is the home page or global doc let it through
        // for chicken and egg reasons. If the page is any other page trash it
        // in the other locales, it can be activated for those locales later
        // by removing it from the trash, or via exporting to it, which will
        // export the fact that it is not trash.
        if (_doc.level === 0) {
          // Let it through: for chicken and egg reasons, the home page
          // exists in published form right away in all locales
        } else if (_doc.slug === 'global') {
          // The global doc
        } else if (!options.workflowMissingLocalesLive) {
          _doc.trash = true;
        }
        self.ensureWorkflowLocaleForPathIndex(_doc);
        return async.series([
          resolve,
          insert
        ], callback);

        function resolve(callback) {
          if (_doc.workflowResolveDeferred) {
            return callback(null);
          }
          return self.resolveRelationships(req, _doc, _doc.workflowLocale, callback);
        }
        
        function insert(callback) {
          // TODO: copy attachments so they are not directly shared resulting in cross-locale modification
          return self.apos.docs.insert(req, _doc, { permissions: false }, function(err) {
            return callback(err);
          });
        }

      }, callback);
    }
    
    function permissionsAcrossLocales(callback) {
      // If I can edit a specific page in ch-fr, I can also edit that same page in gb-en,
      // PROVIDED THAT I can edit pages in gb-en at all (we have locale-specific
      // permission checks). This eliminates complexities in the permissions interface.
      if (!doc.docPermissions) {
        return callback(null);
      }
      return self.apos.docs.db.update({
        workflowGuid: doc.workflowGuid
      }, {
        $set: {
          'loginRequired': doc.loginRequired,
          'viewUsersIds': doc.viewUsersIds || [],
          'viewGroupsIds': doc.viewGroupsIds || [],
          'editUsersIds': doc.editUsersIds || [],
          'editGroupsIds': doc.editGroupsIds || [],
          'viewUsersRelationships': doc.viewUsersRelationships || {},
          'viewGroupsRelationships': doc.viewGroupsRelationships || {},
          'editUsersRelationships': doc.editUsersRelationships || {},
          'editGroupsRelationships': doc.editGroupsRelationships || {},
          'docPermissions': doc.docPermissions
        }
      }, {
        multi: true
      }, callback);
    }
  }; 

  self.pageBeforeSend = function(req, callback) {
    
    // If looking at a live locale, disable inline editing
    if (req.user && (req.session.workflowMode === 'live')) {
      req.disableEditing = true;
      self.apos.templates.addBodyClass(req, 'apos-workflow-live-page');
    }

    // Pass on workflow-related information to Nunjucks templates,
    // notably `data.workflow.context` which will be the page or piece
    // the user thinks of as the "context" for the current page rendering

    req.data.workflow = req.data.workflow || {};
    _.assign(req.data.workflow, _.pick(self, 'locale', 'nestedLocales'));
    var context = self.getContext(req);
    if (context && context.workflowGuid) {
      req.data.workflow.context = context;
    }
    req.data.workflow.locale = self.liveify(req.locale);

    return async.series([
      getLocalizations,
      userOnly
    ], callback);
    
    function getLocalizations(callback) {
      if (!(req.data.workflow.context && req.data.workflow.context.workflowGuid)) {
        return callback(null);
      }
      return self.getLocalizations(req, req.data.workflow.context.workflowGuid, false, function(err, localizations) {
        if (err) {
          return callback(err);
        }
        req.data.workflow.localizations = localizations;
        return callback(null);
      });
    }
    
    function userOnly(callback) {
      // If we're not logged in, this is as far as we need to go
      if (!req.user) {
        return callback(null);
      }

      // Invoke pushCreateSingleton after we have all this groovy information,
      // so we get options.localizations on the browser side to power the
      // locale picker modal
      self.pushCreateSingleton(req);
      if (req.query.workflowPreview) {
        req.disableEditing = true;
        var id = self.apos.launder.id(req.query.workflowPreview);
        self.apos.templates.addBodyClass(req, 'apos-workflow-preview-page');
        req.browserCall('apos.modules["apostrophe-workflow"].enablePreviewIframe({ id: ? })', id);
      }

      // If we're not reviewing an old commit, this is as far as
      // we need to go

      if (!req.query.workflowReview) {
        return callback(null);
      }
      
      req.disableEditing = true;
      // A commit id, not a doc id
      var id = self.apos.launder.id(req.query.workflowReview);
      self.apos.templates.addBodyClass(req, 'apos-workflow-preview-page');

      var commit;

      return async.series([
        findDocAndCommit,
        after        
      ], function(err) {
        if (err) {
          return callback(err);
        }
        // Walk recursively through req.data looking for instances of the doc of interest.
        // Working in place, modify them to be copies of commit.from, which will be
        // an older version of the doc
        self.apos.docs.walk(req.data, function(o, k, v, dotPath) {
          if (v && (typeof(v) === 'object')) {
            if (v._id === commit.fromId) {
              _.each(_.keys(v), function(key) {
                delete v[key];
              });
              _.assign(v, commit.from);
            }
          }
        });
        req.browserCall('apos.modules["apostrophe-workflow"].enablePreviewIframe({ commitId: ? })', id);
        return callback(null);
      });

      function findDocAndCommit(callback) {
        return self.findDocAndCommit(req, id, function(err, _doc, _commit) {
          if (err) {
            return callback(err);
          }
          commit = _commit;
          return callback(null);
        });
      }
      
      function after(callback) {
        return self.after(req, commit.from, callback);
      }

    }
  };
  
  self.loginDeserialize = function(user) {
    user._permissionsLocales = {};
    _.each(user._groups, function(group) {
      _.merge(user._permissionsLocales, group.permissionsLocales || {});
    });
  };
   
};
