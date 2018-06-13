var _ = require('@sailshq/lodash');
var async = require('async');
var deep = require('deep-get-set');
var qs = require('qs');

var removeDotPathViaSplice = require('./removeDotPathViaSplice.js');

var diff = require('jsondiffpatch').create({
  objectHash: function(obj, index) {
    // try to find an id property, otherwise compare full JSON, which rules
    // out distinguishing content change from being an entirely new thing
    return obj._id || obj.id || JSON.stringify(obj);
  },
  textDiff: {
    // Don't try to diff text, replace it. Otherwise
    // patches are never applicable across locales
    minLength: 1000000000
  },
  arrays: {
    detectMove: true,
    // We don't actually copy the old value, however it is useful for the visual diff
    includeValueOnMove: true
  }
});

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

      var joins = self.findJoinsInDoc(doc);

      // Remapping these in parallel led to an unexplained race condition in
      // which some ids were null. -Tom
      return async.eachSeries(joins, function(join, callback) {

        // These variables must be scoped inside the iterator,
        // otherwise with eachLimit we can have race conditions
        var workflowGuidToOldId = {};
        var oldIdToNewId = {};
        var workflowGuids;
        var secondLocaleIds;

        if (!self.includeType(join.withType)) {
          // Type joined with is not subject to workflow
          return setImmediate(callback);
        }
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
          if (join.field.type === 'joinByOne') {
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
          if (join.field.type === 'joinByOne') {
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
            join.doc[join.field.idsField] = secondLocaleIds;
          }
        }

      }, callback);

    }

  };

  // Invokes resolveRelationships for all docs that have the
  // workflowResolveDeferred: true property, and removes the property.
  //
  // This is invoked by migration tasks as a second step after copying the docs
  // across locales, so that all of the joined documents actually exist in
  // the other locales before the resolver looks for them.

  self.resolveDeferredRelationships = function(callback) {
    var req = self.apos.tasks.getReq();
    return self.apos.migrations.eachDoc({ workflowResolveDeferred: true }, function(doc, callback) {
      if (!self.includeType(doc.type)) {
        return setImmediate(callback);
      }
      return async.series([
        resolveRelationships,
        update
      ], callback);

      function resolveRelationships(callback) {
        return self.resolveRelationships(req, doc, doc.workflowLocale, callback);
      }

      function update(callback) {
        delete doc.workflowResolveDeferred;
        return self.apos.docs.db.update({ _id: doc._id }, doc, callback);
      }
    }, callback);
  };

  // You probably want `commitLatest`.
  //
  // Commit a doc from one locale to another. `from` and `to` should
  // be the doc as found in each of the locales. The callback receives
  // `(null, commitId)` where `commitId` is a unique identifier for
  // this specific commit.

  self.commit = function(req, from, to, callback) {
    var commitId;
    // For storage in the commits collection
    var originalTo = self.apos.utils.clonePermanent(to);
    // Otherwise modified somehow by the resolveRelationships step even though
    // from is not passed to it, possibly join-related?
    var originalFrom = self.apos.utils.clonePermanent(from);
    return async.series([
      // Resolve the relationships for originalTo as well so we can straightforwardly
      // call diff() later
      _.partial(self.resolveRelationships, req, originalTo, to.workflowLocale),
      _.partial(self.copyIncludedProperties, req, from, to),
      _.partial(self.deleteObsoleteAreas, req, from, to),
      _.partial(self.resolveRelationships, req, to, to.workflowLocale),
      insertCommit,
      _.partial(self.apos.docs.update, req, to),
      clearSubmitted
    ], function(err) {
      return callback(err, commitId);
    });
    function insertCommit(callback) {
      return self.insertCommit(req, originalFrom, originalTo, function(err, _commitId) {
        if (err) {
          return callback(err);
        }
        commitId = _commitId;
        return callback(null);
      });
    }
    function clearSubmitted(callback) {
      return self.apos.docs.db.update({
        _id: from._id
      }, {
        $unset: {
          workflowSubmitted: 1
        }
      }, callback);
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
  //
  // By default, areas and joins are fully loaded. To disable that,
  // set `options.areas` and `options.joins` to `false`.

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
      // Do not use .permission here, it is too conservative, check ._edit. -Tom
      return self.findDocs(req, { _id: id }).areas((options.areas === undefined) ? true : options.areas).joins((options.joins === undefined) ? true : options.joins).toObject(function(err, _one) {
        if (err) {
          return callback(err);
        }
        if (!_one) {
          return callback('notfound');
        }
        if ((options.permission !== false) && !_one._edit) {
          return callback('notfound');
        }
        if (_one.workflowLocale && _one.workflowLocale.match(/-draft$/)) {
          draft = _one;
        } else {
          live = _one;
        }
        return callback(null);
      });
    }
    function getTwo(callback) {
      var locale = draft ? self.liveify(draft.workflowLocale) : self.draftify(live.workflowLocale);
      return self.findDocs(req, { workflowGuid: (draft || live).workflowGuid }, locale).areas(true).joins(true).toObject(function(err, _two) {
        if (err) {
          return callback(err);
        }
        if (!_two) {
          return callback('notfound');
        }
        if ((options.permission !== false) && !_two._edit) {
          return callback('notfound');
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

  // Delete top-level area properties of `to` that do not exist
  // in `from`, unless they are explicitly excluded from workflow.
  //
  // This method does not touch the database, that is up to you.

  self.deleteObsoleteAreas = function(req, from, to, callback) {
    var toDelete = [];
    _.each(to, function(val, key) {
      if (!self.includeProperty(key)) {
        return;
      }
      if (val && (val.type === 'area')) {
        if (!_.has(from, key)) {
          toDelete.push(key);
        }
      }
    });
    _.each(toDelete, function(key) {
      delete to[key];
    });
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
    return self.apos.docs.find(req, criteria, self.getSubmittedProjection()).sort({ 'workflowSubmitted.when': -1 }).trash(null).published(null).toArray(callback);
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

  // Returns a cursor to find docs even if they are in the trash or
  // unpublished, without regard to locale (except for permissions checks) unless
  // the locale argument is present. The locale argument may be completely
  // omitted. Areas and joins are not loaded by default.

  self.findDocs = function(req, criteria, locale) {
    return self.apos.docs.find(req, criteria).trash(null).published(null).workflowLocale(locale || null).areas(false).joins(false);
  };

  // Fetch a draft doc along with all of the past commits in which it is the source ("fromId").
  //
  // On success, invokes callback with `(null, doc, commits)` where `commits` is an array.
  //
  // If the doc cannot be fetched a `notfound` error is reported.

  self.findDocAndCommits = function(req, docId, callback) {
    return self.findDocs(req, { _id: docId }).toObject(function(err, doc) {
      if (err) {
        console.error(err);
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
  // `(null, doc, commit)`. If the doc cannot be fetched for editing by this req,
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
      return self.findDocs(req, { _id: commit.fromId }).areas(true).joins(true).toObject(function(err, _doc) {
        if (err) {
          return callback(err);
        }
        doc = _doc;
        if ((!doc) || (!doc._edit)) {
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
    if (locale.match(/-draft$/)) {
      return locale;
    } else {
      return locale + '-draft';
    }
  };

  self.liveify = function(locale) {
    return locale.replace(/-draft$/, '');
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
    var complete = {};

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
            if (err === 'notfound') {
              // Just skip it
              return callback(null);
            }
            return callback(err);
          }
          // console.log(draft, live);
          related.push(draft);
          complete[draft.workflowGuid] = draft;
          liveVersions[draft.workflowGuid] = live;
          return callback(null);
        });
      }, callback);
    }

    function getJoined(callback) {
      if (!options.related) {
        return callback(null);
      }
      return self.getRelated(related, function(err, more) {
        related = related.concat(more);
        return callback(err);
      });
    }

    function diff(callback) {
      var ids = _.map(related, function(item) {
        return item._id || (item.item && item.item._id);
      });
      ids = _.uniq(ids);
      ids = _.filter(ids, function(id) {
        return !!id;
      });
      return async.eachSeries(ids, function(id, callback) {
        var draft, live;
        return async.series([
          getDraftAndLive,
          resolveRelationships
        ], function(err) {
          if (err === 'notfound') {
            // Just skip it
            return callback(null);
          }
          if (err) {
            return callback(err);
          }
          var _draft = self.apos.utils.clonePermanent(draft);
          var _live = self.apos.utils.clonePermanent(live);
          self.deleteExcludedProperties(_draft);
          self.deleteExcludedProperties(_live);
          // Normalize false vs. undefined to prevent false positives
          if (!_draft.trash) {
            _draft.trash = false;
          }
          if (!_live.trash) {
            _live.trash = false;
          }
          if (!_.isEqual(_draft, _live)) {
            //            console.log('***', JSON.stringify(_draft, null, '  '), JSON.stringify(_live, null, '  '));
            relatedModified.push(draft);
          } else {
            relatedUnmodified.push(draft);
          }
          return callback(null);
        });

        function getDraftAndLive(callback) {
          if (_.has(complete, id)) {
            draft = complete[id];
            live = liveVersions[id];
            return setImmediate(callback);
          }
          return self.getDraftAndLive(req, id, { permission: false, joins: false, areas: false }, function(err, _draft, _live) {
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

  self.getRelated = function(docs, callback) {
    var result = [];
    _.each(docs, function(draft) {
      // Also add anything that's joined into the primary doc
      var joins = self.findJoinsInDoc(draft);
      _.each(joins, function(join) {
        if (join.field.type === 'joinByOne') {
          if (join.value) {
            result.push(join.value);
          }
        } else if (join.field.type.match(/^join/)) {
          result = result.concat(join.value || []);
        }
      });
    });
    return callback(null, result);
  };

  // Fetch joins, load areas, etc. on doc objects that came out of the
  // commits collection. Used for previewing.

  self.after = function(req, docs, callback) {
    // bc
    if (!Array.isArray(docs)) {
      docs = [ docs ];
    }
    return async.eachSeries(docs, afterOne, callback);
    function afterOne(doc, callback) {
      var manager = self.apos.docs.getManager(doc.type);
      if (!manager) {
        return callback('no manager');
      }
      return manager.find(req).after(docs, callback);
    }
  };

  // Get the URLs of the context doc across locales for the locale switcher,
  // using a conservative projection for speed

  self.getLocalizations = function(req, workflowGuid, draft, callback) {
    var criteria = {
      workflowGuid: workflowGuid
    };
    // Are we interested in draft locales, or live locales?
    if (draft) {
      criteria.workflowLocale = /-draft$/;
    } else {
      criteria.workflowLocale = { $not: /-draft$/ };
    }
    return self.apos.docs.find(req, criteria, self.getContextProjection()).workflowLocale(null).published(null).addUrls(false).toArray(function(err, docs) {
      if (err) {
        return callback(err);
      }
      var localizations = {};
      _.each(docs, function(doc) {
        doc.label = self.locales[doc.workflowLocale] && self.locales[doc.workflowLocale].label;
        // Ignore stragglers from deactivated locales to prevent crashes
        if (_.has(self.locales, doc.workflowLocale)) {
          localizations[doc.workflowLocale] = doc;
          // Build an intermediate URL to avoid substantial overhead
          // and complexity: the `_url` property would be wrong at this
          // stage because of pieces pages in different locales, etc.
          doc._url = self.action + '/link-to-locale?' + qs.stringify({
            slug: doc.slug,
            locale: doc.workflowLocale
          });
        }
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
    return self.partial('menu', { workflowMode: req.session.workflowMode, localized: self.localized });
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

  // Returns the same data structure as `self.nestedLocales`,
  // except that any locales that are not editable by the
  // user indicated by `req` (that is, the user does not have
  // permission for the draft locale) are given the `disabled: true` flag.
  // Useful when rendering the locale tree for purposes of picking
  // locales to export to. Note that editable locales may be
  // nested beneath disabled locales.

  self.getEditableNestedLocales = function(req, doc) {

    var nestedLocales = _.cloneDeep(self.nestedLocales);
    _.each(self.locales, function(locale, name) {
      var _req = _.clone(req);
      _req.locale = name + '-draft';
      if (!self.apos.permissions.can(_req, 'edit-' + doc.type)) {
        disable(name);
      }
    });
    return nestedLocales;

    function disable(name) {
      disableBody(nestedLocales, name);
      function disableBody(nestedLocales, name) {
        _.each(nestedLocales, function(locale) {
          if (locale.name === name) {
            locale.disabled = true;
            return false;
          }
          disableBody(locale.children || [], name);
        });
      }
    }

  };

  // Returns an array of locale names for which the
  // given `req` is permitted to edit docs of the same
  // type as `doc`.

  self.getEditableLocales = function(req, doc) {
    return _.filter(self.locales, function(locale, name) {
      var _req = _.clone(req);
      _req.locale = name + '-draft';
      return self.apos.permissions.can(_req, 'edit-' + doc.type);
    });
  };

  // As much as is possible, apply the changes that occurred
  // between `to` (an older revision of the doc) and `from`
  // (a newer revision, FROM which the changes come)
  // to `draft` (usually the same doc as found in another locale).
  // If a change cannot be applied this is not regarded as an error;
  // it is not uncommon for the version of a doc in another locale
  // to be too different for some patches to be applied.
  //
  // There are two algorithms employed. One was created for Apostrophe
  // and works specifically with subobjects that have an `_id`
  // that uniquely identifies them; this is ideal for areas.
  // The other is jsondiffpatch. It is ideal for other properties.
  //
  // It is your responsibility to purge irrelevant properties
  // first with `self.deleteExcludedProperties(from)` and
  // `self.deleteExcludedProperties(to)` otherwise they will
  // be included in the patch.
  //
  // If `draft` is an array, this method instead populates it with a
  // description of the modified widgets, populating the array like this:
  //
  // [
  //   { dotPath: 'x.y.z', '_id': 'abc', 'change': 'added', after: '_id', value: { ... } },
  //   { '_id': 'def', 'change': 'removed' },
  //   { '_id': 'ghi', 'change': 'changed', value: { ... } },
  //   { '_id': 'jkl', 'change': 'moved', dotPath: 'x.y.z' }
  // ]
  //
  // This array is intended to facilitate previewing, not as a patch format.

  self.applyPatch = function(to, from, draft, callback) {

    var description;

    if (Array.isArray(draft)) {
      description = draft;
      draft = null;
    }

    // Step 0: make sure areas exist so we don't wind up with patches that remove them
    // or nowhere to add them

    _.each(from, function(value, key) {
      if (value && value.type === 'area') {
        if (!description) {
          if (!draft[key]) {
            draft[key] = {
              type: 'area',
              items: []
            };
          }
        }
        if (!to[key]) {
          to[key] = {
            type: 'area',
            items: []
          };
        }
      }
    });

    // Step 1: find all the sub-objects with an _id property that are
    // present in the docs and sort them in descending order by
    // depth. These will be schema array items and widgets

    var fromObjects = getObjects(from);
    var toObjects = getObjects(to);

    var originalFrom = {};
    var originalTo = {};

    // Clone the original objects so that if we remove already patched subproperties to
    // avoid false positives for parent objects, we still get a complete patch if
    // a parent object *does* get modified in a property native to it

    _.each(fromObjects.objects, function(object) {
      originalFrom[object._id] = _.cloneDeep(object);
    });
    _.each(toObjects.objects, function(object) {
      originalTo[object._id] = _.cloneDeep(object);
    });

    var draftObjects = draft && getObjects(draft);

    // Step 2: iterate over those objects, patching directly as appropriate

    // 2a: remove deleted things. "to" is the old version, PRIOR to the commit.
    // Anything present there and absent in "from" was therefore removed DURING the commit
    _.each(toObjects.objects, function(value) {
      // Deleted
      if (!_.has(fromObjects.dotPaths, value._id)) {
        if (description) {
          description.push({
            _id: value._id,
            value: originalTo[value._id],
            dotPath: toObjects.dotPaths[value._id],
            change: 'removed'
          });
        } else {
          if (_.has(draftObjects.dotPaths, value._id)) {
            deleteObject(draft, draftObjects, value);
          }
        }
        deleteObject(to, toObjects, value);
      }
    });

    // 2b: moved things and brand new things. For these we start with parent
    // objects, so that there is a context for patching child objects in
    // the right location later

    recomputeDotPaths(from, fromObjects);

    _.each(fromObjects.topDownObjects, function(value) {
      if (!_.has(fromObjects.dotPaths, value._id)) {
        // This is a subobject of something we already added,
        // therefore we're done with it
        return;
      }
      if (!_.has(toObjects.byId, value._id)) {
        // New in this commit, bring it to the draft;
        // but where?
        moved(fromObjects.dotPaths[value._id], originalFrom[value._id], true);
        recomputeDotPaths(from, fromObjects);
        return;
      }
      // Perhaps moved.
      recomputeDotPaths(from, fromObjects);
      var toDotPath = toObjects.dotPaths[value._id];
      var fromDotPath = fromObjects.dotPaths[value._id];
      if (toDotPath !== fromDotPath) {
        moved(fromDotPath, originalFrom[value._id]);
        recomputeDotPaths(from, fromObjects);
      }
    });

    // 2c: updated things. Here we start with child objects, so
    // that we can figure out parents have not changed

    _.each(fromObjects.objects, function(value) {

      var deleteAfter = false;
      if (!_.has(toObjects.byId, value._id)) {
        // We already dealt with additions in 2b
        return;
      }
      // Modified.
      if (!_.isEqual(value, toObjects.byId[value._id])) {
        if (description) {
          // console.log(toObjects.dotPaths[value._id]);
          // console.log(JSON.stringify(value, null, '  '));
          // console.log(JSON.stringify(toObjects.byId[value._id], null, '  '));
          description.push({ change: 'modified', _id: value._id, value: value });
          // Don't try to patch something the locale exported to doesn't have at all
        } else if (_.has(draftObjects.byId, value._id)) {
          updateObject(draft, draftObjects, toObjects.byId[value._id], value, originalFrom[value._id]);
        }
        // So we know the difference no longer exists when examining
        // a parent object
        deleteAfter = true;
      }
      recomputeDotPaths(from, fromObjects);
      if (deleteAfter) {
        deleteObject(from, fromObjects, value);
        deleteObject(to, toObjects, value);
      }
    });

    // Step 3: remove any remaining _id objects in commit.from and commit.to
    // so jsondiffpatch doesn't consider them
    purgeObjects(from, fromObjects);
    purgeObjects(to, toObjects);

    // Step 4: patch with jsondiff for everything that doesn't have an _id

    if (description) {
      // We don't do jsondiff when just generating a widget change description
      return callback(null);
    }

    var patch = diff.diff(to, from);
    try {
      diff.patch(draft, patch);
      return callback(null);
    } catch (e) {
      return callback(null, 'Content was too different');
    }

    function getObjects(doc) {
      var objects = [];
      var dotPaths = {};
      var dots = {};

      self.apos.docs.walk(doc, function(doc, key, value, dotPath, ancestors) {
        if (value && (typeof (value) === 'object') && value._id) {
          objects.push(value);
          dotPaths[value._id] = dotPath;
          dots[value._id] = 0;
          for (var i = 0; (i < dotPath.length); i++) {
            if (dotPath.charAt(i) === '.') {
              dots[value._id]++;
            }
          }
        }
      });

      var topDownObjects = _.clone(objects);

      objects.sort(function(a, b) {
        if (dots[a._id] > dots[b._id]) {
          return -1;
        } else if (dots[a._id] < dots[b._id]) {
          return 1;
        } else {
          return 0;
        }
      });

      topDownObjects.sort(function(a, b) {
        if (dots[a._id] > dots[b._id]) {
          return 1;
        } else if (dots[a._id] < dots[b._id]) {
          return -1;
        } else {
          return 0;
        }
      });

      return {
        objects: objects,
        topDownObjects: topDownObjects,
        dotPaths: dotPaths,
        dots: dots,
        byId: _.indexBy(objects, '_id')
      };

    }

    function recomputeDotPaths(doc, objects) {
      var dotPaths = {};
      self.apos.docs.walk(doc, function(doc, key, value, dotPath, ancestors) {
        if (value && (typeof (value) === 'object') && value._id) {
          dotPaths[value._id] = dotPath;
        }
      });
      objects.dotPaths = dotPaths;
    }

    function getObject(context, objects, dotPath) {
      return deep(context, dotPath);
    }

    function deleteObject(context, objects, value) {
      var dotPath = objects.dotPaths[value._id];
      if (!dotPath) {
        return;
      }
      if (removeDotPathViaSplice(context, dotPath)) {
        recomputeDotPaths(context, objects);
        // Buggy and complex
        // // Was an array removal; we have to adjust the dotPaths of
        // // other things appearing later in the same array
        // console.log('adjusting');
        // var stem = self.getStem(dotPath);
        // var array = deep(context, stem);
        // console.log(stem);
        // for (var i = 0; (i < array.length); i++) {
        //   var id = array[i] && array[i]._id;
        //   if (id) {
        //     console.log('found');
        //     objects.dotPaths[id] = stem + '.' + i;
        //   }
        // }
      }
    }

    function insertObjectAfter(context, objects, afterId, value) {
      var afterDotPath = objects.dotPaths[afterId];
      if (!afterDotPath) {
        // Too different to continue
        return;
      }
      var stem = self.getStem(afterDotPath);
      var index = self.getIndex(afterDotPath);
      var array = deep(context, stem);
      if (!Array.isArray(array)) {
        // Contexts are too different, receiving context has
        // no array at this level, gracefully ignore
        return;
      }
      array.splice(index + 1, 0, value);
      recomputeDotPaths(context, objects);
      // In case this is an insertion
      objects.byId[value._id] = value;
    }

    function insertObjectBefore(context, objects, beforeId, value) {
      var beforeDotPath = objects.dotPaths[beforeId];
      if (!beforeDotPath) {
        // Too different to continue
        return;
      }
      var stem = self.getStem(beforeDotPath);
      var index = self.getIndex(beforeDotPath);
      var array = deep(context, stem);
      if (!Array.isArray(array)) {
        // Contexts are too different, receiving context has
        // no array at this level, gracefully ignore
        return;
      }
      array.splice(index, 0, value);
      recomputeDotPaths(context, objects);
      // In case this is an insertion
      objects.byId[value._id] = value;
    }

    function appendObject(context, objects, path, object) {
      var array = deep(context, path);
      if (!Array.isArray(array)) {
        return false;
      }
      array.push(object);
      recomputeDotPaths(context, objects);
      objects.byId[object._id] = object;
      return true;
    }

    function purgeObjects(context, objects) {
      _.each(objects.objects, function(object) {
        deleteObject(context, objects, object);
      });
    }

    function updateObject(context, objects, oldObject, newObject, originalNewObject) {
      // Try to patch rather than copying in a way that would
      // crush intended differences at the subwidget level
      var dotPath = objects.dotPaths[oldObject._id];
      if (dotPath) {
        try {
          var patch = diff.diff(oldObject, newObject);
          var targetObject = deep(context, dotPath);
          diff.patch(targetObject, patch);
        } catch (e) {
          console.error(e);
          deep(context, dotPath, originalNewObject);
        }
      }
    }

    function moved(fromDotPath, value, isNew) {
      var fromIndex = parseInt(_.last(fromDotPath.split('.')));
      var afterId;
      var i;
      var subPath;
      var obj;
      // We're moving it, not modifying it, so go with the
      // existing value in the draft if there is one
      var toMove = (draftObjects && draftObjects.byId[value._id]) || value;
      if (fromIndex > 0) {
        // Find an object preceding this one that exists in both
        // `from` and `draft`, and position the moved object
        // after it
        for (i = fromIndex - 1; (i >= 0); i--) {
          subPath = fromDotPath.split('.');
          subPath.pop();
          subPath.push(i);
          obj = getObject(from, fromObjects, subPath.join('.'));
          afterId = obj._id;
          if (_.has((draftObjects || toObjects).byId, afterId)) {
            if (draft) {
              deleteObject(draft, draftObjects, toMove);
              insertObjectAfter(draft, draftObjects, afterId, toMove);
            } else {
              description.push({
                change: isNew ? 'added' : 'moved',
                value: value,
                _id: value._id
              });
            }
            return;
          }
        }
      } else {
        // Looking for something to insert "after" won't work
        // for the very first widget in the area. So find something
        // in common that follows it and insert before that
        i = 1;
        while (true) {
          subPath = fromDotPath.split('.');
          subPath.pop();
          subPath.push(i);
          obj = getObject(from, fromObjects, subPath.join('.'));
          if (!obj) {
            // No more to look at
            break;
          }
          var beforeId = obj._id;
          if (_.has((draftObjects || toObjects).byId, beforeId)) {
            if (draft) {
              // We're moving it, not modifying it, so go with the
              // existing value in the draft if there is one
              toMove = draftObjects.byId[value._id] || value;
              deleteObject(draft, draftObjects, toMove);
              insertObjectBefore(draft, draftObjects, beforeId, toMove);
            } else {
              description.push({
                change: isNew ? 'added' : 'moved',
                value: value,
                _id: value._id
              });
            }
            // So we know the difference no longer exists when examining
            // a parent object
            deleteObject(from, fromObjects, value);
            deleteObject(to, toObjects, value);
            return;
          }
          i++;
        }
      }
      // Fallback when we can't find any peers in
      // `draft`: append it
      if (description) {
        description.push({
          change: isNew ? 'added' : 'moved',
          value: value,
          _id: value._id
        });
        deleteObject(from, fromObjects, value);
        deleteObject(to, toObjects, value);
      } else {
        deleteObject(draft, draftObjects, value);
        if (appendObject(draft, draftObjects, fromDotPath.replace(/\.\d+$/, ''), toMove)) {
          // So we know the difference no longer exists when examining
          // a parent object
          deleteObject(from, fromObjects, value);
          deleteObject(to, toObjects, value);
        } else {
          // append failed, probably because the parent object
          // doesn't exist yet in the draft. So don't purge or
          // we'll wind up inserting an empty parent object
        }
      }
    }
  };

  // Set the given properties of `doc` across an array of `locales`.
  // *This method bypasses the commit mechanism and ignores the
  // `excludedProperties` list. It also does not call `docAfterSave`, etc.*
  // It is meant to be used when programmatically applying changes to documents
  // in bulk.
  //
  // The object `set` is applied to the doc using MongoDB's `$set` operator.
  // Any properties not present in that object are unmodified.
  //
  // By default, only the locales explicitly listed are updated. If that
  // list contains `['en', 'fr']`, then only the *live* versions of those locales
  // are updated; if it contains `['en-draft', 'fr-draft']` then only those
  // *draft* locales are updated.
  //
  // `options` must be an object. If `options.mode` is set to `draft`,
  // then the locale names provided are converted to draft locale names and
  // only draft locales are updated. If `options.mode` is set to `live`
  // then the locale names provided are converted to live locale names and
  // only live locales are updated. If `options.mode` is set to `both`
  // then the provided locales are updated for both draft and live,
  // regardless of whether the original `locales` array contains `-draft`
  // suffixes or not.
  //
  // If the `locales` argument contains the string `all`, then all
  // configured locales are updated, both draft and live; you may combine this with
  // `options.mode = 'live'` or `options.mode = 'draft'` to alter the behavior.
  //
  // If `doc` is not subject to workflow, it is still updated.
  //
  // To ensure a doc is not considered trash in any locale set the `trash`
  // property to `false` in your `set` object.
  //
  // Note to those using projections: your `doc` *must* have a `type` property.

  self.setPropertiesAcrossLocales = function(req, doc, set, locales, options, callback) {
    if ((!doc.workflowGuid) || (!self.includeType(doc.type))) {
      // doc is not subject to workflow. For developer convenience, allow this
      // method to be used in that case too; it just updates the single doc
      return self.apos.docs.db.update({ $and: [ { _id: doc._id }, self.apos.permissions.criteria(req, 'edit-' + doc.type) ] }, { $set: set }, callback);
    }

    return self.apos.docs.db.update(
      self.getCriteriaAcrossLocales(req, doc, locales, options),
      { $set: set },
      { multi: true },
      callback
    );
  };

  // See `setPropertiesAcrossLocales`.
  //
  // Return a MongoDB criteria object selecting the given doc across multiple
  // locales based on its workflowGuid, taking into account the user's
  // editing permissions. If it has no workflowGuid or is of a type
  // not subject to workflow an exception is thrown. Called by
  // `setPropertiesAcrossLocales`, this method was factored out primarily
  // for ease of unit testing. See that method for full documentation.

  self.getCriteriaAcrossLocales = function(req, doc, locales, options) {
    var criteria = {};
    if ((!doc.workflowGuid) && (!self.includeType(doc.type))) {
      throw new Error('getCriteriaAcrossLocales requires a doc with a workflowGuid and a type that is subject to workflow');
    }
    criteria.workflowGuid = doc.workflowGuid;
    if (locales === 'all') {
      locales = _.keys(self.locales);
    }
    if (options.mode === 'draft') {
      locales = _.uniq(_.map(locales, self.draftify));
    } else if (options.mode === 'live') {
      locales = _.uniq(_.map(locales, self.liveify));
    } else if (options.mode === 'both') {
      locales = _.uniq(
        _.map(locales, self.liveify).concat(
          _.map(locales, self.draftify)
        )
      );
    }
    if (!locales.length) {
      // Mongo reports an error on empty $in criteria, our preference is to do nothing
      // if the locales list is empty
      locales = [ '__NEVER_HAPPENS_aweiouhrfaiowue' ];
    }
    criteria.workflowLocale = { $in: locales };
    criteria = {
      $and: [ criteria, self.apos.permissions.criteria(req, 'edit-' + doc.type) ]
    };
    return criteria;
  };

  // Commits the current draft of the given doc id
  // to the live locale for that document. `id`
  // may be either the draft or the live id.
  // On success, reports `(null, commitId, draftTitle)`
  // to the callback.
  //
  // The `id` argument is sanitized, so it is safe
  // to pass user input directly.

  self.commitLatest = function(req, id, callback) {
    if (!req.user) {
      // confusion to the enemy
      return callback('error');
    }
    id = self.apos.launder.id(id);
    var draft, live, commitId;
    return async.series({
      getDraftAndLive,
      commit
    }, function(err) {
      if (err) {
        return callback(err);
      }
      return callback(null, commitId, draft.title);
    });
    function getDraftAndLive(callback) {
      return self.getDraftAndLive(req, id, {}, function(err, _draft, _live) {
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
  };

  self.revert = function(req, commitId, callback) {
    var id = self.apos.launder.id(commitId);

    return async.waterfall([getDocAndCommit, copyIncludedProperties, deleteObsoleteAreas, update], callback);

    function getDocAndCommit(callback) {
      return self.findDocAndCommit(req, id, callback);
    }

    function copyIncludedProperties(doc, commit, callback) {
      return self.copyIncludedProperties(req, commit.from, doc, (err) => {
        if (err) {
          return callback(err);
        }
        callback(null, commit, doc);
      });
    }

    function deleteObsoleteAreas(commit, doc, callback) {
      return self.deleteObsoleteAreas(req, commit.from, doc, function(err) {
        if (err) {
          return callback(err);
        }
        return callback(null, doc);
      });
    }

    function update(draft, callback) {
      return self.apos.docs.update(req, draft, callback);
    }
  };

  // Export the given commit id (NOT doc id) to the given locales.
  // On success the callback receives `(null, result)`
  // where `result` is an object with `success` and `errors` properties.
  // `success` is an array of locale names, `errors` is
  // an array of objects with `locale` and `message` properties.
  //
  // Note that failure to export to a locale does not result
  // in an error as the first argument to the callback as this may occur
  // in normal situations such as a document too different
  // to calculate a diff against.
  //
  // This method validates both `id` and `locales`, so
  // it is acceptable to pass user input directly.

  self.export = function(req, id, locales, callback) {
    if (!req.user) {
      // Confusion to the enemy
      return callback('error');
    }

    id = self.apos.launder.id(id);

    if (Array.isArray(locales)) {
      locales = _.filter(locales, function(locale) {
        return ((typeof (locale) === 'string') && (_.has(self.locales, locale)));
      });
    }
    locales = _.map(locales, function(locale) {
      return self.draftify(locale);
    });

    var success = [];
    var errors = [];
    var commit;

    return async.series({
      getCommit,
      applyPatches
    }, function(err) {
      if (err) {
        return callback(err);
      }
      return callback(null, {
        success: success,
        errors: errors
      });
    });

    function getCommit(callback) {
      return self.findDocAndCommit(req, id, function(err, doc, _commit) {
        if (err) {
          return callback(err);
        }
        commit = _commit;
        locales = _.filter(locales, function(locale) {
          // Reapplying to source locale doesn't make sense
          return (locale !== commit.from.workflowLocale);
        });
        if (!commit) {
          return callback('notfound');
        }
        return callback(null);
      });
    }

    function applyPatches(callback) {

      return async.eachSeries(locales, function(locale, callback) {

        var draft, from, to;

        from = _.cloneDeep(commit.from);
        to = _.cloneDeep(commit.to);

        return async.series([ getDraft, resolveToSource, applyPatch, resolveToDestination, update ], callback);

        function getDraft(callback) {
          return self.findDocs(req, { workflowGuid: commit.workflowGuid }, locale).toObject(function(err, _draft) {
            if (err) {
              return callback(err);
            }
            if (!(_draft && _draft._edit)) {
              return callback('no draft');
            }
            draft = _draft;
            return callback(null);
          });
        }

        // Resolve relationship ids in the "from" document (which will have
        // been in a draft locale) and in the "draft" document (where we are
        // exporting to) to point to a consistent locale, so that the diff applies properly
        function resolveToSource(callback) {
          return async.series([
            _.partial(self.resolveRelationships, req, draft, to.workflowLocale),
            _.partial(self.resolveRelationships, req, from, to.workflowLocale)
          ], callback);
        }

        function applyPatch(callback) {
          self.deleteExcludedProperties(from);
          self.deleteExcludedProperties(to);

          if (!draft) {
            errors.push({ locale: self.liveify(locale), message: 'not found, run task' });
            return callback(null);
          }

          return self.applyPatch(to, from, draft, function(err) {
            if (err) {
              errors.push({ locale: self.liveify(locale), message: 'Some or all content was too different' });
            } else {
              draft.workflowImportedFrom = draft.workflowImportedFrom || {};
              draft.workflowImportedFrom[self.liveify(req.locale)] = new Date();
              success.push(self.liveify(locale));
            }
            return callback(null);
          });

        }

        // Resolve relationship ids back to the locale the draft is coming from
        function resolveToDestination(callback) {
          return self.resolveRelationships(req, draft, draft.workflowLocale, callback);
        }

        function update(callback) {
          draft.workflowSubmitted = self.getWorkflowSubmittedProperty(req, { type: 'exported' });
          return self.apos.docs.update(req, draft, callback);
        }
      }, callback);
    }
  };

  // Force export the doc with the given id to the given locales.
  // the id and locales arguments are sanitized, so it is safe
  // to pass user input directly.
  //
  // On success the callback receives `(null, results)` where
  // `results` is an object with `success` and `errors` properties.
  // `success` is an array of locale names, and `errors` is
  // an array of objects with `locale` and `message` properties.
  // Note that failure to export to a single locale is not an
  // overall error because it can be a normal situation and
  // does not indicate a systemic problem (TODO: is this
  // really true for this method in the same way it is true for export?)

  self.forceExport = function(req, id, locales, callback) {
    if (!req.user) {
      // Confusion to the enemy
      return callback('error');
    }
    id = self.apos.launder.id(id);
    var success = [];
    var errors = [];
    var original;
    if (Array.isArray(locales)) {
      locales = _.filter(locales, function(locale) {
        return ((typeof (locale) === 'string') && (_.has(self.locales, locale)));
      });
    }
    locales = _.map(locales, function(locale) {
      return self.draftify(locale);
    });
    return async.series({
      getOriginal,
      applyPatches
    }, function(err) {
      if (err) {
        return callback(err);
      }
      return callback(null, {
        success: success,
        errors: errors
      });
    });

    function getOriginal(callback) {
      return self.findDocs(req, { _id: id }).toObject(function(err, doc) {
        if (err) {
          return callback(err);
        }
        if ((!doc) || (!doc._edit)) {
          return callback('notfound');
        }
        original = self.apos.utils.clonePermanent(doc);
        locales = _.filter(locales, function(locale) {
          // Reapplying to source locale doesn't make sense
          return (locale !== original.workflowLocale);
        });
        return callback(null);
      });
    }

    function applyPatches(callback) {

      return async.eachSeries(locales, function(locale, callback) {

        var resolvedOriginal, draft;

        // Our own modifiable copy to safely pass to `resolveToDestination`
        resolvedOriginal = _.cloneDeep(original);

        return async.series([ getDraft, resolveToDestination, applyPatch, update ], callback);

        function getDraft(callback) {
          return self.findDocs(req, { workflowGuid: resolvedOriginal.workflowGuid }, locale).toObject(function(err, _draft) {
            if (err) {
              return callback(err);
            }
            if (!(_draft && _draft._edit)) {
              return callback('notfound');
            }
            draft = _draft;
            return callback(null);
          });
        }

        // Resolve relationship ids of resolved original to point to locale
        // we're patching
        function resolveToDestination(callback) {
          return self.resolveRelationships(req, resolvedOriginal, draft.workflowLocale, callback);
        }

        function applyPatch(callback) {

          if (!draft) {
            errors.push({ locale: self.liveify(locale), message: 'not found, run task' });
            return callback(null);
          }

          self.deleteExcludedProperties(resolvedOriginal);

          _.assign(draft, resolvedOriginal);

          return callback(null);

        }

        function update(callback) {
          success.push(self.liveify(draft.workflowLocale));
          return self.apos.docs.update(req, draft, callback);
        }

      }, callback);
    }
  };

  // Given a locale and a workflowGuid, invoke the callback with
  // `(null, result)` where `result` is one of the following strings:
  //
  // 'notfound': doc does not exist at all in that locale, not even as trash.
  // Normally should not happen.
  //
  // 'available': the doc exists outside the trash in that locale.
  //
  // 'newInTrash': the doc exists in the trash but has never
  // been edited in this locale, i.e. it was born in the trash.
  //
  // 'inTrash': the doc exists in the trash and has been modified,
  // i.e. at least some editing has already taken place there
  // (for instance, it may have been moved to the trash as an
  // intentional choice in that locale).
  //
  // If the request is made regarding a live locale, information about
  // the matching draft locale is delivered.
  //
  // If an unexpected error occurs it is passed to the callback as usual.
  //
  // For convenience the doc is passed to the callback as a third argument.

  self.getAvailability = function(req, workflowGuid, locale, callback) {
    var localeWas = req.locale;
    req.locale = self.draftify(locale);
    return self.apos.docs.find(req, { workflowGuid: workflowGuid, workflowLocale: self.draftify(locale) }).trash(null).published(null).toObject(function(err, doc) {
      req.locale = localeWas;
      if (err) {
        return callback(err);
      }
      if (!doc) {
        return callback(null, 'notfound');
      }
      if (!doc.trash) {
        return callback(null, 'available', doc);
      }
      // Unfortunately even for a brand new doc createdAt and updatedAt are
      // not identical. They result from separate calls to `new Date()` and
      // `beforeInsert` handlers can burn time before `beforeSave` is invoked.
      // Allow for a reasonable difference between these times, still short
      // enough that it is unlikely a user has done meaningful editing worth
      // preserving yet.
      if ((doc.updatedAt.getTime() - doc.createdAt.getTime()) < 5000) {
        return callback(null, 'newInTrash', doc);
      }
      return callback(null, 'inTrash', doc);
    });

  };

  // Returns true if `ancestorLocale` is an ancestor of `otherLocale`.
  // Draft/live distinctions are ignored for purposes of this method.

  self.isAncestorOf = function(ancestorLocale, otherLocale) {
    return _.contains(self.locales[self.liveify(otherLocale)].ancestors, self.liveify(ancestorLocale));
  };
};
