var async = require('async');
var _ = require('lodash');

var diff = require('jsondiffpatch').create({
  objectHash: function(obj, index) {
    // try to find an id property, otherwise compare full JSON, which rules
    // out distinguishing content change from being an entirely new thing
    return obj._id || obj.id || JSON.stringify(obj);
  },
  textDiff: {
    // Don't try to diff text — replace it. Otherwise
    // patches are never applicable across locales
    minLength: 1000000000
  },
  arrays: {
    detectMove: true,
    // We don't actually copy the old value, however it is useful for the visual diff
    includeValueOnMove: true
  }
});

module.exports = {

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

  afterConstruct: function(self, callback) {
    self.extendCursor();
    self.extendIndexes();
    self.enableAddMissingLocalesTask();
    self.pushAssets();
    self.addToAdminBar();
    self.extendPieces();
    self.extendPermissionsField();
    self.extendPermissions();
    self.apos.pages.addAfterContextMenu(self.menu);
    return self.enableCollection(callback);
  },

  construct: function(self, options) {
    self.nestedLocales = options.locales || [
      {
        name: 'default'
      }
    ];
    
    self.locales = {};
    flattenLocales(self.nestedLocales);
    addDraftLocales();
    
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
        draftLocale.name += '-draft';
        delete draftLocale.children;
        newLocales[draftLocale.name] = draftLocale;
      });
      self.locales = newLocales;
    }
    
    self.defaultLocale = options.defaultLocale || 'default';

    self.baseExcludeProperties = options.baseExcludeProperties || [
      '_id',
      'path',
      'rank',
      'level',
      'docPermissions',
      'createdAt',
      'updatedAt',
      'lowSearchText',
      'highSearchText',
      'highSearchWords',
      'searchSummary'
    ];
    
    // Attachment fields themselves are not directly localized (they are not docs)
    self.excludeActions = (self.options.excludeActions || []).concat(self.options.baseExcludeActions || [ 'admin', 'edit-attachment' ]);
    
    self.includeVerbs = (self.options.includeVerbs || []).concat(self.options.baseIncludeVerbs  || [ 'admin', 'edit' ]);

    // Localizing users and groups raises serious security questions. If they have a public representation,
    // make a new doc type and join to it
    self.baseExcludeTypes = [ 'apostrophe-user', 'apostrophe-group' ];

    // In 2.x, workflow applies to every property not explicitly excluded,
    // so configuration is simpler (localization will refine this though)
    self.excludeProperties = self.baseExcludeProperties.concat(options.excludeProperties || []);
    
    self.includeTypes = options.includeTypes || false;
    self.excludeTypes = self.baseExcludeTypes.concat(options.excludeTypes || []);

    // Extend all apostrophe cursors to limit results to the current locale by default
    self.extendCursor = function() {
      self.apos.define('apostrophe-cursor', require('./lib/cursor.js'));
    };

    require('./lib/permissions-schema-field.js')(self, options);
    
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
      if (!self.apos.docs.getManager(info.type)) {
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

      // OK, now we know this is something we're entitled to an opinion about

      // Rebuild the action string using the effective verb and type name
      action = info.verb + '-' + info.type;

      if (!(req.user && req.user._permissionsLocales && req.user._permissionsLocales[action])) {
        info.response = info._false;
        return;
      }

      var permissionsLocales = req.user._permissionsLocales[action];

      if (_.isEmpty(permissionsLocales)) {
        info.response = info._false;
        return;
      }

      if (event === 'criteria') {
        info.response = { $and: [ info.response, { workflowLocale: { $in: _.keys(permissionsLocales) } } ] };
      } else {
        var object = info.object || info.newObject;
        if (!permissionsLocales[object ? object.workflowLocale : req.locale ]) {
          info.response = info._false;
          return;
        }
      }

    };
    
    // When editing pieces, we should always get the draft version of
    // the content unless otherwise specified

    self.extendPieces = function() {
      self.apos.on('piecesFindForEditing', function(type, cursor) {
        if (!self.includeType(type)) {
          return;
        }
        var req = cursor.get('req');
        if (!req.locale.match(/\-draft$/)) {
          var locale = cursor.get('workflowLocale');
          if (locale === undefined) {
            cursor.workflowLocale(req.locale + '-draft');
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
          type: 'major',
          label: 'Submit',
          action: 'submit'
        });
        // TODO: if and only if they are admin of this piece type in corresponding non-draft locale
        info.controls.push({
          type: 'major',
          label: 'Commit',
          action: 'commit'
        });
      }
    };

    // Every time a doc is saved, check whether its type is included in workflow. If it is,
    // and the doc does not yet have a `workflowLocale` property, establish one and generate
    // the `workflowGuid` property. Set the `_workflowNew` flag for the attention of
    // `docAfterSave`.

    self.docBeforeSave = function(req, doc, options) {
      if (doc._workflowPropagating) {
        // Recursion guard
        return;
      }
      if (!self.includeType(doc.type)) {
        return;
      }
      if (!doc.workflowLocale) {
        doc.workflowLocale = req.locale || self.defaultLocale;
        if (!doc.workflowLocale.match(/\-draft$/)) {
          // Always create the draft first, so we can then find it by id successfully
          // via code that is overridden to look for drafts. All the locales get created
          // but we want to return the draft's _id
          doc.workflowLocale += '-draft';
        }
        doc.workflowGuid = self.apos.utils.generateId();
        doc._workflowNew = true;
        self.ensureWorkflowLocaleForPathIndex(doc);
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
    
    // Every time a doc is saved, check whether its type is included in workflow. If it is,
    // check for locales in which that workflowGuid does not exist yet, and bring it into existence
    // there. If the doc has the `_workflowNew` property as set by `docBeforeSave`, we can assume
    // it is new in all other locales, otherwise query to find out.
    //
    // These newly created docs in other locales are initially unpublished.

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
          if (!locale.match(/\-draft$/)) {
            // Otherwise you can make something happen in public just by creating a new doc
            // that is published as a draft and watching it propagate
            _doc.published = false;
          }
          self.ensureWorkflowLocaleForPathIndex(_doc);
          return async.series([
            _.partial(self.resolveRelationships, req, _doc, _doc.workflowLocale),
            insert
          ], callback);
          
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
            docPermissions: doc.docPermissions
          }
        }, {
          multi: true
        }, callback);
      }
    };
    
    // Resolve relationships between this doc and other docs, which need to be
    // mapped to the appropriate doc in the new locale, via the workflowGuid
    // property of each doc.
    //
    // Existing join ids in `doc` are remapped to the corresponding ids in `toLocale`.
    //
    // This method DOES NOT save the doc and should not modify anything on its own.
    // Note that the diff implementation utilizes this method so that it's comparing
    // ids of the same locale.

    self.resolveRelationships = function(req, doc, toLocale, callback) {

      // Expansion is anticipated

      return async.series([
        mapJoins
      ], function(err) {
        return callback(err);
      });

      function mapJoins(callback) {
        // First create an array of objects with doc and field properties, so we can asynchronously
        // iterate over them

        var joins = [];
        var workflowGuidToOldId = {};
        var oldIdToNewId = {};

        findJoinsInDocSchema();
        findJoinsInAreas();

        var workflowGuids;
        var secondLocaleIds;
        var originalIds;

        return async.eachSeries(joins, function(join, callback) {
          return async.series([
            findWorkflowGuids,
            findSecondLocaleIds
          ], function(err) {
            if (err) {
              return callback(err);
            }
            remapDocs();
            return callback(null);
          });
          
          function findWorkflowGuids(callback) {
            if (join.type === 'joinByOne') {
              return self.apos.docs.db.find({ _id: { $in: [ join.doc[join.field.idField] ] } }, { workflowGuid: 1 }).toArray(function(err, docs) {
                if (err) {
                  return callback(err);
                }
                workflowGuids = _.pluck(docs, 'workflowGuid');
                _.each(docs, function(doc) {
                  workflowGuidToOldId[doc.workflowGuid] = doc._id;
                });
                return callback(null);
              });
            } else {
              return self.apos.docs.db.find({ _id: { $in: join.doc[join.field.idsField] || [] } }, { workflowGuid: 1 }).toArray(function(err, docs) {
                originalIds = join.doc[join.field.idsField];
                if (err) {
                  return callback(err);
                }
                _.each(docs, function(doc) {
                  workflowGuidToOldId[doc.workflowGuid] = doc._id;
                });
                workflowGuids = _.pluck(docs, 'workflowGuid');
                return callback(null);
              });
            }
          }

          function findSecondLocaleIds(callback) {
            return self.apos.docs.db.find({ workflowGuid: { $in: workflowGuids }, workflowLocale: toLocale }, { _id: 1, workflowGuid: 1 }).toArray(function(err, docs) {
              if (err) {
                return callback(err);
              }
              secondLocaleIds = _.pluck(docs, '_id');
              _.each(docs, function(doc) {
                if (_.has(workflowGuidToOldId, doc.workflowGuid)) {
                  oldIdToNewId[workflowGuidToOldId[doc.workflowGuid]] = doc._id;
                }
              });
              return callback(null);
            });
          }

          function remapDocs() {
            if (join.type === 'joinByOne') {
              join.doc[join.field.idField] = secondLocaleIds[0];
            } else {
              if (join.field.relationship) {
                var relationships = join.doc[join.field.relationshipsField];
                var newRelationships = {};
                _.each(relationships, function(val, _id) {
                  if (_.has(oldIdToNewId, _id)) {
                    newRelationships[oldIdToNewId[_id]] = val;
                  }
                });
                join.doc[join.field.relationshipsField] = newRelationships;
              }
              // Rebuild the original order properly
              secondLocaleIds = _.map(originalIds, function(id) {
                return oldIdToNewId[id];
              });
              join.doc[join.field.idsField] = secondLocaleIds;
            }
          }

        }, callback);
                  
        function findJoinsInDocSchema() {
          var schema = self.apos.docs.getManager(doc.type).schema;
          joins = joins.concat(findJoinsInSchema(doc, schema));
        }
        
        function findJoinsInAreas() {
          var widgets = [];
          self.apos.areas.walk(doc, function(area, dotPath) {
            widgets = widgets.concat(area.items);
          });
          widgets = _.filter(widgets, function(widget) {
            var schema = self.apos.areas.getWidgetManager(widget.type).schema;
            joins = joins.concat(findJoinsInSchema(widget, schema));
          });
        }
        
        function findJoinsInSchema(doc, schema) {
          return _.map(
            _.filter(
              schema, function(field) {
                if ((field.type === 'joinByOne') || (field.type === 'joinByArray')) {
                  if (self.includeType(field.withType)) {
                    return true;
                  }
                }
              }
            ), function(field) {
              return { doc: doc, field: field };
            }
          );
        }  
      } 
   
    };

    // Commit a doc from one locale to another. `from` and `to` should
    // be the doc as found in each of the locales. The callback receives
    // `(null, commitId)` where `commitId` is a unique identifier for
    // this specific commit.

    self.commit = function(req, from, to, callback) {
      delete from.workflowSubmitted;
      var commitId;
      // For storage in the commits collection
      var originalTo = self.apos.utils.clonePermanent(to);
      return async.series([
        // Resolve the relationships for originalTo as well so we can straightforwardly
        // call diff() later
        _.partial(self.resolveRelationships, req, originalTo, to.workflowLocale),
        _.partial(self.copyIncludedProperties, req, from, to),
        _.partial(self.resolveRelationships, req, to, to.workflowLocale),
        insertCommit,
        _.partial(self.apos.docs.update, req, to)
      ], function(err) {
        return callback(err, commitId);
      });
      function insertCommit(callback) {
        return self.insertCommit(req, from, originalTo, function(err, _commitId) {
          if (err) {
            return callback(err);
          }
          commitId = _commitId;
          return callback(null);
        });
      }
    };
    
    // Fetch the draft version of a doc, whose id is `id`, and also the live version of the same
    // doc. On success, deliver `(null, draft, live)` to the callback.
    //
    // This method will operate properly regardless of whether `req.locale` is the live locale
    // or the one with the `-draft` suffix.
    
    self.getDraftAndLive = function(req, id, callback) {
      var draft;
      var live;
      return async.series([
        getDraft,
        getLive
      ], function(err) {
        if (err) {
          return callback(err);
        }
        return callback(null, draft, live);
      });
      function getDraft(callback) {
        var locale = req.locale;
        if (!req.locale.match(/\-draft$/)) {
          locale += '-draft';
        }
        return self.apos.docs.find(req, { _id: id }).permission('edit').published(null).workflowLocale(locale).toObject(function(err, _draft) {
          if (err) {
            return callback(err);
          }
          draft = _draft;
          if (!draft) {
            return callback('draft not found');
          }
          return callback(null);
        });
      }
      // We don't actually need the live version (the previewing stuff happens in an iframe),
      // but we should verify we have edit permissions there
      function getLive(callback) {
        return self.apos.docs.find(req, { workflowGuid: draft.workflowGuid }).workflowLocale(req.locale.replace(/\-draft$/, '')).permission('edit').published(null).toObject(function(err, _live) {
          if (err) {
            return callback(err);
          }
          live = _live;
          if (!live) {
            return callback('live not found');
          }
          return callback(null);
        });
      }      
    };
    
    self.route('post', 'commit', function(req, res) {
      if (!req.user) {
        // Confusion to the enemy
        return res.status(404).send('not found');
      }
      var id = self.apos.launder.id(req.body.id);
      var draft, live, commitId;
      return async.series({
        getDraftAndLive,
        commit
      }, function(err) {
        if (err) {
          console.error(err);
          return res.send({ status: 'error' });
        }
        return res.send({ status: 'ok', commitId: commitId });
      });
      function getDraftAndLive(callback) {
        return self.getDraftAndLive(req, id, function(err, _draft, _live) {
          if (err) {
            return callback(err);
          }
          draft = _draft;
          live = _live;
          return callback(null, draft, live);
        });
      }
      function commit(callback) {
        return self.commit(req, draft, live, function(err, _commitId) {
          commitId = _commitId;
          return callback(err);
        });
      }
    });

    self.route('post', 'export', function(req, res) {
      if (!req.user) {
        // Confusion to the enemy
        return res.status(404).send('not found');
      }
      var id = self.apos.launder.id(req.body.id);
      var locales = [];
      var errors = [];
      var drafts;
      if (Array.isArray(req.body.locales)) {
        locales = _.filter(req.body.locales, function(locale) {
          return ((typeof(locale) === 'string') && (_.has(self.locales, locale)));
        });
      }
      locales = _.map(locales, function(locale) {
        return locale + '-draft';
      });
      var commit;
      return async.series({
        getCommit,
        applyPatches
      }, function(err) {
        if (err) {
          console.error(err);
          return res.send({ status: 'error' });
        }
        // Here the `errors` object has locales as keys and strings as values; these can be
        // displayed or, since they are technical, just flagged as locales to which the patch
        // could not be successfully applied
        return res.send({ status: 'ok', errors: errors });
      });
      function getCommit(callback) {
        return self.db.findOne({ _id: id }, function(err, _commit) {
          if (err) {
            return callback(err);
          }
          commit = _commit;
          if (!commit) {
            return callback('notfound');
          }
          return callback(null);
        });
      }
      function applyPatches(callback) {
        return async.eachSeries(locales, function(locale, callback) {
          var draft;
          return async.series([ getDraft, resolveToSource, applyPatch, resolveToDestination, update ], callback);
          function getDraft(callback) {
            return self.apos.docs.find(req, { workflowGuid: commit.workflowGuid }).published(null).workflowLocale(locale).permission('edit').toObject(function(err, _draft) {
              if (err) {
                return callback(err);
              }
              draft = _draft;
              return callback(null);
            });
          }
          // Resolve relationship ids to point to the locale the patch is coming from,
          // so that the diff applies properly
          function resolveToSource(callback) {
            return self.resolveRelationships(req, draft, commit.to.workflowLocale, callback);
          }
          function applyPatch(callback) {
            if (!draft) {
              errors.push(locale.replace(/\-draft$/, '') + ': not found, run task');
              return callback(null);
            }
            self.deleteExcludedProperties(commit.from);
            self.deleteExcludedProperties(commit.to);
            var patch = diff.diff(commit.to, commit.from);
            // If a patch edits a widget in an area that doesn't exist at all yet
            // in the receiving locale, create the area
            _.each(patch, function(value, key) {
              if (!draft[key]) {
                if (commit.from[key] && (commit.from[key].type === 'area')) {
                  draft[key] = {
                    type: 'area',
                    items: []
                  };
                }
              }
            });
            try {
              console.log('patch is: ', JSON.stringify(patch, null, '  '));
              console.log('draft is: ', JSON.stringify(draft, null, '  '));
              diff.patch(draft, patch);
            } catch (e) {
              errors.push(locale.replace(/\-draft$/, ''));
              console.error(e);
            }
            return callback(null);
          }
          // Resolve relationship ids back to the locale the draft is coming from
          function resolveToDestination(callback) {
            return self.resolveRelationships(req, draft, draft.workflowLocale, callback);
          }
          function update(callback) {
            return self.apos.docs.update(req, draft, callback); 
          }
        }, callback);
      }
    });
    
    self.deleteExcludedProperties = function(doc) {
      _.each(doc, function(val, key) {
        if (!self.includeProperty(key)) {
          delete doc[key];
        }
      });
    };
    
    // Given a workflowGuid and a draft workflowLocale, return the doc for the corresponding live locale

    self.route('post', 'get-live', function(req, res) {

      if (!req.user) {
        // Confusion to the enemy
        return res.status(404).send('not found');
      }
      var guid = self.apos.launder.string(req.body.workflowGuid);
      var locale = self.apos.launder.string(req.body.workflowLocale);
      locale = locale.replace(/\-draft$/, '');
      var live;

      return async.series([
        get,
        ids
      ], function(err) {
        if (err) {
          return fail(err);
        }
        if (!live) {
          return fail('not found');
        }
        return res.send({ status: 'ok', doc: live });
      });
      
      function get(callback) {
        return self.apos.docs.find(req, { workflowGuid: guid, workflowLocale: locale }).published(null).workflowLocale(locale).toObject(function(err, _live) {
          live = _live;
          return callback(err);
        });
      }
      
      function ids(callback) {
        if (!req.body.resolveRelationshipsToDraft) {
          return callback(null);
        }
        return self.resolveRelationships(req, live, locale + '-draft', callback);
      }
      
      function fail(err) {
        console.error(err);
        return res.send({ status: 'error' });
      }

    });
        
    // Copy properties that are included in workflow from the doc `from`
    // to the doc `to`. TODO: this method does not yet address copying
    // modified attachments to make sure an edit to one locale does not alter
    // a file in another. It is however async to allow for that to
    // be implemented later.
    //
    // This method does not touch the database, that is up to you.

    self.copyIncludedProperties = function(req, from, to, callback) {
      // We have to be able to:
      //
      // * Copy everything configured to be copied
      // * Omit everything else
      // * Not damage everything else
      //
      // So we copy all schema properties and top-level areas not excluded.
      
      _.each(from, function(val, key) {
        if (self.includeProperty(key)) {
          to[key] = val;
        }
      });

      // TODO deal with copying attachments rather than referencing
      // the same file, however take care not to do it if there is no change
      
      return setImmediate(callback);
    };
    
    // Returns true if this top level doc property should be included 
    // when committing changes from draft to live
    self.includeProperty = function(prop) {
      if (prop.match(/^_?workflow/)) {
        return false;
      }
      if (_.contains(self.excludeProperties, prop)) {
        return false;
      }
      return true;
    };
        
    // The callback will receive basic information about all docs editable by the
    // current user that are awaiting approval to merge from draft to live.
    //
    // Note that this means approval was actively requested by an editor.
    //
    // The callback will receive `(null, array)` where `array` contains an object
    // for each doc. Properties will include title, slug and other properties needed for
    // basic link generation and presentation. `getSubmittedProjection` may be
    // overridden to add more.
    //
    // If `options.criteria` is present it is merged with the MongoDB criteria.
    // You may use this to restrict the response to a particular type of doc
    // or a particular source locale (`workflowLocale`).

    self.getSubmitted = function(req, options, callback) {
      var criteria = options.criteria || {};
      criteria = {
        $and: [
          {
            workflowSubmitted: { $exists: 1 }
          },
          criteria
        ]
      };
      return self.apos.docs.find(req, criteria, self.getSubmittedProjection()).sort({ $exists: 1 }).published(null).workflowLocale(false).toArray(callback);
    };
        
    // Returns the projection to be used when fetching submitted docs to generate
    // a list of docs requiring approval. Should be enough to generate permalinks.

    self.getSubmittedProjection = function() {
      return {
        title: 1,
        slug: 1,
        path: 1,
        rank: 1,
        type: 1,
        tags: 1
      };
    };
    
    self.getDocAndCommits = function(req, id, callback) {
      // We fetch the doc first, and if we can't get it with edit permissions we bail
      return self.apos.docs.find(req, { _id: id }).permission('edit').published(null).workflowLocale(null).areas(false).joins(false).toObject(function(err, doc) {
        if (err) {
          return callback(err);
        }
        if (!doc) {
          return callback('notfound');
        }
        return self.db.find({ fromId: id }).sort({ createdAt: -1 }).toArray(function(err, commits) {
          if (err) {
            return callback(err);
          }
          return callback(null, doc, commits);
        });
      });
    };
    
    // Decide whether a doc type is subject to workflow as documented for the module options.

    self.includeType = function(type) {
      if (self.includeTypes) {
        if (!_.contains(self.includeTypes, type)) {
          return false;
        }
      }
      if (self.excludeTypes) {
        var result = !_.contains(self.excludeTypes, type);
        return result;
      }
      return true;
    };
    
    // Set `req.locale` based on `req.query.locale` or `req.session.locale`.
    // If the locale is not present or is not valid, set `req.locale` to the
    // default locale. Store the locale in `req.session.locale`. TODO: also
    // implement subdomains and URL prefixes for locales.

    self.expressMiddleware = {
      before: 'apostrophe-global',
      middleware: function(req, res, next) {
        if (req.query.workflowLocale) {
          // Switch locale choice in session via query string, then redirect
          var locale = self.apos.launder.string(req.query.workflowLocale);
          if (_.has(self.locales, locale)) {
            req.session.locale = locale;
          }
          return res.redirect(req.url.replace(/\??workflowLocale=[^&]+&?/, ''));
        }
        req.locale = req.query.locale || req.session.locale;
        if ((!req.locale) || (!_.has(self.locales, req.locale))) {
          req.locale = self.defaultLocale;
        }
        req.session.locale = req.locale;
        if (req.user) {
          if (req.session.workflowMode === 'draft') {
            req.locale += '-draft';
          } else {
            // Default mode is previewing the live content, not editing
            req.session.workflowMode = 'live';
          }
        }
        var locale = self.locales[req.locale];
        return next();
      }
    };
                
    self.enableAddMissingLocalesTask = function() {
      self.apos.tasks.add(self.__meta.name, 'add-missing-locales',
        'Run this task after adding new locales or setting up the module for the first time.',
        self.addMissingLocalesTask
      );
    };

    self.addMissingLocalesTask = function(apos, argv, callback) {
      var req = self.apos.tasks.getReq();
      
      return async.series([
        fixIndexes,
        noLocales,
        missingSomeLocales
      ], function(err) {
        return callback(err);
      });
      
      function fixIndexes(callback) {
        var old;
        return async.series([
          getOld,
          // New indexes first, so we're not without a unique index if the site is up
          ensureNewSlug,
          ensureNewPath,
          dropOldSlug,
          dropOldPath
        ], callback);
        function getOld(callback) {
          return self.apos.docs.db.indexes(function(err, _old) {
            if (err) {
              return callback(err);
            }
            old = _old;
            return callback(null);
          });
        }
        function ensureNewSlug(callback) {
          return self.apos.docs.db.ensureIndex({ slug: 1, workflowLocale: 1 }, { unique: true }, callback);
        }
        function ensureNewPath(callback) {
          // workflowLocaleForPathIndex is identical to workflowLocale except that it exists only
          // when path exists, allowing the sparse unique index to work properly with pieces
          // as well as pages.
          return self.apos.docs.db.ensureIndex({ path: 1, workflowLocaleForPathIndex: 1 }, { unique: true, sparse: true }, callback);
        }
        function dropOldSlug(callback) {
          var existing =_.find(old, function(index) {
            return index.slug && (!index.workflowLocale);
          });
          if (!existing) {
            return callback(null);
          }
          return self.apos.docs.db.dropIndex(existing.name, callback);
        }
        function dropOldPath(callback) {
          var existing =_.find(old, function(index) {
            return index.path && (!index.workflowLocaleForPathIndex);
          });
          if (!existing) {
            return callback(null);
          }
          return self.apos.docs.db.dropIndex(existing.name, callback);
        }
      }
      
      function noLocales(callback) {
        return self.apos.migrations.eachDoc({ workflowLocale: { $exists: 0 } }, function(doc, callback) {
          if (!self.includeType(doc.type)) {
            return setImmediate(callback);
          }
          doc.workflowLocale = self.defaultLocale;
          self.ensureWorkflowLocaleForPathIndex(doc);
          doc.workflowGuid = self.apos.utils.generateId();
          return self.apos.docs.update(req, doc, callback);
        }, callback);
      }
      
      function missingSomeLocales(callback) {
        return self.apos.migrations.eachDoc({ workflowLocale: self.defaultLocale }, function(doc, callback) {
          if (!self.includeType(doc.type)) {
            return setImmediate(callback);
          }
          return self.docAfterSave(req, doc, { permissions: false }, function(err) {
            return callback(err);
          });
        }, callback);
      }
    };
    
    self.route('post', 'workflow-mode', function(req, res) {
      if (!req.user) {
        // Confusion to the enemy
        return res.status(404).send('not found');
      }
      req.session.workflowMode = (req.body.mode === 'draft') ? 'draft' : 'live';
      if (req.body.mode === 'draft') {
        if (!req.locale.match(/\-draft$/)) {
          req.locale += '-draft';
        }
      } else {
        req.locale = req.locale.replace(/\-draft$/, '');
      }
      return self.apos.docs.find(req, { workflowGuid: self.apos.launder.id(req.body.workflowGuid) })
        .published(null)
        .workflowLocale(req.locale)
        .toObject(function(err, doc) {
          if (err) {
            return res.status(500).send('error');
          }
          if ((!doc) || (!doc._url)) {
            return res.send({ status: 'ok', url: '/' });
          }
          return res.send({ status: 'ok', url: doc._url });
        }
      );
    });
        
    self.route('post', 'submit', function(req, res) {
      if (!req.user) {
        // Confusion to the enemy
        return res.status(404).send('not found');
      }
      var ids = self.apos.launder.ids(req.body.ids);
      return async.eachSeries(ids, function(id, callback) {
        return async.series([
          checkPermissions,
          submit
        ], callback);
        function checkPermissions(callback) {
          return self.apos.docs.find(req, { _id: id }, { _id: 1 }).workflowLocale(self.draftify(req.locale)).permission('edit').toObject(function(err, obj) {
            if (err) {
              return callback(err);
            }
            if (!obj) {
              return callback('not found');
            }
            return callback(null);
          });
        }
        function submit(callback) {
          var submitted = {
            username: req.user.username,
            name: req.user.title,
            email: req.user.email,
            when: new Date()
          };
          return self.apos.docs.db.update({ _id: id }, { $set: { workflowSubmitted: submitted } }, callback);
        }
      }, function(err) {
        if (err) {
          console.error(err);
          res.send({ status: 'error' });
        }
        return res.send({ status: 'ok' });
      });
    });
    
    self.route('post', 'manage-modal', function(req, res) {
      if (!req.user) {
        // Confusion to the enemy
        return res.status(404).send('not found');
      }
      return self.getSubmitted(req, {}, function(err, submitted) {
        return res.send(self.render(req, 'manage-modal.html', { submitted: submitted }));
      });
    });

    self.route('post', 'history-modal', function(req, res) {
      if (!req.user) {
        // Confusion to the enemy
        return res.status(404).send('not found');
      }
      var id = self.apos.launder.id(req.body.id);
      return self.getDocAndCommits(req, id, function(err, doc, commits) {
        if (err) {
          console.error(err);
          return res.status(500).send('error');
        }
        console.log(commits);
        return res.send(self.render(req, 'history-modal.html', { commits: commits, doc: doc }));
      });
    });

    self.route('post', 'locale-picker-modal', function(req, res) {
      if (!req.user) {
        // Confusion to the enemy
        return res.status(404).send('not found');
      }
      var workflowGuid = self.apos.launder.id(req.body.workflowGuid);
      return self.getLocalizations(req, workflowGuid, function(err, localizations) {
        if (err) {
          console.error(err);
          res.status(500).send('error');
        }
        return res.send(self.render(req, 'locale-picker-modal.html', { localizations: localizations, nestedLocales: self.nestedLocales }));
      });
    });

    self.route('post', 'commit-modal', function(req, res) {
      if (!req.user) {
        // Confusion to the enemy
        return res.status(404).send('not found');
      }
      var id = self.apos.launder.id(req.body.id);
      // We get both the same way the commit route does, for the sake of the permissions check,
      // so it doesn't initially appear that someone can be sneaky (although they can't really)
      return self.getDraftAndLive(req, id, function(err, draft, live) {
        if (err) {
          console.error(err);
          return res.status(500).send('error');
        }
        return res.send(self.render(req, 'commit-modal.html', { doc: draft }));
      });
    });

    self.route('post', 'export-modal', function(req, res) {
      if (!req.user) {
        // Confusion to the enemy
        return res.status(404).send('not found');
      }
      var id = self.apos.launder.id(req.body.id);
      // We get both the same way the commit route does, for the sake of the permissions check,
      // so it doesn't initially appear that someone can be sneaky (although they can't really)
      return self.db.findOne({ _id: id }, function(err, commit) {
        if (err) {
          console.error(err);
          return res.status(500).send('error');
        }
        if (!commit) {
          return res.send({ status: 'notfound' });
        }
        return res.send(self.render(req, 'export-modal.html', { commit: commit, nestedLocales: self.nestedLocales }));
      });
    });
    
    self.route('post', 'diff', function(req, res) {

      if (!req.user) {
        // Confusion to the enemy
        return res.status(404).send('not found');
      }

      var id = self.apos.launder.id(req.body.id);
      var draft, live;

      return async.series([
        getDraftAndLive,
        // Resolve the joins in the live doc to point to the draft's docs, so we don't get false
        // positives for changes in the diff. THIS IS RIGHT FOR VISUAL DIFF, WOULD BE VERY WRONG
        // FOR APPLYING DIFF, for that we go in the opposite direction
        resolveRelationships
      ], function(err) {

        if (err) {
          console.error(err);
          return res.send({ status: 'error' });
        }

        self.deleteExcludedProperties(live);
        self.deleteExcludedProperties(draft);

        return res.send({
          status: 'ok',
          diff: diff.diff(
            live, draft
          )
        });
        
      });

      function getDraftAndLive(callback) {
        return self.getDraftAndLive(req, id, function(err, _draft, _live) {
          if (err) {
            return callback(err);
          }
          live = self.apos.utils.clonePermanent(_live);
          draft = self.apos.utils.clonePermanent(_draft);
          return callback(null);
        });
      }
      
      function resolveRelationships(callback) {
        // We're going in this direction for visual diff ONLY
        return self.resolveRelationships(req, live, draft.workflowLocale, callback);
      }

    });
    
    self.draftify = function(locale) {
      if (locale.match(/\-draft$/)) {
        return locale;
      } else {
        return locale + '-draft';
      }
    };

    self.getCreateSingletonOptions = function(req) {
      return {
        action: self.action,
        contextGuid: req.data.workflow.context && req.data.workflow.context.workflowGuid,
        locales: self.locales,
        nestedLocales: self.nestedLocales
      };
    };

    self.pushAssets = function() {
      self.pushAsset('script', 'user', { when: 'user' });
      self.pushAsset('script', 'manage-modal', { when: 'user' });
      self.pushAsset('script', 'commit-modal', { when: 'user' });
      self.pushAsset('script', 'export-modal', { when: 'user' });
      self.pushAsset('script', 'history-modal', { when: 'user' });
      self.pushAsset('script', 'locale-picker-modal', { when: 'user' });
      self.pushAsset('script', 'pieces-editor-modal', { when: 'user' });
      self.pushAsset('script', 'pages-editor-modal', { when: 'user' });
      self.pushAsset('script', 'schemas', { when: 'user' });
      self.pushAsset('stylesheet', 'user', { when: 'user' });
    };

    self.addToAdminBar = function() {
      self.apos.adminBar.add(self.__meta.name + '-locale-picker-modal', 'Locales');
      self.apos.adminBar.add(self.__meta.name + '-manage-modal', 'Submissions');
      self.apos.adminBar.group({
        label: 'Workflow',
        items: [ self.__meta.name + '-locale-picker-modal', self.__meta.name + '-manage-modal' ]
      });
    };
    
    self.pageBeforeSend = function(req) {
      if (req.user && (req.session.workflowMode === 'live')) {
        req.disableEditing = true;
        self.apos.templates.addBodyClass(req, 'apos-workflow-live-page');
      }

      req.data.workflow = req.data.workflow || {};
      _.assign(req.data.workflow, _.pick(self, 'locale', 'nestedLocales'));
      var context = self.getContext(req);
      if (context && context.workflowGuid) {
        req.data.workflow.context = context;
      }
      req.data.workflow.locale = req.locale.replace(/\-draft$/, '');

      // Invoke pushCreateSingleton after we have all this groovy information,
      // so we get options.localizations on the browser side to power the
      // locale picker modal
      if (req.user) {
        self.pushCreateSingleton(req);
        if (req.query.workflowPreview) {
          req.disableEditing = true;
          var id = self.apos.launder.id(req.query.workflowPreview);
          self.apos.templates.addBodyClass(req, 'apos-workflow-preview-page');
          req.browserCall('apos.modules["apostrophe-workflow"].enablePreviewIframe(?)', id);
        }
      }

    };
    
    self.getLocalizations = function(req, workflowGuid, callback) {
      // Get the URLs of the context doc across locales for the locale switcher,
      // using a conservative projection for speed
      var criteria = {
        workflowGuid: workflowGuid
      };
      // Are we interested in other draft locales, or other live locales?
      if (req.locale.match(/\-draft$/)) {
        criteria.workflowLocale = /\-draft$/;
      } else {
        criteria.workflowLocale = { $not: /\-draft$/ };
      }
      return self.apos.docs.find(req, criteria, self.getContextProjection()).workflowLocale(null).published(null).toArray(function(err, docs) {
        if (err) {
          return callback(err);
        }
        var localizations = {};
        _.each(docs, function(doc) {
          localizations[doc.workflowLocale] = doc;
        });
        return callback(null, localizations);
      });
    };
    
    self.getContext = function(req) {
      return req.data.piece || req.data.page;      
    };
    
    self.getContextProjection = function() {
      return {
        title: 1,
        slug: 1,
        path: 1,
        workflowLocale: 1,
        tags: 1
      };
    };

    // Render the contextual action buttons — draft/live, submit and commit.
    // These stay hidden until JavaScript on the browser side detects at least
    // one editable area is present

    self.menu = function(req) {
      if (!req.user) {
        return '';
      }
      return self.partial('menu', { workflowMode: req.session.workflowMode });
    };
    
    // "Based on `req`, `moved`, `data.oldParent` and `data.parent`, decide whether
    // this move should be permitted. If it should not be, report an error." The `apostrophe-pages`
    // module did this already, but we must consider the impact on all locales. 

    self.pageMovePermissions = function(req, moved, data, options, callback) {
      if (!moved.workflowGuid) {
        // No localization for pages. That's unusual but allowed
        return callback(null);
      }
      // Grab the pages of interest across all locales other than the original (already checked)
      return self.apos.docs.find(req, {
        workflowGuid: { $in: [ moved.workflowGuid, data.oldParent.workflowGuid, data.parent.workflowGuid ] },
        workflowLocale: { $ne: moved.workflowLocale }
      }).joins(false).areas(false).workflowLocale(null).permission(false).published(null).trash(null).toArray(function(err, pages) {
        if (err) {
          return callback(err);
        }
        var error = null;
        var locales = {};
        _.each(pages, function(page) {
          if (!locales[page.workflowLocale]) {
            locales[page.workflowLocale] = {};
          }
          if (page.workflowGuid === moved.workflowGuid) {
            locales[page.workflowLocale].moved = page;
          }
          // Parent does not always change, else statement is not appropriate here
          if (page.workflowGuid === data.parent.workflowGuid) {
            locales[page.workflowLocale].parent = page;
          }
          if (page.workflowGuid === data.oldParent.workflowGuid) {
            locales[page.workflowLocale].oldParent = page;
          }
        });
        _.each(locales, function(locale, name) {
          // Repeat the permissions check for every locale
          if (!locale.moved._publish) {
            error = new Error('forbidden');
            return false;
          }
          // You can always move a page into the trash. You can
          // also change the order of subpages if you can
          // edit the subpage you're moving. Otherwise you
          // must have edit permissions for the new parent page.
          if ((locale.oldParent._id !== locale.parent._id) && (locale.parent.type !== 'trash') && (!locale.parent._edit)) {
            error = new Error('forbidden');
            return false;
          }
        });
        return callback(error);
      });
    };
    
    // On the initial invocation of `apos.pages.move`, modify the criteria and filters
    // to ensure only the relevant locale is in play
    self.pageBeforeMove = function(req, moved, target, position, options) {
      if (options.workflowRecursing) {
        return;
      }
      if (moved.workflowLocale) {
        options.criteria = _.assign({}, options.criteria || {}, { workflowLocale: moved.workflowLocale });
        options.filters = _.assign({}, options.filters || {}, { workflowLocale: moved.workflowLocale });
      }
    };

    // After a page is moved in one locale, with all of the ripple effects that go with it,
    // make the same move in all other locales. Note that we already verified we have permissions
    // across all locales.

    self.pageAfterMove = function(req, moved, info, callback) {
      if (info.options.workflowRecursing) {
        return callback(null);
      }
      var ids = _.pluck(info.changed || [], '_id');
      if (!moved.workflowGuid) {
        return callback(null);
      }
      var locales = {};
      return async.series([
        get,
        invoke
      ], function(err) {
        return callback(err);
      });
      function get(callback) {
        // Locate the doc moved and the doc it is moved relative to (target) in all locales other than
        // the original one
        return self.apos.docs.db.find({ workflowGuid: { $in: [ moved.workflowGuid, info.target.workflowGuid ] }, workflowLocale: { $ne: moved.workflowLocale } }, { workflowGuid: 1, _id: 1, workflowLocale: 1 }).toArray(function(err, docs) {
          if (err) {
            return callback(err);
          }
          _.each(docs, function(doc) {
            locales[doc.workflowLocale] = locales[doc.workflowLocale] || {};
            if (doc.workflowGuid === moved.workflowGuid) {
              locales[doc.workflowLocale].movedId = doc._id;
            }
            if (doc.workflowGuid === info.target.workflowGuid) {
              locales[doc.workflowLocale].targetId = doc._id;
            }
          });
          return callback(null);
        });
      }
      function invoke(callback) {
        // Reinvoke apos.pages.move 
        return async.eachSeries(_.keys(locales), function(locale, callback) {
          var _options = _.clone(info.options);
          _options.criteria = _.assign({}, info.options.criteria || {}, { workflowLocale: locale });
          _options.filters = _.assign({}, info.options.filters || {}, { workflowLocale: locale });
          _options.workflowRecursing = true;
          return self.apos.pages.move(req, locales[locale].movedId, locales[locale].targetId, info.position, _options, callback);
        }, callback);
      }
    };

    self.modulesReady = function(callback) {
      return self.ensureIndexes(callback);
    };
    
    self.ensureIndexes = function(callback) {
      return self.apos.docs.db.ensureIndex({ workflowGuid: 1 }, {}, callback);
    };
    
    self.loginDeserialize = function(user) {
      user._permissionsLocales = {};
      _.each(user._groups, function(group) {
        _.merge(user._permissionsLocales, group.permissionsLocales || {});
      });
    };
    
    // Record the commit permanently in a MongoDB collection for later
    // examination or application as a patch to more locales. Include enough
    // information to make this useful even if the original documents
    // are gone/modified/etc.
    //
    // On success the callback receives `(null, _id)` where `_id` is
    // the unique identifier for this specific commit in the collection.
    
    self.insertCommit = function(req, from, to, callback) {
      var _id = self.apos.utils.generateId();
      return self.db.insert({
        _id: _id,
        locale: to.workflowLocale,
        workflowGuid: to.workflowGuid,
        fromId: from._id,
        toId: to._id,
        from: self.apos.utils.clonePermanent(from),
        to: self.apos.utils.clonePermanent(to),
        user: _.pick(req.user || {}, 'username', 'title', '_id'),
        createdAt: new Date()
      }, function(err) {
        if (err) {
          return callback(err);
        }
        return callback(null, _id);
      });
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

  }
};
