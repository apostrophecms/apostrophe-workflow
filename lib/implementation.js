var _ = require('lodash');
var async = require('async');

module.exports = function(self, options) {
  self.composeLocales = function() {
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
        draftLocale.name = draftLocale.name + '-draft';
        draftLocale.private = true;
        delete draftLocale.children;
        newLocales[draftLocale.name] = draftLocale;
      });
      self.locales = newLocales;
    }
    
    self.defaultLocale = options.defaultLocale || 'default';
    
    if (self.options.prefixes) {
      _.each(self.locales, function(locale, name) {
        if (name !== self.apos.utils.slugify(name)) {
          throw new Error('apostrophe-workflow: if the "prefixes" option is in use, then locale names must be slugs (hyphens not underscores; letters must be lowercase; no other punctuation).')
        }
      });
    }
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
      'editGroupsRemovedIds'
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
      if (!doc.workflowLocale.match(/\-draft$/)) {
        // Always create the draft first, so we can then find it by id successfully
        // via code that is overridden to look for drafts. All the locales get created
        // but we want to return the draft's _id
        doc.workflowLocale = self.draftify(doc.workflowLocale);
      }
      doc.workflowGuid = self.apos.utils.generateId();
      doc._workflowNew = true;
      self.ensureWorkflowLocaleForPathIndex(doc);
    }
  };
  
  // Adjust the slug of a page to take the prefix into account.
  // The UI and/or `pages.newChild` should have done this already, this
  // is a failsafe invoked by `docBeforeSave` and also in tasks.
  //
  // If the document is not a page, or has no locale, nothing happens.
  
  self.ensurePageSlugPrefix = function(doc) {
    if (!(self.options.prefixes && self.apos.pages.isPage(doc) && doc.workflowLocale)) {
      return;
    }
    var prefix, matches;
    // Match the first component of the URL
    matches = doc.slug && doc.slug.match(/^\/([^\/]+)/);
    if (!matches) {
      // No first component or no slug at all
      doc.slug = '/' + self.liveify(doc.workflowLocale) + (doc.slug || '/' + self.apos.utils.slugify(doc.title));
    } else {
      existing = matches[1];
      if (_.has(self.locales, existing)) {
        // There is an existing locale prefix that doesn't match the
        // doc locale, which seems unlikely, but fix it
        doc.slug = doc.slug.replace(/^\/([^\/]+)/, '/' + self.liveify(doc.workflowLocale));
      } else {
        // There is no existing locale prefix
        doc.slug = '/' + self.liveify(doc.workflowLocale) + doc.slug;
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
    widgets = _.filter(widgets, function(widget) {
      var schema = self.apos.areas.getWidgetManager(widget.type).schema;
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
        return { doc: doc, field: field, value: doc[field.name] };
      }
    );
  };

  self.getCreateSingletonOptions = function(req) {
    return {
      action: self.action,
      contextGuid: req.data.workflow.context && req.data.workflow.context.workflowGuid,
      locales: self.locales,
      locale: req.locale,
      nestedLocales: self.nestedLocales,
      prefixes: self.options.prefixes
    };
  };

  self.addToAdminBar = function() {
    self.apos.adminBar.add(self.__meta.name + '-locale-picker-modal', 'Locales');
    self.apos.adminBar.add(self.__meta.name + '-manage-modal', 'Submissions');
    self.apos.adminBar.group({
      label: 'Workflow',
      items: [ self.__meta.name + '-locale-picker-modal', self.__meta.name + '-manage-modal' ]
    });
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

  self.modulesReady = function(callback) {
    return self.ensureIndexes(callback);
  };
  
  self.ensureIndexes = function(callback) {
    return self.apos.docs.db.ensureIndex({ workflowGuid: 1 }, {}, callback);
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
    return stem = stem.join('.');
  };

  // Given a dot path like a.b.5, return
  // 5 as a number (not as a string)
  self.getIndex = function(dotPath) {
    var stem = dotPath.split(/\./);
    return parseInt(stem[stem.length - 1]);
  };
                        
};
