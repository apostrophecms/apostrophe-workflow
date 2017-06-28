var async = require('async');
var _ = require('lodash');
var deep = require('deep-get-set');
var removeDotPathViaSplice = require('./removeDotPathViaSplice.js');

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

module.exports = function(self, options) {
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
      return res.send({ status: 'ok', commitId: commitId, title: draft.title });
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
  });

  self.route('post', 'export', function(req, res) {

    if (!req.user) {
      // Confusion to the enemy
      return res.status(404).send('not found');
    }

    var id = self.apos.launder.id(req.body.id);
    var locales = [];
    var success = [];
    var errors = [];
    var drafts;
    if (Array.isArray(req.body.locales)) {
      locales = _.filter(req.body.locales, function(locale) {
        return ((typeof(locale) === 'string') && (_.has(self.locales, locale)));
      });
    }
    locales = _.map(locales, function(locale) {
      return self.draftify(locale);
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
      return res.send({ status: 'ok', success: success, errors: errors });
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
          return self.apos.docs.find(req, { workflowGuid: commit.workflowGuid }).trash(null).published(null).workflowLocale(locale).permission('edit').areas(false).joins(false).toObject(function(err, _draft) {
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
          return self.resolveRelationships(req, draft, to.workflowLocale, callback);
        }

        function applyPatch(callback) {

          if (!draft) {
            errors.push({ locale: self.liveify(locale), message: 'not found, run task' });
            return callback(null);
          }

          self.deleteExcludedProperties(from);
          self.deleteExcludedProperties(to);

          // Step 0: make sure areas exist so we don't wind up with patches that remove them
          // or nowhere to add them

          _.each(from, function(value, key) {
            if (value && value.type === 'area') {
              if (!draft[key]) {
                draft[key] = {
                  type: 'area',
                  items: []
                };
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
          var draftObjects = getObjects(draft);
                      
          // Step 2: iterate over those objects, patching directly as appropriate
          
          // "to" is the old version, PRIOR to the commit. Anything present there and
          // absent in "from" was therefore removed DURING the commit
          _.each(toObjects.objects, function(value) {
            // Deleted
            if (!_.has(fromObjects.dotPaths, value._id)) {
              if (_.has(draftObjects.dotPaths, value._id)) {
                deleteObject(draft, draftObjects, value);
              }
            }
          });
          _.each(fromObjects.objects, function(value) {
            if (!_.has(draftObjects.byId, value._id)) {
              if (!_.has(toObjects.byId, value._id)) {
                // New in this commit, bring it to the draft;
                // but where?
                moved(fromObjects.dotPaths[value._id], value);
                return;
              } else {
                // console.log('not in draft (possibly deleted): ' + value._id);
                return;
              }
            }
            // Modified. Could also be moved, so don't return
            if (JSON.stringify(value) !== JSON.stringify(toObjects.byId[value._id])) {
              updateObject(draft, draftObjects, value);
              // So we know the difference no longer exists when examining
              // a parent object
              deleteObject(from, fromObjects, value);
              deleteObject(to, toObjects, value);
            }
            // Moved. Look at neighbor ids, not indexes, to account for
            // existing divergences
            var toDotPath = toObjects.dotPaths[value._id];
            var fromDotPath = fromObjects.dotPaths[value._id];
            if (toDotPath !== fromDotPath) {
              moved(fromDotPath, value);
              return;
            }
          });

          // Step 3: remove any remaining _id objects in commit.from and commit.to
          // so jsondiffpatch doesn't consider them
          purgeObjects(from, fromObjects);
          purgeObjects(to, toObjects);
          
          // console.log('at this point draft is: ', JSON.stringify(draft, null, '  '));
          
          // Step 4: patch as normal for everything that doesn't have an _id

          var patch = diff.diff(to, from);
          try {
            // console.log('draft is: ', JSON.stringify(draft, null, '  '));
            diff.patch(draft, patch);
            success.push(self.liveify(draft.workflowLocale));
            // console.log('at this point draft is: ', JSON.stringify(draft, null, '  '));
            return callback(null);
          } catch (e) {
            errors.push({ locale: self.liveify(locale), message: 'Some or all content was too different' });
            console.error(e);
            return callback(null);
          }
        
          function getObjects(doc) {
            var objects = [];
            var dotPaths = {};
            var dots = {};
            self.apos.docs.walk(doc, function(doc, key, value, dotPath, ancestors) {
              if (value && (typeof(value) === 'object') && value._id) {
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
                       
            objects.sort(function(a, b) {
              if (dots[a._id] > dots[b._id]) {
                return -1;
              } else if (dots[a._id] < dots[b._id]) {
                return 1;
              } else {
                return 0;
              }
            });

            return {
              objects: objects,
              dotPaths: dotPaths,
              dots: dots,
              byId: _.indexBy(objects, '_id')
            };

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
              // Was an array removal; we have to adjust the dotPaths of
              // other things appearing later in the same array
              var stem = self.getStem(dotPath);
              var index = self.getIndex(dotPath);
              var array = deep(context, stem);
              for (var i = index; (i < array.length); i++) {
                var id = array[i] && array[i]._id;
                if (id) {
                  objects.dotPaths[id] = stem + '.' + i;
                }
              }
            }
          }
          
          function insertObjectAfter(context, objects, afterId, value) {
            var afterDotPath = objects.dotPaths[afterId];
            var stem = self.getStem(afterDotPath);
            var index = self.getIndex(afterDotPath);
            var array = deep(context, stem);
            array.splice(index + 1, 0, value);
            for (var i = index + 1; (i < array.length); i++) {
              var id = array[i] && array[i]._id;
              if (id) {
                objects.dotPaths[id] = stem + '.' + i;
              }
            }
          }
                      
          function appendObject(context, objects, path, object) {
            var array = deep(context, path);
            if (!Array.isArray(array)) {
              return false;
            }
            array.push(object);
            return true;
          }
          
          function purgeObjects(context, objects) {
            _.each(objects.objects, function(object) {
              deleteObject(context, objects, object);
            });
          }

          function updateObject(context, objects, object) {
            var dotPath = objects.dotPaths[object._id];
            if (dotPath) {
              deep(context, dotPath, object);
            }
          }
          
          function moved(fromDotPath, value) {
            var fromIndex = parseInt(_.last(fromDotPath.split('.')));
            var afterId;
            if (fromIndex > 0) {
              for (var i = fromIndex - 1; (i >= 0); i--) {
                var subPath = fromDotPath.split('.');
                subPath.pop();
                subPath.push(i);
                var obj = getObject(from, fromObjects, subPath.join('.'));
                var afterId = obj._id;
                if (_.has(draftObjects.byId, afterId)) {
                  deleteObject(draft, draftObjects, value);
                  insertObjectAfter(draft, draftObjects, afterId, value);
                  // So we know the difference no longer exists when examining
                  // a parent object
                  deleteObject(from, fromObjects, value);
                  deleteObject(to, toObjects, value);
                  return;
                }
              }  
            }
            deleteObject(draft, draftObjects, value);
            if (appendObject(draft, draftObjects, fromDotPath.replace(/\.\d+$/, ''), value)) {
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
  });
  
  self.route('post', 'force-export', function(req, res) {
    if (!req.user) {
      // Confusion to the enemy
      return res.status(404).send('not found');
    }
    var id = self.apos.launder.id(req.body.id);
    var locales = [];
    var success = [];
    var errors = [];
    var drafts, original;
    if (Array.isArray(req.body.locales)) {
      locales = _.filter(req.body.locales, function(locale) {
        return ((typeof(locale) === 'string') && (_.has(self.locales, locale)));
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
        console.error(err);
        return res.send({ status: 'error' });
      }
      // Here the `errors` object has locales as keys and strings as values; these can be
      // displayed or, since they are technical, just flagged as locales to which the patch
      // could not be successfully applied
      return res.send({ status: 'ok', success: success, errors: errors });
    });

    function getOriginal(callback) {
      return self.findDocForEditing(req, id, function(err, doc) {
        if (err) {
          return callback(err);
        }
        original = self.apos.utils.clonePermanent(doc);
        if (!original) {
          return callback('notfound');
        }
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
          return self.apos.docs.find(req, { workflowGuid: resolvedOriginal.workflowGuid }).trash(null).published(null).workflowLocale(locale).permission('edit').areas(false).joins(false).toObject(function(err, _draft) {
            if (err) {
              return callback(err);
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
  });

  self.route('post', 'force-export-widget', function(req, res) {
    if (!req.user) {
      // Confusion to the enemy
      return res.status(404).send('not found');
    }
    var id = self.apos.launder.id(req.body.id);
    var widgetId = self.apos.launder.id(req.body.widgetId);
    var locales = [];
    var success = [];
    var errors = [];
    var drafts, original;
    if (Array.isArray(req.body.locales)) {
      locales = _.filter(req.body.locales, function(locale) {
        return ((typeof(locale) === 'string') && (_.has(self.locales, locale)));
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
        console.error(err);
        return res.send({ status: 'error' });
      }
      // Here the `errors` object has locales as keys and strings as values; these can be
      // displayed or, since they are technical, just flagged as locales to which the patch
      // could not be successfully applied
      return res.send({ status: 'ok', success: success, errors: errors });
    });

    function getOriginal(callback) {
      return self.findDocForEditing(req, id, function(err, doc) {
        if (err) {
          return callback(err);
        }
        original = self.apos.utils.clonePermanent(doc);
        if (!original) {
          return callback('notfound');
        }
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
          return self.apos.docs.find(req, { workflowGuid: resolvedOriginal.workflowGuid }).trash(null).published(null).workflowLocale(locale).permission('edit').areas(false).joins(false).toObject(function(err, _draft) {
            if (err) {
              return callback(err);
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

          var widgetInfo = self.apos.utils.findSubobjectAndDotPathById(resolvedOriginal, widgetId);

          if (!widgetInfo) {
            errors.push({ locale: self.liveify(locale), message: 'widget no longer exists in original, nothing to patch' });
            return callback(null);
          }

          var parentDotPath = getParentDotPath(widgetInfo.dotPath);
          if (deep(draft, parentDotPath)) {
            deep(draft, widgetInfo.dotPath, widgetInfo.object); 
            success.push(self.liveify(locale));
          } else if (addMissingArea()) {
            // Great
            success.push(self.liveify(locale));
          } else {
            errors.push({ locale: self.liveify(locale), message: 'No suitable context, document is too different' });
          }

          return callback(null);
          
          function addMissingArea() {
            // currently parentDotPath ends in .items
            var areaDotPath = getParentDotPath(parentDotPath);
            // Now it ends in, say, `body`. Go one more level and see
            // if we're either at the root, or a valid parent path
            var areaParentDotPath = getParentDotPath(areaDotPath);
            if ((!areaParentDotPath.length) || (deep(areaParentDotPath))) {
              deep(draft, areaDotPath, { type: 'area', items: [ widgetInfo.object ] });
              return true;
            }
            return false;
          }
          
          function getParentDotPath(dotPath) {
            return dotPath.replace(/^[^\.]+$|\.[^\.]+$/, '');
          }
          
        }

        function update(callback) {
          return self.apos.docs.update(req, draft, callback); 
        }

      }, callback);
    }
  });

  // Given a workflowGuid and a draft workflowLocale, return the doc for the corresponding live locale

  self.route('post', 'get-live', function(req, res) {

    if (!req.user) {
      // Confusion to the enemy
      return res.status(404).send('not found');
    }
    var guid = self.apos.launder.string(req.body.workflowGuid);
    var locale = self.apos.launder.string(req.body.workflowLocale);
    locale = self.liveify(locale);
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
      return self.apos.docs.find(req, { workflowGuid: guid, workflowLocale: locale }).trash(null).published(null).workflowLocale(locale).toObject(function(err, _live) {
        live = _live;
        return callback(err);
      });
    }
    
    function ids(callback) {
      if (!req.body.resolveRelationshipsToDraft) {
        return callback(null);
      }
      return self.resolveRelationships(req, live, self.draftify(locale), callback);
    }
    
    function fail(err) {
      console.error(err);
      return res.send({ status: 'error' });
    }

  });

  self.route('post', 'workflow-mode', function(req, res) {
    if (!req.user) {
      // Confusion to the enemy
      return res.status(404).send('not found');
    }
    req.session.workflowMode = (req.body.mode === 'draft') ? 'draft' : 'live';
    if (req.body.mode === 'draft') {
      req.locale = self.draftify(req.locale);
    } else {
      req.locale = self.liveify(req.locale);
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
        return self.apos.docs.find(req, { _id: id }, { _id: 1 }).workflowLocale(self.draftify(req.locale)).permission('edit').trash(null).published(null).toObject(function(err, obj) {
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
        return self.apos.docs.db.update({ _id: id }, { $set: { workflowSubmitted: self.getWorkflowSubmittedProperty(req, { type: 'submit' }) } }, callback);
      }
    }, function(err) {
      if (err) {
        console.error(err);
        return res.send({ status: 'error' });
      }
      return res.send({ status: 'ok' });
    });
  });

  self.route('post', 'dismiss', function(req, res) {

    if (!req.user) {
      // Confusion to the enemy
      return res.status(404).send('not found');
    }

    var id = self.apos.launder.id(req.body.id);

    return async.series([
      checkPermissions,
      dismiss
    ], function(err) {
      if (err) {
        console.error(err);
        return res.send({ status: 'error' });
      }
      return res.send({ status: 'ok' });
    });

    function checkPermissions(callback) {
      return self.apos.docs.find(req, { _id: id }, { _id: 1 }).workflowLocale(null).published(null).permission('edit').trash(null).toObject(function(err, obj) {
        if (err) {
          return callback(err);
        }
        if (!obj) {
          return callback('not found');
        }
        return callback(null);
      });
    }

    function dismiss(callback) {
      return self.apos.docs.db.update({ _id: id }, { $unset: { workflowSubmitted: 1 } }, callback);
    }

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
    return self.findDocAndCommits(req, id, function(err, doc, commits) {
      if (err) {
        console.error(err);
        return res.status(500).send('error');
      }
      return res.send(self.render(req, 'history-modal.html', { commits: commits, doc: doc }));
    });
  });

  self.route('post', 'locale-picker-modal', function(req, res) {
    if (!req.user) {
      // Confusion to the enemy
      return res.status(404).send('not found');
    }
    var workflowGuid = self.apos.launder.id(req.body.workflowGuid);
    return self.getLocalizations(req, workflowGuid, true, function(err, localizations) {
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
    var index = self.apos.launder.integer(req.body.index);
    var total = self.apos.launder.integer(req.body.total);
    var lead = self.apos.launder.boolean(req.body.lead);
    var draft, live, modifiedFields, related;
    return async.series([
      getDraftAndLive,
      getModifiedFields
    ], function(err) {
      if (err) {
        console.error(err);
        res.status(500).send('error');
      }
      return res.send(self.render(req, 'commit-modal.html', {
        doc: draft,
        modifiedFields: modifiedFields,
        index: index,
        total: total,
        lead: lead
      }));
    });
    
    function getDraftAndLive(callback) {
      // We get both the same way the commit route does, for the sake of the permissions check,
      // so it doesn't initially appear that someone can be sneaky (although they can't really)
      return self.getDraftAndLive(req, id, {}, function(err, _draft, _live) {
        draft = _draft;
        live = _live;
        return callback(err);
      });
    }
                
    function getModifiedFields(callback) {
      return self.getModifiedFields(req, draft, live, function(err, _modifiedFields) {
        modifiedFields = _modifiedFields;
        return callback(err);
      });
    }
  });
  
  // Given doc ids in req.body.ids, send back an object with
  // array properties, `modified` and `unmodified`, containing the
  // editable, modified draft doc ids and the editable, unmodified
  // draft doc ids respectively. Any ids that are not editable by the
  // current user are not included in the response.
  //
  // The `committable` array contains the ids that are
  // committable by the current user.
  //
  // The `unsubmitted` array contains the ids that are
  // modified and can be newly submitted by the current user
  // (the last submitter was someone else, or they are not
  // currently in a submitted state).
  //
  // If req.body.related is true, also include the ids of
  // editable documents related to those specified,
  // via joins or widgets.
  //
  // For convenience, the ids sent to this method can be either
  // live or draft.
  
  self.route('post', 'editable', function(req, res) {
    if (!req.user) {
      res.status(404).send('notfound');
    }
    var ids = self.apos.launder.ids(req.body.ids);
    return self.getEditable(req, ids, { related: true }, function(err, modified, unmodified, committable) {
      if (err) {
        console.error(err);
        return res.send({ status: 'error' });
      }
      return res.send({
        status: 'ok',
        modified: _.pluck(modified, '_id'),
        unmodified: _.pluck(unmodified, '_id'),
        committable: _.pluck(committable, '_id'),
        unsubmitted: _.pluck(_.filter(modified, function(doc) {
          return ((!doc.workflowSubmitted) || (doc.workflowSubmitted.username !== req.user.username));
        }))
      });
    });
  });

  self.route('post', 'review-modal', function(req, res) {

    if (!req.user) {
      // Confusion to the enemy
      return res.status(404).send('not found');
    }

    var id = self.apos.launder.id(req.body.id);
    var doc;
    var commit;
    var modifiedFields;

    return async.series([
      find, getModifiedFields, after
    ], function(err) {
      if (err) {
        console.error(err);
        return res.status(500).send('error');
      }
      return res.send(self.render(req, 'review-modal.html', { commit: commit, doc: commit.to, modifiedFields: modifiedFields }));
    });
    
    function find(callback) {
      return self.findDocAndCommit(req, id, function(err, doc, _commit) {
        if (err) {
          return callback(err);
        }
        if (!_commit) {
          return callback('notfound');
        }
        commit = _commit;
        return callback(null);
      });
    }
    
    function getModifiedFields(callback) {
      return self.getModifiedFields(req, commit.to, commit.from, function(err, _modifiedFields) {
        if (err) {
          return callback(err);
        }
        modifiedFields = _modifiedFields;
        return callback(null);
      });
    }
    
    function after(callback) {
      return self.after(req, commit.to, callback);
    }

  });

  self.route('post', 'export-modal', function(req, res) {
    if (!req.user) {
      // Confusion to the enemy
      return res.status(404).send('not found');
    }
    // commit id
    var id = self.apos.launder.id(req.body.id);
    return self.findDocAndCommit(req, id, function(err, doc, commit) {
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

  self.route('post', 'force-export-widget-modal', function(req, res) {
    if (!req.user) {
      // Confusion to the enemy
      return res.status(404).send('not found');
    }
    // doc id
    var id = self.apos.launder.id(req.body.id);
    // id of widget
    var widgetId = self.apos.launder.id(req.body.widgetId);
    
    return self.findDocForEditing(req, id, function(err, doc) {
      if (err) {
        console.error(err);
        return res.status(500).send('error');
      }
      if (!doc) {
        return res.status(404).send('notfound');
      }
      return res.send(self.render(req, 'force-export-widget-modal.html', { doc: doc, nestedLocales: self.nestedLocales, widgetId: widgetId }));
    });
  });

  self.route('post', 'force-export-modal', function(req, res) {
    if (!req.user) {
      // Confusion to the enemy
      return res.status(404).send('not found');
    }
    // doc id
    var id = self.apos.launder.id(req.body.id);
    
    return self.findDocForEditing(req, id, function(err, doc) {
      if (err) {
        console.error(err);
        return res.status(500).send('error');
      }
      if (!doc) {
        return res.status(404).send('notfound');
      }
      return res.send(self.render(req, 'force-export-modal.html', { doc: doc, nestedLocales: self.nestedLocales }));
    });
  });
  
  self.route('post', 'diff', function(req, res) {

    if (!req.user) {
      // Confusion to the enemy
      return res.status(404).send('not found');
    }

    var id = self.apos.launder.id(req.body.id);
    var commitId = self.apos.launder.id(req.body.commitId);
    var draft, live;

    return async.series([
      getContent,
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
      
      // console.log(JSON.stringify(live, null, '  '), JSON.stringify(draft, null, '  '));

      return res.send({
        status: 'ok',
        diff: diff.diff(
          live, draft
        ),
        id: id
      });
      
    });
    
    function getContent(callback) {
      if (commitId) {
        return getCommit(callback);
      } else {
        return getDraftAndLive(callback);
      }
    }
    
    function getCommit(callback) {
      return self.findDocAndCommit(req, commitId, function(err, doc, commit) {
        if (err) {
          return callback(err);
        }
        if (!commit) {
          return callback('notfound');
        }
        id = doc._id;
        live = self.apos.utils.clonePermanent(commit.to);
        draft = self.apos.utils.clonePermanent(commit.from);
        return callback(null);
      });
    }

    function getDraftAndLive(callback) {
      return self.getDraftAndLive(req, id, {}, function(err, _draft, _live) {
        if (err) {
          return callback(err);
        }
        live = self.apos.utils.clonePermanent(_live);
        draft = self.apos.utils.clonePermanent(_draft);
        return callback(null);
      });
    }
    
    function resolveRelationships(callback) {
      var resolve = [];
      // You'd think it would be obvious which of these has a -draft locale suffix,
      // but let's be flexible to allow for different scenarios
      if (!draft.workflowLocale.match(/\-draft$/)) {
        resolve.push(draft);
      }
      if (!live.workflowLocale.match(/\-draft$/)) {
        resolve.push(live);
      }
      // We're going in this direction for visual diff ONLY
      return async.eachSeries(resolve, function(version, callback) {
        return self.resolveRelationships(req, version, self.draftify(version.workflowLocale), callback);
      }, callback);
    }

  });

};
