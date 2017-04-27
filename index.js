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
    self.addHelpers();
    self.enableAddMissingLocalesTask();
  },

  construct: function(self, options) {

    self.locales = options.locales || {
      'default': {
        slugPrefix: ''
      },
      'default-draft': {
        slugPrefix: ':default-draft'
      }
    };
    
    self.defaultLocale = options.defaultLocale || 'default';
    
    self.baseExcludeProperties = options.baseExcludeProperties || [ '_id', 'slug', 'path', 'rank', 'docPermissions' ];

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
        doc.workflowLocale = req.locale;
        doc.workflowGuid = self.apos.utils.generateId();
        doc._workflowNew = true;
        self.adjustSlug(doc);
      }
      return callback(null);
    };
    
    self.adjustSlug = function(doc) {
      // It's OK if it's not there yet...
      self.removeSlugPrefix(doc, doc.workflowLocale);
      // But it has to be there now
      self.addSlugPrefix(doc, doc.workflowLocale);
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
        console.log('sfml');
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
            return (locale !== doc.workflowLocale) && (_.contains(locales, doc.workflowLocale));
          });
          return callback(null);
        });
      }

      function insertInMissingLocales(callback) {
        console.log('siml');
        if (!missingLocales.length) {
          console.log('none missing');
          return callback(null);
        }
        // A new doc needs to be brought into existence across all locales
        console.log('across all...');
        return async.eachSeries(_.keys(self.locales), function(locale, callback) {
          console.log(locale);

          var _doc = self.apos.utils.clonePermanent(doc);
          if (locale === doc.workflowLocale) {
            console.log('it me');
            return setImmediate(callback);
          }
          console.log('not me: ', locale, doc.workflowLocale);
          delete _doc._workflowNew;
          delete _doc._id;
          self.removeSlugPrefix(_doc, _doc.workflowLocale);
          _doc.workflowLocale = locale;
          _doc._workflowPropagating = true;
          self.addSlugPrefix(_doc, _doc.workflowLocale);
          console.log('about to');
          return async.series([
            _.partial(self.resolveRelationships, req, _doc),
            insert
          ], callback);

          _doc.published = false;

          function insert(callback) {
            console.log('inserting');
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
        console.log('mapping joins');
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
            console.log('findWorkflowGuids');
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
            console.log('findSecondLocaleIds');
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

    self.addSlugPrefix = function(doc, locale) {
      var prefix = self.locales[locale].slugPrefix;
      if (!prefix) {
        return;
      }
      // Pagelike or piecelike?
      var slash = doc.slug.match(/^\//) ? '/' : '';
      doc.slug = slash + prefix + doc.slug;
      if (slash) {
        doc.path = '/' + prefix + doc.slug;
      }
    };

    self.removeSlugPrefix = function(doc, locale) {
      var prefix = self.locales[locale].slugPrefix;
      if (!prefix) {
        return;
      }
      var regexp = new RegExp('^/?' + self.apos.utils.regExpQuote(prefix || ''));
      doc.slug = doc.slug.replace(regexp, '') + doc.slug;
      if (typeof(doc.path) === 'string') {
        doc.path = doc.path.replace(regexp, '') + doc.path;
      }
    };

    // Commit a doc from one locale to another. `from` and `to` should
    // be the doc as found in each of the locales.

    self.commit = function(req, from, to, callback) {
      
      from.workflowSubmitted = false;
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
    
    // Mark a doc as submitted for approval.
    
    self.submit = function(req, doc, callback) {
      doc.workflowSubmitted = true;
      return self.apos.docs.getManager(doc.type).update(req, doc, callback);
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
      criteria = _.clone(criteria);
      criteria.workflowSubmitted = true;
      return self.apos.docs.find(req, criteria, self.getSubmittedProjection()).workflowLocale(false).toArray();
    };
    
    // Returns the projection to be used when fetching submitted docs to generate
    // a list of docs requiring approval.

    self.getSubmittedProjection = function() {
      return {
        title: 1,
        slug: 1,
        path: 1,
        rank: 1,
        type: 1
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
    // default locale. Store the locale in `req.session.locale` to allow
    // operation of sites that do not use a URL prefix to distinguish locales.
    //
    // If the locale's `slugPrefix` begins with `:`, it is only for uniqueness
    // in the database and not for display on the front end, so prepend it to
    // `req.url` so that its pages can be found via the normal page serving mechanism.

    self.expressMiddleware = function(req, res, next) {
      req.locale = req.query.locale || req.session.locale;
      if ((!req.locale) || (!_.has(self.locales, req.locale))) {
        req.locale = self.defaultLocale;
      }
      req.session.locale = req.locale;
      if (req.session.workflowMode === 'draft') {
        req.locale += '-draft';
      }
      var locale = self.locales[req.locale];
      if (locale.slugPrefix.match(/^:/)) {
        // A locale that is *not* distinguished by URL. The `workflowUrl`
        // cursor filter strips out its prefix systematically before URLs are rendered
        // on the front end.
        //
        // So to locate its docs via the standard page loading route we must prepend
        // its prefix to `req.url` at the middleware level
        req.url = '/' + locale.slugPrefix + req.url;
      }
      return next();
    };
    
    self.actions = function() {
      var req = self.apos.templates.contextReq;
      if (req.user && req.extras.page && self.apos.permissions.can('edit', req.extras.page)) {
        return self.partial('actions', { session: req.session });
      }
    };
    
    self.addHelpers({
      actions: self.actions
    });
    
    self.enableAddMissingLocalesTask = function() {
      self.apos.tasks.add(self.__meta.name, 'add-missing-locales',
        'Run this task after adding new locales or setting up the module for the first time.',
        self.addMissingLocalesTask
      );
    };

    self.addMissingLocalesTask = function(apos, argv, callback) {
      console.log('amlt');
      var req = self.apos.tasks.getReq();
      
      return async.series([
        noLocales,
        missingSomeLocales
      ], function(err) {
        console.log('done');
        console.log(err);
        return callback(err);
      });
      
      function noLocales(callback) {
        console.log('nl');
        return self.apos.migrations.eachDoc({ workflowLocale: { $exists: 0 } }, function(doc, callback) {
          if (!self.includeType(doc)) {
            return setImmediate(callback);
          }
          return self.apos.docs.db.update({ _id: doc._id }, {
            $set: {
              workflowGuid: self.apos.utils.generateId(),
              workflowLocale: self.defaultLocale
            }
          }, callback);
        }, callback);
      }
      
      function missingSomeLocales(callback) {
        console.log('msl');
        return self.apos.migrations.eachDoc({ workflowLocale: self.defaultLocale }, function(doc, callback) {
          if (!self.includeType(doc)) {
            return setImmediate(callback);
          }
          console.log('calling docAfterSave');
          return self.docAfterSave(req, doc, { permissions: false }, function(err) {
            console.log('after');
            return callback(err);
          });
        }, callback);
      }
    };

  }
};
