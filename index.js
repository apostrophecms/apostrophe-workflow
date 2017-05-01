var async = require('async');
var _ = require('lodash');

module.exports = {

  // ## Options
  // 
  // `includeTypes: [ 'my-blog-post', 'my-event' ]`
  // 
  // Apply workflow only to docs of the specified types.
  // 
  // `excludeTypes: [ 'my-personal-profile' ]`
  // 
  // Apply workflow to everything EXCEPT the specified types.
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
  // A list of properties that should not be subject to workflow. These are typically properties
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

  afterConstruct: function(self) {
    self.extendCursor();
    self.extendIndexes();
    self.enableHelpers();
    self.enableAddMissingLocalesTask();
    self.pushAssets();
    self.enableSingleton();
    self.addToAdminBar();
  },

  construct: function(self, options) {

    self.locales = options.locales || {
      'default': {
      },
      'default-draft': {
      }
    };
    
    self.defaultLocale = options.defaultLocale || 'default';

    self.baseExcludeProperties = options.baseExcludeProperties || [ '_id', 'slug', 'path', 'rank', 'docPermissions', 'published' ];

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
    
    // Extend the index parameters for the unique indexes on path and slug to allow for
    // two docs with the same slug in different locales

    self.extendIndexes = function() {
      self.apos.on('slugIndex', function(params) {
        params.workflowLocale = 1;
      });
      self.apos.on('pathIndex', function(params) {
        params.workflowLocale = 1;
      });
    };

    // Every time a doc is saved, check whether its type is included in workflow. If it is,
    // and the doc does not yet have a `workflowLocale` property, establish one and generate
    // the `workflowGuid` property. Set the `_workflowNew` flag for the attention of
    // `docAfterSave`.

    self.docBeforeSave = function(req, doc, options, callback) {
      if (doc._workflowPropagating) {
        // Recursion guard
        return callback(null);
      }
      if (!self.includeType(doc.type)) {
        return callback(null);
      }
      if (!doc.workflowLocale) {
        doc.workflowLocale = req.locale || self.defaultLocale;
        doc.workflowGuid = self.apos.utils.generateId();
        doc._workflowNew = true;
      }
      return callback(null);
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
        insertInMissingLocales
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
          return async.series([
            _.partial(self.resolveRelationships, req, _doc),
            insert
          ], callback);

          _doc.published = false;

          function insert(callback) {
            // TODO: copy attachments so they are not directly shared resulting in cross-locale modification
            return self.apos.docs.insert(req, _doc, { permissions: false }, function(err) {
              return callback(err);
            });
          }

        }, callback);
      }
    };
    
    // Resolve relationships between this doc and other docs which need to be
    // mapped to the appropriate doc in the new locale. For instance, joins must
    // point to the right id for the corresponding doc in the new locale

    self.resolveRelationships = function(req, doc, callback) {

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
              return self.apos.docs.db.find({ _id: { $in: join.doc[join.field.idField] } }, { workflowGuid: 1 }).toArray(function(err, docs) {
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
              return self.apos.docs.db.find({ _id: { $in: join.doc[join.field.idsField] } }, { workflowGuid: 1 }).toArray(function(err, docs) {
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
            return self.apos.docs.db.find({ workflowGuid: { $in: workflowGuids }, workflowLocale: doc.workflowLocale }, { _id: 1 }).toArray(function(err, docs) {
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
              join.doc[join.field.idsField] = secondLocaleIds;
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
    // be the doc as found in each of the locales.

    self.commit = function(req, from, to, callback) {
      
      delete from.workflowSubmitted;
      return async.series([
        _.partial(self.copyIncludedProperties, from, to),
        _.partial(self.resolveRelationships, req, to),
        _.partial(self.apos.docs.getManager(to.type).update, req, to)
      ], callback);

    };
    
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
        if (key.match(/^_?workflow/)) {
          return;
        }
        if (_.contains(self.excludeProperties, key)) {
          return;
        }
        // TODO deal with copying attachments rather than referencing
        // the same file, however take care not to do it if there is no change
        to[key] = val;
      });
      
      return setImmediate(callback);
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
      return self.apos.docs.find(req, criteria, self.getSubmittedProjection()).sort({ $exists: 1 }).workflowLocale(false).toArray(callback);
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
    
    // Decide whether a doc type is subject to workflow as documented for the module options.

    self.includeType = function(type) {
      if (self.includeTypes) {
        if (!_.contains(self.includeTypes, type)) {
          return false;
        }
      }
      if (self.excludeTypes) {
        return !_.contains(self.excludeTypes, type);
      }
    };
    
    // Set `req.locale` based on `req.query.locale` or `req.session.locale`.
    // If the locale is not present or is not valid, set `req.locale` to the
    // default locale. Store the locale in `req.session.locale`. TODO: also
    // implement subdomains and URL prefixes for locales.

    self.expressMiddleware = {
      before: 'apostrophe-global',
      middleware: function(req, res, next) {
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
    
    self.menu = function() {
      var req = self.apos.templates.contextReq;
      if (req.user && req.data.page && self.apos.permissions.can(req, 'edit', req.data.page)) {
        return self.partial('menu', { workflowMode: req.session.workflowMode });
      }
    };
    
    self.enableHelpers = function() {
      self.addHelpers({
        menu: self.menu
      });
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
          return self.apos.docs.db.ensureIndex({ path: 1, workflowLocale: 1 }, { unique: true }, callback);
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
            return index.path && (!index.workflowLocale);
          });
          if (!existing) {
            return callback(null);
          }
          return self.apos.docs.db.dropIndex(existing.name, callback);
        }
      }
      
      function noLocales(callback) {
        return self.apos.migrations.eachDoc({ workflowLocale: { $exists: 0 } }, function(doc, callback) {
          if (!self.includeType(doc)) {
            return setImmediate(callback);
          }
          doc.workflowLocale = self.defaultLocale;
          doc.workflowGuid = self.apos.utils.generateId();
          return self.apos.docs.getManager(doc.type).update(req, doc, callback);
        }, callback);
      }
      
      function missingSomeLocales(callback) {
        return self.apos.migrations.eachDoc({ workflowLocale: self.defaultLocale }, function(doc, callback) {
          if (!self.includeType(doc)) {
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
        res.status(404).send('not found');
      }
      req.session.workflowMode = (req.body.mode === 'draft') ? 'draft' : 'live';
      return res.send({ status: 'ok' });
    });
    
    self.route('post', 'submit', function(req, res) {
      if (!req.user) {
        // Confusion to the enemy
        res.status(404).send('not found');
      }
      var ids = self.apos.launder.ids(req.body.ids);
      return async.eachSeries(ids, function(id, callback) {
        return async.series([
          checkPermissions,
          submit
        ], callback);
        function checkPermissions(callback) {
          return self.apos.docs.find(req, { _id: id }, { _id: 1 }).permission('edit').toObject(function(err, obj) {
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
    
    self.route('post', 'modal', function(req, res) {
      if (!req.user) {
        // Confusion to the enemy
        res.status(404).send('not found');
      }
      return self.getSubmitted(req, {}, function(err, submitted) {
        return res.send(self.render(req, 'modal.html', { submitted: submitted }));
      });
    });

    self.enableSingleton = function() {
      // The default options will include self.action, which is what self.api needs in browserland
      self.pushCreateSingleton();
    };

    self.pushAssets = function() {
      self.pushAsset('script', 'user', { when: 'user' });
      self.pushAsset('script', 'modal', { when: 'user' });
      self.pushAsset('stylesheet', 'user', { when: 'user' });
    };

    self.addToAdminBar = function() {
      self.apos.adminBar.add(self.__meta.name, 'Workflow');
    };
        
  }
};
