var _ = require('@sailshq/lodash');
var async = require('async');
var Promise = require('bluebird');
var minimatch = require('minimatch');
var ExpressSessionCookie = require('express-session/session/cookie');

module.exports = function(self, options) {

  self.localized = false;

  self.composeLocales = function() {
    self.nestedLocales = options.locales || [
      {
        name: 'default',
        label: 'Workflow'
      }
    ];

    inferMaster();

    self.locales = {};
    flattenLocales(self.nestedLocales);
    if (_.keys(self.locales).length > 1) {
      self.localized = true;
    }

    addDraftLocales();

    self.defaultLocale = options.defaultLocale || 'default';

    self.defaultLocalesByHostname = options.defaultLocalesByHostname || {};

    if (!self.locales[self.defaultLocale]) {
      self.defaultLocale = self.nestedLocales[0].name;
    }
    if (!self.defaultLocale) {
      throw new Error('No defaultLocale setting and no locales configured, I give up');
    }

    recordAncestors(self.nestedLocales, []);

    // If there is no locale hierarchy, infer that the default locale is the master,
    // or the first locale if there is no default. This is a bc gesture, master
    // locales are a best practice
    function inferMaster() {
      var inferred = _.find(self.nestedLocales, { name: self.defaultLocale }) || self.nestedLocales[0];
      if ((self.nestedLocales.length > 1) && (!_.find(self.nestedLocales, function(locale) {
        return locale.children && locale.children.length;
      }))) {
        var others = _.filter(self.nestedLocales, function(locale) {
          return locale.name !== inferred.name;
        });
        self.nestedLocales = [ inferred ];
        if (others.length) {
          inferred.children = others;
        }
      }
    }

    function flattenLocales(locales) {
      _.each(locales, function(locale) {
        self.locales[locale.name] = locale;
        if (locale.children) {
          flattenLocales(locale.children);
        }
      });
    }

    function addDraftLocales() {
      var newLocales = {};
      _.each(self.locales, function(locale, name) {
        newLocales[name] = locale;
        var draftLocale = _.cloneDeep(locale);
        draftLocale.name = draftLocale.name + '-draft';
        draftLocale.private = true;
        delete draftLocale.children;
        newLocales[draftLocale.name] = draftLocale;
      });
      self.locales = newLocales;
    }

    function recordAncestors(locales, ancestors) {
      _.each(locales, function(locale) {
        var newAncestors;
        locale.ancestors = ancestors;
        locale.depth = locale.ancestors.length;
        if (locale.children) {
          newAncestors = ancestors.concat([ locale.name ]);
          recordAncestors(locale.children, newAncestors);
        }
      });
    }
    _.each(_.keys(self.locales), function(locale) {
      if (locale.match(/-draft$/)) {
        self.locales[locale].ancestors = _.map(self.locales[self.liveify(locale)].ancestors, function(ancestor) {
          return ancestor + '-draft';
        });
      }
    });
  };

  self.composeOptions = function() {

    self.baseExcludeProperties = options.baseExcludeProperties || [
      '_id',
      'path',
      'rank',
      'level',
      'createdAt',
      'updatedAt',
      'lowSearchText',
      'highSearchText',
      'highSearchWords',
      'searchSummary',
      'parked',

      // Permissions are propagated across all locales by docAfterSave,
      // so it is redundant and inappropriate to include them in workflow
      'docPermissions',
      'loginRequired',
      'viewUsersIds',
      'viewGroupsIds',
      'editUsersIds',
      'editGroupsIds',
      'viewUsersRelationships',
      'viewGroupsRelationships',
      'editUsersRelationships',
      'editGroupsRelationships',
      // This one isn't even really part of the state, but it dirties the diff
      'applyLoginRequiredToSubpages',
      // Ditto — sometimes wind up in db even though they are ephemeral
      'viewUsersRemovedIds',
      'viewGroupsRemovedIds',
      'editUsersRemovedIds',
      'editGroupsRemovedIds',
      'advisoryLock',
      // Handled separately, as it is an action to carry out
      // at commit time
      'workflowMoved',
      'workflowCommitted',
      'workflowLastEditorId',
      'workflowLastEditor',
      'createdById',
      'createdBy',
      'historicUrls'
    ];

    // Attachment fields themselves are not directly localized (they are not docs)
    self.excludeActions = (self.options.excludeActions || []).concat(self.options.baseExcludeActions || [ 'admin', 'edit-attachment' ]);

    self.includeVerbs = (self.options.includeVerbs || []).concat(self.options.baseIncludeVerbs || [ 'admin', 'edit' ]);

    // Localizing users and groups raises serious security questions. If they have a public representation,
    // make a new doc type and join to it
    self.baseExcludeTypes = [ 'apostrophe-user', 'apostrophe-group' ];

    // In 2.x, workflow applies to every property not explicitly excluded,
    // so configuration is simpler (localization will refine this though)
    self.excludeProperties = self.baseExcludeProperties.concat(options.excludeProperties || []);

    self.includeTypes = options.includeTypes || false;
    self.excludeTypes = self.baseExcludeTypes.concat(options.excludeTypes || []);

    if (self.options.hostnames) {
      self.hostnames = self.options.hostnames;
    }

    if (self.options.prefixes === true) {
      self.prefixes = {};
      _.each(self.locales, function(locale, name) {
        if (name !== self.apos.utils.slugify(name)) {
          throw new Error('apostrophe-workflow: if the "prefixes" option is set to `true`, then locale names must be slugs (hyphens not underscores; letters must be lowercase; no other punctuation). If they will not match set it to an object mapping locales to prefixes.');
        }
        self.prefixes[self.liveify(name)] = '/' + self.liveify(name);
      });
    } else if (self.options.prefixes) {
      _.each(self.options.prefixes, function(prefix, locale) {
        if (!_.has(self.locales, locale)) {
          throw new Error('apostrophe-workflow: prefixes option for locale ' + locale + ' does not correspond to any configured locale');
        }
        prefix = prefix || '';
        prefix = prefix.toString();
        if (!prefix.match(/^\/[^/]+$/)) {
          throw new Error('apostrophe-workflow: prefixes option: prefix ' + prefix + ' is invalid. If present it must be / followed by non-slash characters only');
        }
      });
      self.prefixes = {};
      _.assign(self.prefixes, self.options.prefixes);
    }

    // Run the following check only if hostnames and prefixes
    // have both been configured.
    if (self.hostnames && self.prefixes) {
      var rootPaths = {};
      _.each(self.locales, function (props, locale) {
        // Keep draft locales out of the tests
        if (!(/-draft$/).test(locale)) {
          // Since both hostnames and prefixes are optional,
          // placeholders are provided to effectively check
          // if the per-locale configuration is unique. This
          // also handles the exception case where one locale
          // can exist at the root level of a shared hostname.
          var root = (self.hostnames && _.has(self.hostnames, locale) ? self.hostnames[locale] : 'default-hostname-placeholder') + (self.prefixes && _.has(self.prefixes, locale) ? self.prefixes[locale] : '/');

          if (_.has(rootPaths, root)) {
            throw new Error(`apostrophe-workflow: locales must have a unique combination of hostname and prefix. The locales ${rootPaths[root]} and ${locale} are currently configured to use the same hostname and the same prefix (${root}).`);
          } else {
            rootPaths[root] = locale;
          }
        }
      });
    }
  };

  // Ensure the given doc has a `workflowLocale` property; if not
  // supply it from `req.locale`, also creating a new `workflowGuid`
  // and invoking `ensureWorkflowLocaleForPathIndex`.
  //
  // If the locale's type is not included in workflow, nothing happens.

  self.ensureWorkflowLocale = function(req, doc) {
    if (!self.includeType(doc.type)) {
      return;
    }
    // If the doc has no locale yet, set it to the current request's
    // locale, or the default locale
    if (!doc.workflowLocale) {
      doc.workflowLocale = req.locale || self.defaultLocale;
      if (!doc.workflowLocale.match(/-draft$/)) {
        // Always create the draft first, so we can then find it by id successfully
        // via code that is overridden to look for drafts. All the locales get created
        // but we want to return the draft's _id
        doc.workflowLocale = self.draftify(doc.workflowLocale);
      }
      doc.workflowGuid = self.apos.utils.generateId();
      self.ensureWorkflowLocaleForPathIndex(doc);
    }
  };

  // Adjust the slug of a page to take the prefix into account.
  // The UI and/or `pages.newChild` should have done this already, this
  // is a failsafe invoked by `docBeforeSave` and also in tasks.
  //
  // If the document is not a page, or has no locale, nothing happens.
  //
  // If the slug already has a prefix matching another locale, that
  // prefix is removed and replaced with the new one. This is necessary
  // for exports of the slug field to work reasonably.

  self.ensurePageSlugPrefix = function(doc) {
    var allPrefixes = self.historicalPrefixes;
    var prefix = self.prefixes && self.prefixes[self.liveify(doc.workflowLocale)];
    if (!(self.apos.pages.isPage(doc) && doc.workflowLocale)) {
      return;
    }
    // Match the first component of the URL
    var matches = doc.slug && doc.slug.match(/^\/([^/]+)/);
    if (!matches) {
      // No first component or no slug at all
      doc.slug = (prefix || '') + (doc.slug || '/' + self.apos.utils.slugify(doc.title));
    } else {
      var existing = matches[1];
      if (('/' + existing) === prefix) {
        // Good to go
      } else if (_.contains(allPrefixes, '/' + existing)) {
        // There is another prefix present, this is an export of a slug change,
        // replace it
        doc.slug = (prefix || '') + doc.slug.substr(existing.length + 1);
      } else {
        // There is no existing locale prefix
        doc.slug = (prefix || '') + doc.slug;
      }
    }
  };

  // Provide a duplicate locale property, but only on pages, not pieces.
  // This enables us to use a sparse unique mongodb index. The property
  // should never be used for any other purpose.

  self.ensureWorkflowLocaleForPathIndex = function(doc) {
    if (doc.slug.match(/^\//)) {
      doc.workflowLocaleForPathIndex = doc.workflowLocale;
    }
  };

  // Given a doc, find all joins related to that doc: those in its own schema,
  // or in the schemas of its own widgets. These are returned as an array of
  // objects with `doc` and `field` properties, where `doc` may be the doc
  // itself or a widget within it, and `field` is the schema field definition
  // of the join. Only forward joins are returned.

  self.findJoinsInDoc = function(doc) {
    return self.findJoinsInDocSchema(doc).concat(self.findJoinsInAreas(doc));
  };

  // Given a doc, invoke `findJoinsInSchema` with that doc and its schema according to
  // its doc type manager, and return the result.

  self.findJoinsInDocSchema = function(doc) {
    var schema = self.apos.docs.getManager(doc.type).schema;
    return self.findJoinsInSchema(doc, schema);
  };

  // Given a doc, find joins in the schemas of widgets contained in the
  // areas of that doc and  return an array in which each element is an object with
  // `doc` and `field` properties. `doc` is a reference to the individual widget
  // in question, and `field` is the join field definition for that widget.
  // Only forward joins are returned.

  self.findJoinsInAreas = function(doc) {
    var widgets = [];
    self.apos.areas.walk(doc, function(area, dotPath) {
      widgets = widgets.concat(area.items);
    });
    var joins = [];
    _.each(widgets, function(widget) {
      var manager = self.apos.areas.getWidgetManager(widget.type);
      if (!manager) {
        // We already warn about obsolete widgets elsewhere, don't crash
        return;
      }
      var schema = manager.schema;
      joins = joins.concat(self.findJoinsInSchema(widget, schema));
    });
    return joins;
  };

  // Given a doc (or widget) and a schema, find joins described by that schema and
  // return an array in which each element is an object with
  // `doc`, `field` and `value` properties. `doc` is a reference to the doc
  // passed to this method, `field` is a field definition, and `value` is the
  // value of the join if available (the doc was loaded with joins).
  //
  // Only forward joins are returned.

  self.findJoinsInSchema = function(doc, schema) {
    var fromArrays = [];
    return _.map(
      _.filter(
        schema, function(field) {
          if ((field.type === 'joinByOne') || (field.type === 'joinByArray')) {
            if (self.includeType(field.withType)) {
              return true;
            }
          }
          if (field.type === 'array') {
            _.each(doc[field.name] || [], function(doc) {
              fromArrays = fromArrays.concat(self.findJoinsInSchema(doc, field.schema));
            });
          }
        }
      ), function(field) {
        return { doc: doc, field: field, value: doc[field.name] };
      }
    ).concat(fromArrays);
  };

  self.getCreateSingletonOptions = function(req) {
    // disableExportAfterCommit is supported for compatibility with
    // apostrophe-override-options. If it is not present consider
    // exportAfterCommit
    var exportAfterCommit;
    var disableExportAfterCommit = self.getOption(req, 'disableExportAfterCommit');
    if (disableExportAfterCommit !== undefined) {
      exportAfterCommit = !disableExportAfterCommit;
    } else {
      exportAfterCommit = self.getOption(req, 'exportAfterCommit');
    }
    return {
      action: self.action,
      contextGuid: req.data.workflow.context && req.data.workflow.context.workflowGuid,
      locales: self.locales,
      locale: req.locale,
      nestedLocales: self.nestedLocales,
      prefixes: self.prefixes,
      hostnames: self.hostnames,
      exportAfterCommit: exportAfterCommit
    };
  };

  self.addToAdminBar = function() {
    var items = [];
    if (self.localized) {
      self.apos.adminBar.add(self.__meta.name + '-locale-picker-modal', 'Locales');
      items.push(self.__meta.name + '-locale-picker-modal');
    }
    // It's pretty redundant with the new modified documents modal but it's here for bc by default
    if (self.options.submittedModal !== false) {
      self.apos.adminBar.add(self.__meta.name + '-manage-modal', 'Submitted');
      items.push(self.__meta.name + '-manage-modal');
    }
    self.apos.adminBar.group({
      label: 'Workflow',
      items: items
    });
  };

  self.getContextProjection = function() {
    return {
      title: 1,
      slug: 1,
      path: 1,
      workflowLocale: 1,
      tags: 1,
      type: 1
    };
  };

  self.modulesReady = function(callback) {
    self.reconfigureI18n();
    return self.ensureIndexes(callback);
  };

  // Reconfigure the i18n module with knowledge of the locales in
  // use for workflow. Necessary otherwise conflicting configurations
  // in older workflow sites will suddenly fail now that i18n is
  // aware of workflow locales
  self.reconfigureI18n = function() {
    var options = self.apos.modules['apostrophe-i18n'].options;
    options.locales = _.filter(_.keys(self.locales), function(locale) {
      return !locale.match(/-draft$/);
    });
    options.defaultLocale = self.defaultLocale;
    self.apos.i18n.configure(options);
  };

  self.ensureIndexes = function(callback) {

    return Promise.try(function() {
      return self.apos.docs.db.ensureIndex({ workflowGuid: 1 }, {});
    })
      .then(workflowGuidWorkflowLocale)
      .then(function() {
        return self.apos.docs.db.ensureIndex({ workflowLocale: 1, workflowModified: 1 });
      })
      .then(function() {
        return self.apos.docs.db.ensureIndex({ workflowLocale: 1, 'workflowLastCommitted.at': -1 });
      })
      .then(function() {
        return callback(null);
      })
      .catch(callback);

    // Early versions did not have this index and thus could
    // violate the uniqueness of the guid.locale pair under
    // rare race conditions. If the index fails, resolve
    // the duplicates and try again

    function workflowGuidWorkflowLocale() {
      return self.apos.docs.db.ensureIndex({ workflowGuid: 1, workflowLocale: 1 }, { sparse: 1, unique: 1 })
        // eslint-disable-next-line handle-callback-err
        .catch(function(err) {
          return resolveDuplicateDocs()
            .then(function() {
              // now we can try the index again, recursively
              return workflowGuidWorkflowLocale();
            });
        });
    }

    function resolveDuplicateDocs() {
      var locked = false;
      var idsToNew = {};
      // Lock in case somebody else is trying to fix this too
      return Promise.try(function() {
        return self.apos.locks.lock('apostrophe-workflow:resolveDuplicateDocs');
      })
        .then(function() {
          locked = true;
          return self.apos.docs.db.aggregate([
            {
              $match: {
                workflowGuid: { $exists: 1 }
              }
            },
            {
              $group: {
                _id: {
                  workflowGuid: "$workflowGuid",
                  workflowLocale: "$workflowLocale"
                },
                slugsAndIds: {
                  $addToSet: { slug: "$slug", _id: "$_id" }
                },
                count: {
                  $sum: 1
                }
              }
            },
            {
              $match: {
                count: {
                  $gt: 1
                }
              }
            }
          ], { allowDiskUse: true }).toArray();
        })
        .then(function(groups) {
          return Promise.mapSeries(groups, function(group) {
          // Shortest slug is the keeper (the one with
          // a digit added is the one created later)
            group.slugsAndIds.sort(function(a, b) {
              if (a.slug < b.slug) {
                return -1;
              } else if (a.slug > b.slug) {
                return 1;
              } else {
                return 0;
              }
            });
            var id = group.slugsAndIds[0]._id;
            return Promise.mapSeries(group.slugsAndIds.slice(1), function(slugAndId) {
              return Promise.try(function() {
                return self.apos.docs.db.findOne({
                  _id: slugAndId._id
                });
              })
                .then(function(orphan) {
                  if (!orphan) {
                    // Gone already somehow; not our problem
                    return;
                  }
                  self.apos.utils.error(orphan._id + ' duplicates the workflowGuid and workflowLocale of\n' + id + ' and has been removed and appended to the\nworkflowGuidAndLocaleDuplicates property of the latter to resolve this race\ncondition.\n\nThis is no longer possible for new inserts thanks to a unique sparse index.\n');
                  idsToNew[orphan._id] = id;
                  return self.apos.docs.db.update({
                    _id: id
                  }, {
                    $push: {
                      workflowGuidAndLocaleDuplicates: orphan
                    }
                  })
                    .then(function() {
                      return self.apos.docs.db.remove({
                        _id: orphan._id
                      });
                    });
                });
            });
          });
        })
        .then(function() {
        // Alas, we still must iterate all docs to look for joins
        // with the orphaned docs and rewrite them, but at least
        // we can limit writes to cases where they are necessary

          return Promise.promisify(function(callback) {
            return self.apos.migrations.eachDoc({}, function(doc, callback) {

              var modified = false;

              replaceIdsRecursively(doc);

              if (!modified) {
                return setImmediate(callback);
              }

              return self.apos.docs.db.update({
                _id: doc._id
              }, doc, callback);

              // Recursively replace all occurrences of the ids in this locale
              // found in the given doc with their new ids per `idsToNew`. This prevents
              // _id conflicts on insert, even though old data is still in the database
              // under other locale names

              function replaceIdsRecursively(doc) {
                _.each(doc, function(val, key) {
                  if (key === 'workflowGuidAndLocaleDuplicates') {
                  // Do not alter ids inside the historical archive of
                  // the original orphaned docs. -Tom
                    return;
                  }
                  if ((typeof (val) === 'string') && (val.length < 100)) {
                    if (idsToNew[val]) {
                      self.apos.utils.warn('Correcting ' + doc[key] + ' to ' + idsToNew[val] + ' in join');
                      doc[key] = idsToNew[val];
                      modified = true;
                    }
                  } else if (val && (typeof (val) === 'object')) {
                    replaceIdsRecursively(val);
                  }
                });
              }
            }, callback);
          })();
        })
        .finally(function() {
          if (!locked) {
            return;
          }
          return self.apos.locks.unlock('apostrophe-workflow:resolveDuplicateDocs');
        });
    }
  };

  // Create mongodb collection in which to permanently record each commit.
  // This is distinct from the versions collection, which becomes more sparse
  // as you move back through time and doesn't always give access to the
  // version that originally preceded a given version.

  self.enableCollection = function(callback) {
    self.db = self.apos.db.collection('aposWorkflowCommits');
    var indexes = [
      {
        createdAt: -1
      },
      {
        fromId: 1
      },
      {
        toId: 1
      },
      {
        workflowGuid: 1
      }
    ];
    return async.eachSeries(indexes, function(index, callback) {
      return self.db.ensureIndex(index, callback);
    }, callback);
  };

  // Given a dot path like a.b.c, return a.b
  self.getStem = function(dotPath) {
    var stem = dotPath.split(/\./);
    stem.pop();
    return stem.join('.');
  };

  // Given a dot path like a.b.5, return
  // 5 as a number (not as a string)
  self.getIndex = function(dotPath) {
    var stem = dotPath.split(/\./);
    return parseInt(stem[stem.length - 1]);
  };

  // Invoked when the locale cannot be inferred from the session,
  // hostname or URL prefix. The default implementation simply
  // sets the locale to the default locale. You can override this
  // method as you see fit.

  self.guessLocale = function(req) {
    var host = self.getHost(req);
    var hostname;
    var matches = host.match(/^[^:]+/);
    if (matches) {
      hostname = matches[0];
      if (self.defaultLocalesByHostname[hostname]) {
        req.locale = self.defaultLocalesByHostname[hostname];
        return;
      }
    }
    req.locale = self.defaultLocale;
  };

  self.enableCrossDomainSessionCache = function() {
    self.crossDomainSessionCache = self.apos.caches.get('apostrophe-workflow-cross-domain-session-cache');
  };

  self.acceptCrossDomainSessionToken = function(req) {
    var crossDomainSessionToken = self.apos.launder.string(req.query.workflowCrossDomainSessionToken);
    var sessionData;

    return async.series([
      get,
      clear
    ], function(err) {

      if (err) {
        self.apos.utils.error(err);
        return after();
      }

      _.each(_.keys(req.session), function(key) {
        delete req.session[key];
      });
      _.assign(req.session, JSON.parse(sessionData));
      return after();

      function after() {
        // Since the req.session object at this stage is just
        // a plain Javascript object, getters and setters of
        // the Cookie prototype from the express-session module
        // (like req.session.cookie.data) are unavailable and
        // will return 'undefined' when called internally by the
        // express-session module. This ends up corrupting the
        // set-cookie headers generated by the express-session
        // module, thus breaking sessions. The express-session
        // module normally generates an instance of its Cookie
        // prototype which contains these methods and expects
        // that interface always to function properly. To ensure
        // this, we re-instantiate req.session.cookie as an
        // instance of the Cookie class from the express-session
        // module to ensure that the sessions remain intact even
        // across domains. Note that we use the cookie settings
        // from the Apostrophe Express module to ensure that user
        // defined cookie settings are respected.
        let aposExpressModule = self.apos.modules['apostrophe-express'];
        req.session.cookie = new ExpressSessionCookie(aposExpressModule.sessionOptions.cookie);

        return req.res.redirect(self.apos.urls.build(req.url, { workflowCrossDomainSessionToken: null }));
      }
    });

    function get(callback) {
      return self.crossDomainSessionCache.get(crossDomainSessionToken, function(err, _sessionData) {
        sessionData = _sessionData;
        if (!sessionData) {
          return callback('expired or nonexistent cross domain session token');
        }
        return callback(err);
      });
    }

    function clear(callback) {
      return self.crossDomainSessionCache.set(crossDomainSessionToken, null, callback);
    }
  };

  self.refineOptimizeKey = function() {
    // Make sure locales have their own optimizable query lists if apostrophe-optimizer is in use
    self.apos.on('optimizeKey', function(req) {
      req.optimize.key = req.locale + '.' + req.optimize.key;
    });
  };

  // Fill in docs that do not exist yet, by using the closest parent in the locale tree
  // that does exist. If there is no suitable candidate, use whatever is available as a
  // source. If `replicateAcrossLocales` is not `true`, limit the scope of docs this
  // strategy is applied to, covering only those guids returned by `discoverAlwaysReplicated`.
  //
  // This work is carried out subject to the restrictions in `options`, specifically
  // `options.workflowMissingLocalesSubset` should be `live` or `draft`.
  //
  // This method is invoked by the `add-missing-locales` task.

  self.addMissingLocales = function(req, options, callback) {
    let locales = Object.keys(self.locales);
    if (options.workflowMissingLocalesSubset === 'draft') {
      locales = locales.filter(function(locale) {
        return locale === self.draftify(locale);
      });
    } else if (options.workflowMissingLocalesSubset === 'live') {
      locales = locales.filter(function(locale) {
        return locale === self.liveify(locale);
      });
    }

    return Promise.try(function() {
      // Determine criteria for docs of interest
      if (self.options.replicateAcrossLocales === true) {
        return {};
      } else {
        return self.discoverAlwaysReplicated().then(function(guids) {
          if (!guids.length) {
            return { _id: '__iNeverMatch' };
          } else {
            return {
              workflowGuid: { $in: guids }
            };
          }
        });
      }
    }).then(function(criteria) {
      return Promise.try(function() {
        return processGroup(
          {
            slug: /^\//
          }, {
            batchSize: false,
            concurrency: false
          }
        );
      }).then(function() {
        return processGroup(
          {
            slug: /^[^\/]/
          }, {
            batchSize: 100
          }
        );
      });

      function processGroup(subset, runOptions) {
        const byGuid = {};
        const clauses = [];
        const range = { workflowGuid: {} };
        if (runOptions.batchSize && runOptions.guids) {
          range.workflowGuid.$in = runOptions.guids.slice(runOptions.nextIndex, runOptions.nextIndex + runOptions.batchSize);
        };
        if (range.workflowGuid.$in) {
          clauses.push(range);
        }
        clauses.push({
          workflowLocale: { $in: locales }
        });
        const finalCriteria = {
          $and: [
            {
              workflowGuid: { $exists: 1 }
            },
            subset,
            criteria
          ].concat(clauses)
        };
        if (runOptions.batchSize) {
          if (!runOptions.guids) {
            return Promise.try(function() {
              return self.apos.docs.db.distinct('workflowGuid', finalCriteria);
            }).then(function(guids) {
              return processGroup(subset, Object.assign({}, runOptions, {
                guids: guids
              }));
            });
          }
        }
        const cursor = self.apos.docs.db.find(finalCriteria).project({
          workflowGuid: 1,
          workflowLocale: 1,
          path: 1,
          level: 1,
          rank: 1
        }).sort({ workflowGuid: 1 });
        return Promise.try(function() {
          return cursor.toArray();
        }).then(function(docs) {
          if (!docs.length) {
            return [];
          }
          docs.forEach(function(doc) {
            byGuid[doc.workflowGuid] = byGuid[doc.workflowGuid] || [];
            byGuid[doc.workflowGuid].push(doc);
          });
          return Object.keys(byGuid).filter(function(guid) {
            const missing = Object.keys(self.locales).length - byGuid[guid].length;
            return missing > 0;
          });
        }).then(function(inadequateGuids) {
          return Promise.mapSeries(locales, function(locale) {
            const relevantGuids = inadequateGuids.filter(function(guid) {
              return !byGuid[guid].find(function(doc) {
                return doc.workflowLocale === locale;
              });
            });
            // Now sort them by level and rank for better results if a page tree issue
            // must be resolved on the fly
            relevantGuids.sort(function(a, b) {
              const aDoc = getDoc(a);
              const bDoc = getDoc(b);
              if ((aDoc.path !== undefined) && (bDoc.path !== undefined)) {
                if (aDoc.path < bDoc.path) {
                  return -1;
                } else if (aDoc.path > bDoc.path) {
                  return 1;
                }
              }
              if ((aDoc.rank !== undefined) && (bDoc.rank !== undefined)) {
                if (aDoc.rank < bDoc.rank) {
                  return -1;
                } else if (aDoc.rank > bDoc.rank) {
                  return 1;
                }
              }
              // No other criteria, so for stability sort on _id
              if (aDoc._id < bDoc._id) {
                return -1;
              } else if (aDoc._id > bDoc._id) {
                return 1;
              } else {
                return 0;
              }
              function getDoc(guid) {
                return byGuid[guid].find(function(doc) {
                  return doc.workflowLocale === getSourceLocale(guid);
                });
              }
            });

            relevantGuids.forEach(function(guid) {
              //console.log(byGuid[guid].find(function(doc) {
              //  return doc.workflowLocale === getSourceLocale(guid);
              // }).path);
            });
            return Promise.map(relevantGuids, function(guid) {
//              console.log(byGuid[guid].find(function(doc) {
//                return doc.workflowLocale === getSourceLocale(guid);
//              }));
              return self.apos.docs.db.findOne({
                workflowGuid: guid,
              }).then(function(sourceDoc) {
                if (!sourceDoc) {
                  self.apos.utils.warn('Doc disappeared during replication, leaving unreplicated on this pass');
                  return;
                }
                const afterSaveOptions = Object.assign({}, options, {
                  permissions: false,
                  workflowMissingLocalesLive: self.apos.argv.live ? true : 'liveOnly',
                  workflowMissingLocalesLocales: [ locale ]
                });
                return Promise.promisify(self.docAfterSave)(req, sourceDoc, afterSaveOptions);
              });
            }, (runOptions.concurrent !== false) ? { concurrency: 10 } : {});

            function getSourceLocale(guid) {
              const missingLocales = locales.filter(function(locale) {
                return !byGuid[guid].find(function(doc) {
                  return doc.workflowLocale === locale;
                });
              });
              const bestAvailableAncestor = _.findLast(self.locales[locale].ancestors, function(ancestor) {
                return !missingLocales.includes(ancestor);
              });
              // Use the best available ancestor or, if there is no such thing,
              // the first option we come across
              return bestAvailableAncestor || byGuid[guid][0].workflowLocale;
            }
          });
        }).then(function() {
          if (runOptions.batchSize) {
            const nextIndex = (runOptions.nextIndex || 0) + runOptions.batchSize;
            return processGroup(subset, Object.assign({}, runOptions, {
              nextIndex: nextIndex
            }));
          }
        });
      }
    }).then(function() {
      // Silence a runaway promise warning, we are done here
      callback(null);
      return null;
    }).catch(callback);
  };

  // Identify the documents that must always be replicated,
  // even though replicateAcrossLocales is `false` or `'related'`.
  // These are the parked pages, the global doc, and if
  // `replicateAcrossLocales` is set to `related`, also the docs
  // references by those foundational docs - recursively. Returns
  // a promise for the workflowGuids.

  self.discoverAlwaysReplicated = function() {
    return self.apos.docs.db.distinct('workflowGuid', {
      $or: [
        { parkedId: { $exists: 1 } },
        { type: 'apostrophe-global' }
      ],
      workflowGuid: { $exists: 1 }
    }).then(function(workflowGuids) {
      if (self.options.replicateAcrossLocales === false) {
        return workflowGuids;
      } else if (self.options.replicateAcrossLocales === 'related') {
        // recurse
        return self.discoverRelated(workflowGuids);
      } else {
        throw new Error('Unsupported value for options.replicateAcrossLocales:' + self.options.replicateAcrossLocales);
      }
    });
  };

  // Given a set of workflowGuids, expand them until all related
  // workflowGuids (based on joins, recursively) have been added.
  // Does not attempt to consider reverse joins. May produce a very
  // large set. Returns a promise for the final set of workflowGuids.
  self.discoverRelated = function(workflowGuids) {
    let seen = {};
    if (!workflowGuids.length) {
      return workflowGuids;
    }
    return Promise.try(function() {
      return self.apos.docs.db.find({ workflowGuid: { $in: workflowGuids }, trash: { $ne: true } }).toArray();
    }).then(function(results) {
      results.forEach(function(doc) {
        seen[doc._id] = true;
      });
      const next = discoverIds(results);
      return pass(next);
    });

    function pass(_ids) {
      return Promise.try(function() {
        return self.apos.docs.db.find({ _id: { $in: _ids }, trash: { $ne: true } }).toArray();
      }).then(function(results) {
        const next = discoverIds(results);
        if (!next.length) {
          return self.apos.docs.db.distinct('workflowGuid', { _id: { $in: Object.keys(seen) } });
        } else {
          return pass(next);
        }
      });
    }

    function discoverIds(results) {
      const ids = {};
      results.forEach(discoverWithin);
      return Object.keys(ids);
      function discoverWithin(doc) {
        if (doc.type === 'attachment') {
          // Contains doc ids that are not real joins
          return;
        }
        Object.keys(doc).forEach(function(key) {
          if (key.match(/Id$/)) {
            if ((typeof doc[key]) === 'string') {
              if (!seen[doc[key]]) {
                ids[doc[key]] = true;
                seen[doc[key]] = true;
              }
            }
          } else if (key.match(/Ids$/)) {
            if (Array.isArray(doc[key])) {
              doc[key].forEach(function(_id) {
                if (!seen[_id]) {
                  ids[_id] = true;
                  seen[_id] = true;
                }
              });
            }
          } else if (Array.isArray(doc[key])) {
            doc[key].forEach(discoverWithin);
          } else if (doc[key] && ((typeof doc[key]) === 'object')) {
            discoverWithin(doc[key]);
          }
        });
      }
    }
  };

  // Legacy, no longer used, provided for bc.
  //
  // Replicate all docs across all locales in which they are missing. Implementation
  // detail of addMissingLocales. Respects options.criteria, if that is not present
  // all docs are replicated. Implements a detailed algorithm to ensure the closest
  // possible ancestor locale is replicated, if possible, and whatever can be
  // found if not possible.

  self.replicateAllMissingLocales = function(req, options, callback) {
    var locales = _.keys(self.locales);
    var counts = {};
    var basis;
    if (options.workflowMissingLocalesSubset) {
      locales = _.filter(locales, function(locale) {
        if (options.workflowMissingLocalesSubset === 'draft') {
          return locale.match(/-draft$/);
        } else {
          return !locale.match(/-draft$/);
        }
      });
    }

    return async.series([
      count,
      process,
      fallback
    ], callback);

    function count(callback) {
      return async.eachLimit(_.keys(self.locales), 5, function(locale, callback) {
        return self.apos.docs.db.count(Object.assign({}, options.criteria || {}, { workflowLocale: locale }), function(err, count) {
          if (err) {
            return callback(err);
          }
          counts[locale] = count;
          return callback(null);
        });
      }, callback);
    }

    function process(callback) {
      var max = 0;
      _.each(locales, function(locale) {
        if (counts[locale] > max) {
          basis = locale;
          max = counts[locale];
        }
      });
      locales = _.filter(locales, function(locale) {
        return counts[locale] < ((options.completeProportion || 0.9) * max);
      });
      var actionable = _.map(locales, function(locale) {
        // Find closest ancestor that is not also missing
        return _.findLast(self.locales[locale].ancestors, function(locale) {
          return !_.contains(locales, locale);
        });
      });
      actionable = _.filter(actionable, function(locale) {
        return !!locale;
      });
      actionable = _.uniq(actionable);
      actionable.sort(function(a, b) {
        if (self.locales[a].depth < self.locales[b].depth) {
          return 1;
        } else if (self.locales[a].depth > self.locales[b].depth) {
          return -1;
        } else {
          // For a stable sort, do secondary sort on name where depth is the same
          if (a < b) {
            return -1;
          } else if (a > b) {
            return 1;
          } else {
            return 0;
          }
        }
      });

      // This is an async while loop, continuing while there are more locales in the array
      return pass();
      function pass() {
        if (!actionable.length) {
          return callback(null);
        }
        var locale = actionable.shift();
        actionable = _.filter(actionable, function(_locale) {
          return !self.isAncestorOf(locale, _locale);
        });
        return self.apos.migrations.eachDoc(Object.assign({}, options.criteria || {}, { workflowLocale: locale }), 5, function(doc, callback) {
          if (!self.includeType(doc.type)) {
            return setImmediate(callback);
          }
          doc.workflowResolveDeferred = true;
          var afterSaveOptions = _.assign({}, options, {
            permissions: false,
            workflowMissingLocalesLive: self.apos.argv.live ? true : 'liveOnly',
            workflowMissingLocalesDescendantsOf: locale
          });
          return self.docAfterSave(req, doc, afterSaveOptions, callback);
        }, function(err) {
          if (err) {
            return callback(err);
          }
          return pass();
        });
      }
    }

    // There are cases where a suitable ancestor in the tree cannot be found, or a few docs
    // are missing due to race conditions. To mop these up, we make a penultimate pass that
    // considers every unique workflowGuid, preferring the locale with the most docs
    // as a basis but falling back if necessary to any in which it exists. And in the final
    // pass, we use an aggregation query to find absolutely every last workflowGuid that
    // does not have every locale.

    function fallback(callback) {

      return async.series([ viaBasis, noBasis ], callback);

      function viaBasis(callback) {
        return self.apos.migrations.eachDoc(Object.assign({}, options.criteria || {}, { workflowLocale: basis }), 5, function(doc, callback) {
          if (!self.includeType(doc.type)) {
            return setImmediate(callback);
          }
          doc.workflowResolveDeferred = true;
          var afterSaveOptions = _.assign({}, options, {
            permissions: false,
            workflowMissingLocalesLive: self.apos.argv.live ? true : 'liveOnly'
          });
          return self.docAfterSave(req, doc, afterSaveOptions, callback);
        }, callback);
      }

      function noBasis(callback) {
        var localeNames = Object.keys(self.locales);
        var orphans;
        return async.series([ find, fix ], callback);
        function find(callback) {
          const query = [
            {
              $match: Object.assign({}, options.criteria || {}, {
                workflowLocale: { $in: localeNames }
              })
            },
            {
              $group: {
                _id: "$workflowGuid",
                count: { $sum: 1 }
              }
            },
            {
              $match: {
                count: { $lt: localeNames.length }
              }
            }
          ];

          return self.apos.docs.db.aggregate(query).toArray(function(err, _orphans) {
            if (err) {
              return callback(err);
            }
            orphans = _orphans;
            return callback(null);
          });
        }

        function fix(callback) {
          var seen = {};
          if (!orphans.length) {
            return callback(null);
          }
          // The aggregation query returns the workflowGuids but I haven't been able to
          // convince it to give me representative _ids to go with them, so we will just
          // ignore the additional locales after we fix each one once. -Tom
          return self.apos.migrations.eachDoc({ workflowGuid: { $in: _.pluck(orphans, '_id') } }, 5, function(doc, callback) {
            if (seen[doc.workflowGuid]) {
              return setImmediate(callback);
            }
            seen[doc.workflowGuid] = true;
            if (!self.includeType(doc.type)) {
              return setImmediate(callback);
            }
            doc.workflowResolveDeferred = true;
            var afterSaveOptions = _.assign({}, options, {
              permissions: false,
              workflowMissingLocalesLive: self.apos.argv.live ? true : 'liveOnly'
            });
            return self.docAfterSave(req, doc, afterSaveOptions, callback);
          }, callback);
        }
      }
    }
  };

  self.enableFacts = function(callback) {
    return self.apos.db.collection('aposWorkflowFacts', function(err, facts) {
      if (err) {
        return callback(err);
      }
      self.facts = facts;
      return callback(null);
    });
  };

  // Run the specified function if the specified fact has changed. The fact is
  // compared to its old value in the database using `_.isEqual()`. If there
  // is no old value in the database this is treated as a change. The function
  // receives `(oldFact, newFact, callback)` and must invoke the callback given to it.
  // After this completes successfully, the fact's last known value is updated in the database.
  //
  // If `fn` reports an error, the callback receives that error and the fact's last
  // known value is not updated.
  //
  // A lock is used to prevent race conditions.

  self.ifFactChanged = function(name, newValue, fn, callback) {
    return self.apos.locks.withLock('apostrophe-workflow-facts-' + name, function(callback) {
      return self.facts.findOne({ _id: name }, function(err, fact) {
        if (err) {
          return callback(err);
        }
        fact = fact && _.omit(fact, '_id');
        if (_.isEqual(newValue, fact)) {
          return callback(null);
        }
        return fn(fact, newValue, function(err) {
          if (err) {
            return callback(err);
          }
          return self.facts.update({ _id: name }, newValue, { upsert: true }, callback);
        });
      });
    }, callback);
  };

  // Return an object to be compared to a previous value in order
  // to determine whether add-missing-locales and add-locale-prefixes should be run

  self.getLocalesFact = function() {
    var fact = {};
    fact.locales = _.keys(self.locales);
    fact.prefixes = self.prefixes;
    return fact;
  };

  // Runs the add-missing-locales and add-locale-prefixes tasks at startup,
  // if the relevant configuration has changed. Called for you by the
  // page parking mechanism before pages are parked.

  self.updatePerConfiguration = function(callback) {
    return self.ifFactChanged('locales', self.getLocalesFact(), fixBody, callback);
    function fixBody(oldFact, newFact, callback) {
      return async.series([
        addMissingLocales,
        addLocalePrefixes
      ], callback);
      function addMissingLocales(callback) {
        return self.addMissingLocalesTask(self.apos, self.apos.argv, callback);
      }
      function addLocalePrefixes(callback) {
        return self.updateLocalePrefixes(oldFact, newFact, callback);
      }
    }
  };

  // Update all out of date locale prefixes. Requires
  // the old and new values of self.getLocalesFact() to
  // do this efficiently. If these arguments are omitted entirely,
  // all pages are updated

  self.updateLocalePrefixes = function(oldFact, newFact, callback) {
    if (arguments.length === 1) {
      // May omit facts
      callback = oldFact;
      oldFact = null;
      newFact = null;
    }
    var req = self.apos.tasks.getReq();
    return async.eachSeries(_.keys(self.locales), function(locale, callback) {
      var criteria = {
        $and: [
          {
            slug: /^\//,
            workflowLocale: locale
          }
        ]
      };
      if (oldFact && newFact) {
        var oldPrefix = oldFact.prefixes && oldFact.prefixes[self.liveify(locale)];
        var newPrefix = newFact.prefixes && newFact.prefixes[self.liveify(locale)];
        if (oldPrefix === newPrefix) {
          // No change for this specific locale
          return setImmediate(callback);
        }
        if (oldPrefix && oldPrefix.length) {
          criteria.$and.push({
            slug: new RegExp('^' + self.apos.utils.regExpQuote(oldPrefix + '/'))
          });
        } else if (newPrefix && newPrefix.length) {
          criteria.$and.push({
            slug: {
              $not: new RegExp('^' + self.apos.utils.regExpQuote(newPrefix + '/'))
            }
          });
        } else {
          // If not equal and neither has a length, it must be no change
          // when considered as a string
          return setImmediate(callback);
        }
      }
      return self.apos.migrations.eachDoc(criteria, function(page, callback) {
        return self.apos.pages.update(req, page, { permissions: false }, callback);
      }, callback);
    }, callback);
  };

  self.updateHistoricalPrefixes = function(callback) {
    return self.apos.locks.withLock('apostrophe-workflow-update-historical-prefixes', function(callback) {
      return async.series([
        getHistoricalPrefixes,
        updateHistoricalPrefixes
      ], callback);
      function getHistoricalPrefixes(callback) {
        return self.facts.findOne({ _id: 'historicalPrefixes' }, function(err, historicalPrefixes) {
          if (err) {
            return callback(err);
          }
          self.historicalPrefixes = (historicalPrefixes && historicalPrefixes.prefixes) || [];
          return callback(null);
        });
      }
      function updateHistoricalPrefixes(callback) {
        self.historicalPrefixes = _.union(self.historicalPrefixes, _.values(self.prefixes || {}));
        return self.facts.update({ _id: 'historicalPrefixes' }, { prefixes: self.historicalPrefixes }, { upsert: true }, callback);
      }
    }, callback);
  };

  // Used to distinguish API calls from page and asset URLs that might imply the
  // URL does *not* contain a locale prefix.

  self.composeApiCalls = function() {
    self.options.apiCalls = (self.options.apiCalls || [
      /^\/modules\/.*$/,
      /\.\w+$/,
      '/login',
      '/logout'
    ]).concat(self.options.addApiCalls || []);
  };

  // Used to distinguish API calls from page and asset URLs that might imply the
  // URL does *not* contain a locale prefix.

  self.isApiCall = function(req) {
    const url = req.url.replace(/\?.*$/);
    return _.find(self.options.apiCalls, function(apiCall) {
      if (apiCall && apiCall.test) {
        return apiCall.test(url);
      }
      return minimatch(url, apiCall, {});
    });
  };

  self.addWorkflowModifiedMigration = function() {
    self.apos.migrations.add(self.__meta.name + '.workflowModified', function() {
      return self.recomputeModified();
    }, { safe: true });
  };

  self.addWorkflowLastCommittedMigration = function() {
    self.apos.migrations.add(self.__meta.name + '.workflowLastCommitted', function() {
      return self.recomputeLastCommitted();
    }, { safe: true });
  };

  // Returns true if the given doc should always replicate across locales when inserted. By default
  // this returns true for all docs subject to workflow. If the `replicateAcrossLocales` option
  // is not `true`, it is only true for parked pages (including the home page) and the global doc.
  // If this method is overridden the query logic in the `addMissingLocales` method will also need work.

  self.replicates = function(req, doc) {
    if (!self.includeType(doc.type)) {
      return false;
    }
    if (options.replicateAcrossLocales === true) {
      return true;
    }
    if (doc.parkedId) {
      return true;
    }
    if (doc.type === 'apostrophe-global') {
      return true;
    }
    return false;
  };

  // Returns true if the locale should be stored to req.session,
  // false if it should not be, i.e. the csrf.disableAnonSession
  // option is in play in apostrophe-express and the user is not
  // logged in

  self.localeInSession = function(req) {
    var expressModule = self.apos.modules['apostrophe-express'];
    return req.user || (!(expressModule.options.csrf && expressModule.options.csrf.disableAnonSession));
  };
};
