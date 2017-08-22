var async = require('async');
var _ = require('lodash');
var deep = require('deep-get-set');

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

        // Resolve relationship ids to point to the locale the patch is coming from,
        // so that the diff applies properly
        function resolveToSource(callback) {
          return self.resolveRelationships(req, draft, to.workflowLocale, callback);
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
      return self.findDocs(req, { _id: id }).toObject(function(err, doc) {
        if (err) {
          return callback(err);
        }
        if (!(doc && doc._edit)) {
          return callback('notfound');
        }
        original = doc;
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

          var widgetInfo = self.apos.utils.findNestedObjectAndDotPathById(resolvedOriginal, widgetId);

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
        return self.findDocs(req, { _id: id }, self.draftify(req.locale)).toObject(function(err, obj) {
          if (err) {
            return callback(err);
          }
          if ((!obj) || (!obj._edit)) {
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
      return self.findDocs(req, { _id: id }).toObject(function(err, obj) {
        if (err) {
          return callback(err);
        }
        if (!(obj && obj._edit)) {
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
      return res.send(self.render(req, 'manage-modal.html', { submitted: submitted, label: self.locales[req.locale].label || req.locale }));
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
      var preview;
      var module = self.apos.docs.getManager(draft.type);
      preview = module && module.workflowPreview && module.workflowPreview(req, live, draft);
      if (preview) {
        preview = self.apos.templates.safe(preview);
      }
      return res.send(self.render(req, 'commit-modal.html', {
        doc: draft,
        modifiedFields: modifiedFields,
        index: index,
        total: total,
        lead: lead,
        preview: preview
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
      return res.status(404).send('notfound');
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

  // Similar to editable, this route answers a simpler question:
  // can I commit the doc with the given type and, if it already
  // exists, id? Used to control the visibility of the workflow
  // actions in the piece and page settings modals. We already
  // know we can edit the draft at that point.

  self.route('post', 'committable', function(req, res) {
    if (!req.user) {
      res.status(404).send('notfound');
    }
    var id = self.apos.launder.id(req.body.id);
    var type = self.apos.launder.string(req.body.type);
    if (!self.includeType(type)) {
      // Workflow not really relevant here
      return res.send({ status: 'no' });
    }
    if (!id) {
      // Generic case: can we create one in the live locale?
      var _req = _.clone(req);
      _req.locale = self.liveify(_req.locale);
      var response = self.apos.permissions.can(_req, 'edit-' + type);
      if (response) {
        return res.send({ status: 'ok' });
      } else {
        return res.send({ status: 'no' });
      }
    }
    // Specific case (existing piece or page)
    return self.getDraftAndLive(req, id, {}, function(err, draft, live) {
      if (err) {
        return res.send({ status: 'error' });
      }
      if (!live._edit) {
        return res.send({ status: 'no' });
      }
      return res.send({ status: 'ok' });
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
      var preview;
      var module = self.apos.docs.getManager(commit.from.type);
      preview = module && module.workflowPreview && module.workflowPreview(req, commit.to, commit.from);
      if (preview) {
        preview = self.apos.templates.safe(preview);
      }
      return res.send(self.render(req, 'review-modal.html', { preview: preview, commit: commit, doc: commit.to, modifiedFields: modifiedFields }));
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
      return self.after(req, [ commit.to ], callback);
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
      var nestedLocales = self.getEditableNestedLocales(req, doc);
      return res.send(self.render(req, 'export-modal.html', { commit: commit, nestedLocales: nestedLocales }));
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
    return self.findDocs(req, { _id: id }).toObject(function(err, doc) {
      if (err) {
        console.error(err);
        return res.status(500).send('error');
      }
      if (!(doc && doc._edit)) {
        return res.status(404).send('notfound');
      }
      var nestedLocales = self.getEditableNestedLocales(req, doc);
      return res.send(self.render(req, 'force-export-widget-modal.html', { doc: doc, nestedLocales: nestedLocales, widgetId: widgetId }));
    });
  });

  self.route('post', 'force-export-modal', function(req, res) {
    if (!req.user) {
      // Confusion to the enemy
      return res.status(404).send('not found');
    }
    // doc id
    var id = self.apos.launder.id(req.body.id);
    
    return self.findDocs(req, { _id: id }).toObject(function(err, doc) {
      if (err) {
        console.error(err);
        return res.status(500).send('error');
      }
      if (!(doc && doc._edit)) {
        return res.status(404).send('notfound');
      }
      var nestedLocales = self.getEditableNestedLocales(req, doc);
      return res.send(self.render(req, 'force-export-modal.html', { doc: doc, nestedLocales: nestedLocales }));
    });
  });
  
  self.route('post', 'diff', function(req, res) {

    if (!req.user) {
      // Confusion to the enemy
      return res.status(404).send('not found');
    }

    var id = self.apos.launder.id(req.body.id);
    var commitId = self.apos.launder.id(req.body.commitId);
    var diff = [];
    var draft, live;

    return async.series([
      getContent,
      // Resolve the joins in the live doc to point to the draft's docs, so we don't get false
      // positives for changes in the diff. THIS IS RIGHT FOR VISUAL DIFF, WOULD BE VERY WRONG
      // FOR APPLYING DIFF, for that we go in the opposite direction
      resolveRelationships,
      generateDiff
    ], function(err) {

      if (err) {
        console.error(err);
        return res.send({ status: 'error' });
      }
      
      return res.send({
        status: 'ok',
        diff: diff,
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
    
    function generateDiff(callback) {
      self.deleteExcludedProperties(live);
      self.deleteExcludedProperties(draft);
      return self.applyPatch(live, draft, diff, callback);
    }

  });

  self.route('get', 'link-to-locale', function(req, res) {
    var slug = req.query.slug;
    var locale = req.query.locale;
    var criteria = {
      slug: slug,
    };
    if (_.has(self.locales, locale)) {
      req.locale = locale;
    }
    return self.apos.docs.find(req, criteria).published(null).toObject(function(err, doc) {
      if (doc._url) {
        // Last step is to use the workflowLocale query parameter to
        // disambiguate cases where locales have the same URL, which
        // seems pretty silly but can happen in dev
        return res.redirect(self.apos.urls.build(doc._url, { workflowLocale: locale }));
      } else {
        return res.status(404).send('not found');
      }
    });
  });
};
