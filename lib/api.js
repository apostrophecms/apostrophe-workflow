var _ = require('lodash');
var async = require('async');

module.exports = function(self, options) {
  
  // Resolve relationships between this doc and other docs, which need to be
  // mapped to the appropriate doc in the new locale, via the workflowGuid
  // property of each doc.
  //
  // Existing join ids in `doc` are remapped to the corresponding ids in `toLocale`.
  //
  // This method DOES NOT save the modified doc object to the database.
  //
  // This method is useful in implementing diff algorithms because it ensures
  // ids refer to the same locale.

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

      joins = self.findJoinsInDoc(doc);

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
  //
  // `id` may be the `_id` of either the draft or the live version of the doc.
  //
  // If `options.permission` is explicitly set to false, permissions are not
  // checked when fetching the docs.
  
  self.getDraftAndLive = function(req, id, options, callback) {
    var draft;
    var live;
    return async.series([
      getOne,
      getTwo
    ], function(err) {
      if (err) {
        return callback(err);
      }
      return callback(null, draft, live);
    });
    function getOne(callback) {
      return self.apos.docs.find(req, { _id: id }).permission((options.permission === false) ? false : 'edit').published(null).trash(null).workflowLocale(null).toObject(function(err, _one) {
        if (err) {
          return callback(err);
        }
        if (!_one) {
          return callback('notfound');
        }
        if (_one.workflowLocale && _one.workflowLocale.match(/\-draft$/)) {
          draft = _one;
        } else {
          live = _one;
        }
        return callback(null);
      });
    }
    function getTwo(callback) {
      return self.apos.docs.find(req, { workflowGuid: (draft || live).workflowGuid })
      .trash(null)
      .workflowLocale(draft ? self.liveify(draft.workflowLocale) : self.draftify(live.workflowLocale))
      .permission((options.permission === false) ? false : 'edit')
      .published(null)
      .toObject(function(err, _two) {
        if (err) {
          return callback(err);
        }
        if (!_two) {
          return callback(live ? 'draft not found' : 'live not found');
        }
        if (draft) {
          live = _two;
        } else {
          draft = _two;
        }
        return callback(null);
      });
    }      
  };
          
  // Delete properties of doc that are not considered
  // relevant to workflow.
  
  self.deleteExcludedProperties = function(doc) {
    // console.log('before delete:');
    // console.log(JSON.stringify(doc, null, '  '));
    _.each(doc, function(val, key) {
      if (!self.includeProperty(key)) {
        delete doc[key];
      }
    });
    // console.log('after delete:');
    // console.log(JSON.stringify(doc, null, '  '));
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
    return self.apos.docs.find(req, criteria, self.getSubmittedProjection()).sort({ $exists: 1 }).trash(null).published(null).toArray(callback);
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
      tags: 1,
      workflowSubmitted: 1
    };
  };
  
  // Returns a cursor suitable for finding docs for editing purposes,
  // even if they are in the trash or unpublished, without regard to locale.
  // Areas and joins are not loaded.
  
  self.findDocForEditing = function(req, docId, callback) {
    self.apos.docs.find(req, { _id: docId }).permission('edit').trash(null).published(null).workflowLocale(null).areas(false).joins(false).toObject(callback);
  };
  
  // Fetch a draft doc along with all of the past commits in which it is the source ("fromId").
  //
  // On success, invokes callback with `(null, doc, commits)` where `commits` is an array.
  //
  // If the doc cannot be fetched for editing by this req, a `notfound` error is reported.

  self.findDocAndCommits = function(req, docId, callback) {
    return self.findDocForEditing(req, docId, function(err, doc) {
      if (err) {
        return callback(err);
      }
      if (!doc) {
        return callback('notfound');
      }
      var criteria = { fromId: docId };
      var cursor = self.db.find(criteria).sort({ createdAt: -1 });
      return cursor.toArray(function(err, commits) {
        if (err) {
          return callback(err);
        }
        return callback(null, doc, commits);
      });
    });
  };

  // Fetch a commit, along with the draft doc that was the source of it. On success, invokes callback with
  // `(null, commit, doc)`. If the doc cannot be fetched for editing by this req,
  // or no commit is found, a `notfound` error is reported.
  //
  // Here we take a `commitId` rather than a `docId` because a doc may have many
  // commits and we want just one.
  //
  // Hint: any time you want to fetch a commit, but also want to check permissions, use this method
  // rather than just pulling the commit from the collection directly.

  self.findDocAndCommit = function(req, commitId, callback) {
    var commit, doc;
    return async.series([
      getCommit,
      getDoc
    ], function(err) {
      return callback(err, doc, commit);
    });

    function getCommit(callback) {
      return self.db.findOne({ _id: commitId }, function(err, _commit) {
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
    
    function getDoc(callback) {
      return self.findDocForEditing(req, commit.fromId, function(err, _doc) {
        if (err) {
          return callback(err);
        }
        doc = _doc;
        if (!doc) {
          return callback('notfound');
        }
        return callback(null);
      });
    }

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

  // Get hostname:port string for current request.
  // Used by the subdomain-based locale picker

  self.getHost = function(req) {
    return req.get('Host') || '';
  };

  // Given "before" and "after" versions of a document
  // typically (live vs. draft), deliver `(null, fields)`
  // to the callback, where `fields` is an array of
  // schema field names that have been modified.
  
  self.getModifiedFields = function(req, before, after, callback) {
    return self.resolveRelationships(req, before, after.workflowLocale, function(err) {
      if (err) {
        return callback(err);
      }
      before = _.cloneDeep(before);
      after = _.cloneDeep(after);
      self.deleteExcludedProperties(before);
      self.deleteExcludedProperties(after);
      var schema = self.apos.docs.getManager(after.type).schema;
      var modifiedFields = [];
      _.each(schema, function(field) {
        // TODO a more sustainable way of handling new field types where
        // the prop name and the field name differ. Can we get the
        // versions module to help?
        var prop = field.idField || field.idsField || field.name;
        // Prevent false positives for booleans that are undefined vs. false
        if (!before[prop]) {
          if (field.type === 'tags') {
            before[prop] = [];
          } else {
            before[prop] = false;
          }
        }
        if (!after[prop]) {
          if (field.type === 'tags') {
            after[prop] = [];
          } else {
            after[prop] = false;
          }
        }
        if (!_.isEqual(before[prop], after[prop])) {
          modifiedFields.push(field.label);
        }
      });
      if (before.type !== after.type) {
        modifiedFields.push('Type');
      }
      return callback(null, modifiedFields);
    });
  };
      
  self.draftify = function(locale) {
    if (locale.match(/\-draft$/)) {
      return locale;
    } else {
      return locale + '-draft';
    }
  };

  self.liveify = function(locale) {
    return locale.replace(/\-draft$/, '');
  };

  // Return an object ready for use as the `workflowSubmitted`
  // property of a doc. If `data` is provided, any properties of
  // `data` are added to the object.
  
  self.getWorkflowSubmittedProperty = function(req, data) {
    return _.assign({
      username: req.user.username,
      name: req.user.title,
      email: req.user.email,
      when: new Date()
    }, data || {});
  };

  // Given an array of doc ids, deliver `(null, modified, unmodified, committable)`
  // to the callback. `modified` is an array consisting of the
  // docs that have been modified. `unmodified` is an array
  // consisting of the docs that have not been modified.
  // And `committable` consists of the docs that the current user
  // can commit (they have edit access to the corresponding live versions).
  //
  // Any doc ids not editable by the current user are not included
  // at all in the response.
  //
  // If options.related is true, editable doc ids related to those
  // provided via joins or widgets are also included in the response.
  //
  // The ids modified may be draft or live. The returned ids are
  // always draft.

  self.getEditable = function(req, ids, options, callback) {

    var related = [];
    var liveVersions = {};
    var relatedModified = [];
    var relatedUnmodified = [];

    return async.series([
      getKnown,
      getJoined,
      diff
    ], function(err) {
      if (err) {
        return callback(err);
      }
      relatedModified = filter(relatedModified);
      relatedUnmodified = filter(relatedUnmodified);
      var byId = {};
      var committable = [];
      _.each(relatedModified.concat(relatedUnmodified), function(doc) {
        if (_.has(liveVersions, doc._id)) {
          if (liveVersions[doc._id]._edit) {
            committable.push(doc);
          }
        }
      });
      return callback(null, relatedModified, relatedUnmodified, committable);
      function filter(docs) {
        return _.filter(docs, { _edit: true });
      }
    });

    function getKnown(callback) {
      related = [];
      return async.eachSeries(ids, function(id, callback) {
        return self.getDraftAndLive(req, id, { permission: false }, function(err, draft, live) {
          if (err) {
            return callback(err);
          }
          // console.log(draft, live);
          related.push(draft);
          liveVersions[draft.workflowGuid] = live;
          return callback(null);
        });
      }, callback);
    }

    function getJoined(callback) {
      if (!options.related) {
        return callback(null);
      }
      var _related = _.clone(related);
      _.each(_related, function(draft) {
        // Also add anything that's joined into the primary doc
        var joins = self.findJoinsInDoc(draft);
        _.each(joins, function(join) {
          if (join.field.type === 'joinByOne') {
            if (join.value) {
              related.push(join.value);
            }
          } else if (join.field.type.match(/^join/)) {
            related = related.concat(join.value || []);
          }
        });
      });
      return callback(null);
    }
      
    // Some were fetched fully, others are just join projections of a doc.
    // Get the full thing, and also the live version, so we can compare,
    // and build a new array of the full draft docs, with `_modified`
    // properties added where appropriate.
    //
    // Also, a join result might be an object with `item` and `relationship`
    // properties. Flatten that out so we just have an array of docs.

    function diff(callback) {
      return async.eachSeries(related, function(doc, callback) {
        var draft, live;
        return async.series([
          getDraftAndLive,
          resolveRelationships
        ], function(err) {
          if (err) {
            return callback(err);
          }
          var _draft = self.apos.utils.clonePermanent(draft);
          var _live = self.apos.utils.clonePermanent(live);
          self.deleteExcludedProperties(_draft);
          self.deleteExcludedProperties(_live);
          if (!_.isEqual(_draft, _live)) {
            relatedModified.push(draft);
          } else {
            relatedUnmodified.push(draft);
          }
          return callback(null);
        });
                   
        function getDraftAndLive(callback) {
          live = liveVersions[doc._id];
          if (live) {
            // Already fetched it in the "known" pass
            draft = doc;
            return callback(null);
          }
          return self.getDraftAndLive(req, doc._id || doc.item._id, { permission: false }, function(err, _draft, _live) {
            if (err) {
              return callback(err);
            }
            draft = _draft;
            live = _live;
            liveVersions[draft._id] = live;
            return callback(null);
          });
        }
        
        function resolveRelationships(callback) {
          self.resolveRelationships(req, draft, live.workflowLocale, callback); 
        }
      }, callback);
    }
  };
  
  // Fetch joins, load areas, etc. on a doc object that came out of the
  // commits collection. Used for previewing

  self.after = function(req, doc, callback) {
    var manager = self.apos.docs.getManager(doc.type);
    if (!manager) {
      return callback('no manager');
    }
    return manager.find(req).after([ doc ], callback);      
  };

  // Get the URLs of the context doc across locales for the locale switcher,
  // using a conservative projection for speed

  self.getLocalizations = function(req, workflowGuid, draft, callback) {
    var criteria = {
      workflowGuid: workflowGuid
    };
    // Are we interested in draft locales, or live locales?
    if (draft) {
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
        doc.label = self.locales[doc.workflowLocale] && self.locales[doc.workflowLocale].label;
        localizations[doc.workflowLocale] = doc;
      });
      return callback(null, localizations);
    });
  };
  
  // Returns the doc that is logically thought of as
  // the "context" for the current page rendering, i.e.
  // a piece if on a show page, a page otherwise

  self.getContext = function(req) {
    return req.data.piece || req.data.page;      
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
  
  self.enableHelpers = function() {
    self.addHelpers({
      localizations: function() {
        var localizations = [];
        _.each(self.apos.templates.contextReq.data.workflow.localizations, function(localization, locale) {
          if (!self.locales[locale].private) {
            localizations.push(localization);
          }
        });
        return localizations;
      }
    });
  };

};
