var _ = require('@sailshq/lodash');
var async = require('async');
var Promise = require('bluebird');

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
  //
  // If `options.workflowMissingLocalesLocales` is set to an array of locales, the
  // document is exported if needed only to those locales. Otherwise, by default,
  // the document is exported if needed to all locales. If `replicateAcrossLocales` is
  // `false` as a module-level option, it is replicated only between "draft" and "live"
  // unless it is a parked page.

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
        self.apos.utils.error(err);
      }
      return callback(err);
    });

    function findMissingLocales(callback) {
      var criteria = {
        workflowGuid: doc.workflowGuid,
        workflowLocale: { $in: relevantLocales() }
      };
      return self.apos.docs.db.findWithProjection(criteria, { workflowLocale: 1 }).toArray(function(err, docs) {
        if (err) {
          return callback(err);
        }
        var locales = _.pluck(docs, 'workflowLocale');
        missingLocales = _.filter(relevantLocales(), function(locale) {
          if (_.contains(locales, locale)) {
            return false;
          }
          return true;
        });
        return callback(null);
      });
      function relevantLocales() {
        var candidates;
        if (options.workflowMissingLocalesLocales) {
          candidates = options.workflowMissingLocalesLocales;
        } else {
          candidates = _.keys(self.locales);
          if (!self.replicates(req, doc)) {
            // We are not auto-replicating across locales, but we are still
            // maintaining at least draft/live relationship for all workflow docs
            candidates = [ self.draftify(doc.workflowLocale), self.liveify(doc.workflowLocale) ];
          }
        }
        return _.filter(candidates, function(locale) {
          if (locale === doc.workflowLocale) {
            return false;
          }
          if (options.workflowMissingLocalesSubset === 'draft') {
            if (!locale.match(/-draft$/)) {
              return false;
            }
          }
          if (options.workflowMissingLocalesSubset === 'live') {
            if (locale.match(/-draft$/)) {
              return false;
            }
          }
          if (options.workflowMissingLocalesDescendantsOf) {
            if (!self.isAncestorOf(options.workflowMissingLocalesDescendantsOf, locale)) {
              return false;
            }
          }
          return true;
        });
      }
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
        } else if (options.workflowDefaultLocaleNotTrash && (doc.workflowLocale === self.defaultLocale)) {
          // In default locale, and we've received the flag to ensure that is not in the trash; this flag
          // is used when adding workflow for the first time, because it is the sensible migration path
          // for a site that did not have workflow before
        } else if ((options.workflowMissingLocalesLive === 'liveOnly') ||
          (self.isAncestorOf(doc.workflowLocale, _doc.workflowLocale) && _doc.workflowLocale.match(/-draft$/))) {
          // If it's a draft let it through matching the parent, otherwise
          // start it in the trash. This is the least confusing behavior
          // for the add-missing-locales task, or for manual creation of
          // a new doc in the default locale.
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
            return async.series([ fixTree, beforeInsert, beforeSave, insertDoc ], callback);
          } else if (manager.insert) {
            // A piece, or something else with a direct insert method;
            // simple
            return manager.insert(req, _doc, { permissions: false, workflowMissingLocalesLive: options.workflowMissingLocalesLive }, callback);
          } else {
            // Something Else. Currently, nothing in this category, but
            // inserting via docs.insert is a good fallback
            return insertDoc(callback);
          }

          function fixTree(callback) {
            if (self.options.replicateAcrossLocales !== false) {
              // This is not necessary if we are replicating 100% of the time, could
              // cause unnecessary peer order changes, and will lead to errors if we don't replicate
              // in tree order, so skip it
              return callback(null);
            }
            // Make the child a subpage of the closest ancestor that actually exists
            // in the destination locale. The immediate parent might not exist
            // if `replicateAcrossLocales` is `false`.
            //
            // If the parent does not change, we still need to reset the rank.
            // Figuring out if various peers are exported or not would be
            // expensive, and in a typical batch export or even manual export
            // situation things will happen in the right order.
            var components = _doc.path.split('/');
            if (!_doc.level) {
              // Homepage has no parent
              return callback(null);
            }
            var paths = [];
            var path = '';
            _.each(components, function(component) {
              path += component;
              // Special case: the path of the homepage
              // is /, not an empty string
              var queryPath = path;
              if (queryPath === '') {
                queryPath = '/';
              }
              // Don't redundantly load ourselves
              if (queryPath === _doc.path) {
                return;
              }
              paths.push(queryPath);
              path += '/';
            });
            return self.apos.docs.db.find({
              path: {
                $in: paths
              },
              workflowLocale: _doc.workflowLocale
            }).project({
              path: 1,
              level: 1
            }).sort({
              path: -1
            }).limit(1).toArray(function(err, pages) {
              if (err) {
                return callback(err);
              }
              if (!pages.length) {
                return callback(new Error('Non-home page has no parent, should not be possible: ' + self.options.replicateAcrossLocales));
              }
              const newParent = pages[pages.length - 1];
              const newPath = self.apos.utils.addSlashIfNeeded(newParent.path) + require('path').basename(_doc.path);
              // Even though the parent may not have changed, we still need to fix the rank,
              // so keep going on this path either way
              _doc.path = newPath;
              _doc.level = newParent.level + 1;
              // Now we need to make it the last subpage of the new parent
              const matchNewPeers = new RegExp('^' + self.apos.utils.regExpQuote(self.apos.utils.addSlashIfNeeded(newParent.path)));
              return self.apos.docs.db.find({
                path: matchNewPeers,
                level: newParent.level + 1,
                workflowLocale: _doc.workflowLocale
              }).project({ _id: 1, rank: 1 }).sort({ rank: -1 }).limit(1).toArray(function(err, previous) {
                if (err) {
                  return callback(err);
                }
                previous = previous[0];
                if (previous) {
                  _doc.rank = (previous.rank || 0) + 1;
                } else {
                  _doc.rank = 0;
                }
                return callback(null);
              });
            });
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

  // An afterSave handler is a good place to set or clear the
  // workflowModified flag because it guarantees any properties
  // added by beforeSave handlers are taken into account. It would
  // be nice if promise events had a way to say "after all the
  // others," but they don't so far.

  self.on('apostrophe-docs:afterSave', 'setWorkflowModified', function(req, doc, options) {
    if (!self.includeType(doc.type)) {
      return;
    }
    if (!(doc.workflowLocale && doc.workflowLocale.match(/-draft$/))) {
      // Only interested in changes to drafts
      return;
    }
    const isModified = Promise.promisify(self.isModified);
    return isModified(req, doc).then(function(modified) {
      // If there is no modification and that's not news, no update.
      // Otherwise always update so we get the last editor's name
      if ((modified === doc.workflowModified) && (!modified)) {
        return;
      }
      const $set = {
        workflowModified: modified
      };
      if (req.user && req.user._id && req.user.title) {
        $set.workflowLastEditor = req.user.title;
        $set.workflowLastEditorId = req.user._id;
      }
      return self.apos.docs.db.update({
        _id: doc._id
      }, {
        $set: $set
      });
    });
  });

};
