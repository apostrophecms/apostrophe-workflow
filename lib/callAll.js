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
  // there.
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
      // A new doc needs to be brought into existence across all locales.
      // For performance, do this with a moderate degree of parallelism
      return async.eachLimit(missingLocales, 5, function(locale, callback) {

        var _doc = self.apos.utils.clonePermanent(doc);
        if (locale === doc.workflowLocale) {
          return setImmediate(callback);
        }
        // Strip the prefix that came from the originating locale
        // so that the new locale can prepend its own successfully
        var prefix = self.prefixes && self.prefixes[self.liveify(_doc.workflowLocale)];
        if (prefix && (_doc.slug.indexOf(prefix) === 0)) {
          _doc.slug = _doc.slug.substr(prefix.length);
        }
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
        if ((_doc.level === 0) || _doc.parked) {
          // Let it through: for chicken and egg reasons, the home page
          // exists in published form right away in all locales.
          // Ditto any parked page
        } else if (_doc.slug === 'global') {
          // The global doc
        } else if (options.workflowMissingLocalesLive === 'liveOnly') {
          // If it's a draft let it through as live, otherwise
          // start it in the trash. This is the least confusing behavior
          // for the add-missing-locales task
          if (!_doc.workflowLocale.match(/-draft$/)) {
            _doc.trash = true;
          }
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
          // This is tricky: for pieces, we need the beforeInsert/afterInsert etc.
          // callbacks to run. Whereas for pages, not all of those exist, and those
          // that do are methods of the pages module, not the manager for a
          // particular page type.
          var manager = self.apos.docs.getManager(_doc.type);
          if (self.apos.instanceOf(manager, 'apostrophe-custom-pages')) {
            // All page type managers extend apostrophe-custom-pages (eventually)
            return async.series([ beforeInsert, beforeSave, insertDoc ], callback);
          } else if (manager.insert) {
            // A piece, or something else with a direct insert method;
            // simple
            return manager.insert(req, _doc, { permissions: false, workflowMissingLocalesLive: options.workflowMissingLocalesLive }, callback);
          } else {
            // Something Else. Currently, nothing in this category, but
            // inserting via docs.insert is a good fallback
            return insertDoc(callback);
          }
          function beforeInsert(callback) {
            return self.apos.pages.beforeInsert(req, _doc, { permissions: false, workflowMissingLocalesLive: options.workflowMissingLocalesLive }, callback);
          }
          function beforeSave(callback) {
            return self.apos.pages.beforeSave(req, _doc, { permissions: false, workflowMissingLocalesLive: options.workflowMissingLocalesLive }, callback);
          }
          function insertDoc(callback) {
            return self.apos.docs.insert(req, _doc, { permissions: false, workflowMissingLocalesLive: options.workflowMissingLocalesLive }, callback);
          }
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
    // Also adds a class on <body> for both workflow modes
    if (req.user) {
      var workflowMode = req.session.workflowMode;
      if (workflowMode === 'live') {
        req.disableEditing = true;
      }
      self.apos.templates.addBodyClass(req, 'apos-workflow-' + workflowMode + '-page');
    }

    // Pass on `data.workflow.context` which will be the page or piece
    // the user thinks of as the "context" for the current page rendering

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

      var id;

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
        id = self.apos.launder.id(req.query.workflowPreview);
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
      id = self.apos.launder.id(req.query.workflowReview);
      self.apos.templates.addBodyClass(req, 'apos-workflow-preview-page');

      var commit;
      var contexts = [];

      return async.series([
        findDocAndCommit,
        after
      ], function(err) {
        if (err) {
          return callback(err);
        }
        req.browserCall('apos.modules["apostrophe-workflow"].enablePreviewIframe({ commitId: ? })', id);
        return callback(null);
      });

      function findDocAndCommit(callback) {
        return self.findDocAndCommit(req, id, function(err, _doc, _commit) {
          if (err) {
            return callback(err);
          }
          commit = _commit;
          // Walk recursively through req.data looking for instances of the doc of interest.
          // Working in place, modify them to be copies of commit.from, which will be
          // an older version of the doc. Since we're working in place, make
          // an array of these to pass to after() later for joining
          contexts = [];
          self.apos.docs.walk(req.data, function(o, k, v, dotPath) {
            if (v && (typeof (v) === 'object')) {
              if (v._id === commit.fromId) {
                _.each(_.keys(v), function(key) {
                  delete v[key];
                });
                _.assign(v, commit.from);
                contexts.push(v);
              }
            }
          });
          return callback(null);
        });
      }

      function after(callback) {
        return self.after(req, contexts, callback);
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
