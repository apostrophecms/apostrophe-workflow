var async = require('async');
var _ = require('lodash');
var deep = require('deep-get-set');
var qs = require('qs');

module.exports = function(self, options) {
  self.route('post', 'commit', function(req, res) {
    return self.commitLatest(req, req.body.id, function(err, commitId, title) {
      if (err) {
        console.error(err);
        return res.send({ status: 'error' });
      }
      return res.send({ status: 'ok', commitId: commitId, title: title });
    });
  });

  self.route('post', 'batch-commit', function(req, res) {
    return self.apos.modules['apostrophe-jobs'].run(req, function(req, id, callback) {
      return self.commitLatest(req, id, callback);
    }, {
      labels: {
        title: 'Commit'
      }
    });
  });

  self.route('post', 'revert', function(req, res) {
    var id = self.apos.launder.id(req.body.id);
    return self.revert(req, id, function(err, results) {
      if (err) {
        return res.send({
          status: (typeof (err) === 'string') ? err : 'error'
        });
      }
      return res.send(_.assign({
        status: 'ok'
      }, results));
    });
  });

  self.route('post', 'export', function(req, res) {
    var id = self.apos.launder.id(req.body.id);
    return self.export(req, id, req.body.locales, function(err, results) {
      if (err) {
        return res.send({
          status: (typeof (err) === 'string') ? err : 'error'
        });
      }
      return res.send(_.assign({
        status: 'ok'
      }, results));
    });
  });

  self.route('post', 'batch-export', function(req, res) {
    return self.apos.modules['apostrophe-jobs'].run(req, function(req, id, callback) {
      return self.export(req, id, req.body.locales, callback);
    }, {
      labels: {
        title: 'Export'
      }
    });
  });

  self.route('post', 'force-export', function(req, res) {
    return self.forceExport(req, req.body.id, req.body.locales, function(err, results) {
      if (err) {
        console.error(err);
        return res.send({ status: 'error' });
      }
      // Here the `errors` object has locales as keys and strings as values; these can be
      // displayed or, since they are technical, just flagged as locales to which the patch
      // could not be successfully applied
      return res.send(_.assign({
        status: 'ok'
      }, results));
    });
  });

  self.route('post', 'batch-force-export', function(req, res) {
    return self.apos.modules['apostrophe-jobs'].run(req, function(req, id, callback) {
      return self.forceExport(req, id, req.body.locales, callback);
    }, {
      labels: {
        title: 'Force Export'
      }
    });
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
    var original;
    if (Array.isArray(req.body.locales)) {
      locales = _.filter(req.body.locales, function(locale) {
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
            try {
              if ((!areaParentDotPath.length) || (deep(areaParentDotPath))) {
                deep(draft, areaDotPath, { type: 'area', items: [ widgetInfo.object ] });
                return true;
              }
            } catch (e) {
              // intervening context does not exist
              return false;
            }
          }

          function getParentDotPath(dotPath) {
            return dotPath.replace(/^[^.]+$|\.[^.]+$/, '');
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
        if (doc.workflowLocale && self.hostnames) {
          // Make sure we have an absolute url, parse it, change the hostname,
          // format it again
          var live = self.liveify(doc.workflowLocale);
          if (self.hostnames[live]) {
            var url = require('url');
            var parsedUrl = url.parse(url.resolve(req.absoluteUrl, doc._url));
            parsedUrl.hostname = self.hostnames[live];
            parsedUrl.host = parsedUrl.hostname + ((parsedUrl.port) ? (':' + parsedUrl.port) : '');
            doc._url = url.format(parsedUrl);
          }
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
      if (err) {
        console.error(err);
        return;
      }
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
    var localizations;
    var workflowGuid = self.apos.launder.id(req.body.workflowGuid);
    var crossDomainSessionToken;
    return async.series([ getLocalizations, getCrossDomainSessionToken ], function(err) {
      if (err) {
        console.error(err);
        res.status(500).send('error');
      }
      return res.send(self.render(req, 'locale-picker-modal.html', {
        workflowGuid: workflowGuid,
        workflowMode: req.session.workflowMode,
        localizations: localizations,
        nestedLocales: self.nestedLocales,
        crossDomainSessionToken: crossDomainSessionToken
      }));
    });
    function getLocalizations(callback) {
      return self.getLocalizations(req, workflowGuid, req.session.workflowMode === 'draft', function(err, _localizations) {
        localizations = _localizations;
        return callback(err);
      });
    }
    function getCrossDomainSessionToken(callback) {
      crossDomainSessionToken = self.apos.utils.generateId();
      return self.crossDomainSessionCache.set(crossDomainSessionToken, JSON.stringify(req.session), 60 * 60, callback);
    }
  });

  self.route('post', 'locale-unavailable-modal', function(req, res) {
    var locale = self.apos.launder.string(req.body.locale);
    var workflowGuid = self.apos.launder.id(req.body.workflowGuid);
    if (!(locale && workflowGuid)) {
      return res.status(400).send('bad request');
    }
    return self.getAvailability(req, workflowGuid, locale, function(err, status, doc) {
      if (err || (status === 'notfound')) {
        console.error(err, status);
        return res.status(500).send('error');
      }
      return res.send(self.render(req, 'locale-unavailable-modal', { status: status, mode: req.session.workflowMode, workflowGuid: workflowGuid, locale: locale }));
    });
  });

  self.route('post', 'activate', function(req, res) {
    if (!req.user) {
      // Confusion to the enemy
      return res.status(404).send('not found');
    }
    var locale = self.apos.launder.string(req.body.locale);
    var workflowGuid = self.apos.launder.id(req.body.workflowGuid);
    var status;
    var doc;
    var reachable = false;
    if (!(locale && workflowGuid)) {
      return res.status(400).send('bad request');
    }
    return async.series([
      getAvailability,
      changeAvailability,
      fixUrl,
      addToken
    ], function(err) {
      if (err || (!doc)) {
        self.apos.utils.error(err || 'notfound');
        return res.send({ status: 'error' });
      }
      return res.send({ status: 'ok', url: doc._url });
    });

    function getAvailability(callback) {
      return self.getAvailability(req, workflowGuid, self.draftify(locale), function(err, _status, _doc) {
        if (err) {
          return callback(err);
        }
        status = _status;
        doc = _doc;
        return callback(null);
      });
    }

    function changeAvailability(callback) {
      if (status === 'inTrash') {
        reachable = true;
        var localeWas = req.locale;
        req.locale = self.draftify(locale);
        return self.apos.docs.rescue(req, { _id: doc._id }, function(err) {
          req.locale = localeWas;
          return callback(err);
        });
      } else if (status === 'newInTrash') {
        // Force an export
        reachable = true;
        return forceExport(callback);
      } else if (status === 'available') {
        reachable = true;
        return callback(null);
      } else if (status === 'notfound') {
        reachable = false;
        return callback(null);
      }
    }

    function forceExport(callback) {
      var original;
      return async.series([
        getOriginal,
        force
      ], callback);
      function getOriginal(callback) {
        return self.apos.docs.find(req, { workflowGuid: workflowGuid }).trash(null).published(null).toObject(function(err, _original) {
          if (err) {
            return callback(err);
          }
          if (!_original) {
            return callback('notfound');
          }
          original = _original;
          return callback(null);
        });
      }
      function force(callback) {
        return self.forceExport(req, original._id, [ locale ], callback);
      }
    }

    function fixUrl(callback) {
      if (!reachable) {
        return callback(null);
      }
      // export may have changed the slug so fetch it again
      var localeWas = req.locale;
      req.locale = doc.workflowLocale;
      return self.apos.docs.find(req, { _id: doc._id }).toObject(function(err, _doc) {
        req.locale = localeWas;
        if (!_doc) {
          err = 'notfound';
        }
        if (err) {
          return callback(err);
        }
        doc = _doc;
        doc._url = self.action + '/link-to-locale?' + qs.stringify({
          slug: doc.slug,
          locale: doc.workflowLocale
        });
        return callback(null);
      });
    }

    function addToken(callback) {
      var crossDomainSessionToken = self.apos.utils.generateId();
      return self.crossDomainSessionCache.set(crossDomainSessionToken, JSON.stringify(req.session), 60 * 60, function(err) {
        if (err) {
          return callback(err);
        }
        doc._url = self.apos.urls.build(doc._url, { workflowCrossDomainSessionToken: crossDomainSessionToken, cb: Math.random().toString().replace('.', '') });
        return callback(null);
      });
    }

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
    var draft, live, modifiedFields;
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

  // Given body.id and body.exportLocales, this route answers with an object
  // with an ids property containing an array of related ids that have
  // never been exported to at least one of the given locales from this locale.
  //
  // id is a commit id, not a doc id. The ids returned are also commit ids,
  // not doc ids. This is correct for passing them to the export method on
  // the browser side.
  //
  // The commit ids returned are the most recent for the related docs in question.

  self.route('post', 'related-unexported', function(req, res) {
    var id = self.apos.launder.id(req.body.id);

    var exportLocales = self.apos.launder.strings(req.body.exportLocales);
    exportLocales = _.filter(exportLocales, function(locale) {
      return locale !== self.liveify(req.locale);
    });
    var doc;
    var docIds = [];
    var ids = [];
    var related;
    var idsByGuid = {};

    return async.series([
      getDoc,
      getRelated,
      getWorkflowGuids,
      getLocalizations,
      getLatestCommits
    ], function(err) {
      if (err) {
        return fail(err);
      }
      ids = _.uniq(ids);
      return res.send({ status: 'ok', ids: ids });
    });

    function getDoc(callback) {
      return self.findDocAndCommit(req, id, function(err, _doc, _commit) {
        doc = _doc;
        if (!doc) {
          return callback('notfound');
        }
        return callback(err);
      });
    }

    function getRelated(callback) {
      return self.getRelated([ doc ], function(err, results) {
        related = results;
        related = _.map(related, function(relatedOne) {
          if (relatedOne && relatedOne.relationship && relatedOne.item) {
            return relatedOne.item;
          } else {
            return relatedOne;
          }
        });
        // Discard unless something is actually joined
        related = _.filter(related, function(relatedOne) {
          return !!relatedOne;
        });
        var seen = {};
        related = _.filter(related, function(relatedOne) {
          if (!seen[relatedOne._id]) {
            seen[relatedOne._id] = true;
            return true;
          }
        });
        return callback(err);
      });
    }

    // Due to join projections we often do not know the guids
    // of the related docs yet, and even sometimes the type as well
    function getWorkflowGuids(callback) {
      return self.apos.docs.db.find(
        { _id: { $in: _.pluck(related, '_id') } },
        { _id: 1, workflowGuid: 1, type: 1 }
      ).toArray(function(err, guidDocs) {
        if (err) {
          return fail(err);
        }
        _.each(guidDocs, function(guidDoc) {
          var relatedOne = _.find(related, { _id: guidDoc._id });
          if (relatedOne) {
            relatedOne.workflowGuid = guidDoc.workflowGuid;
            idsByGuid[relatedOne.workflowGuid] = relatedOne._id;
            relatedOne.type = guidDoc.type;
          }
        });
        // Discard unless the type is known, the type is subject to
        // workflow and we have the workflowGuid
        related = _.filter(related, function(relatedOne) {
          return relatedOne.type && relatedOne.workflowGuid && self.includeType(relatedOne.type);
        });
        return callback(null);
      });
    }

    function getLocalizations(callback) {
      return async.eachSeries(related, function(relatedOne, callback) {
        if (!relatedOne.workflowLocale) {
          // Not subject to workflow
          return setImmediate(callback);
        }
        return self.apos.docs.db.find({ workflowGuid: relatedOne.workflowGuid }).toArray(function(err, localizations) {
          if (err) {
            return callback(err);
          }
          var accountedFor = 0;
          _.each(localizations, function(localization) {
            if (!localization.workflowLocale.match(/-draft$/)) {
              return;
            }
            if (!_.contains(exportLocales, self.liveify(localization.workflowLocale))) {
              return;
            }
            if (!localization.trash) {
              accountedFor++;
            } else if (localization.workflowImportedFrom && localization.workflowImportedFrom[self.liveify(relatedOne.workflowLocale)]) {
              accountedFor++;
            }
          });
          if (accountedFor < exportLocales.length) {
            docIds.push(idsByGuid[relatedOne.workflowGuid]);
          }
          return callback(null);
        });
      }, callback);
    }

    function getLatestCommits(callback) {
      return async.eachSeries(docIds, function(docId, callback) {
        return self.db.find({ 'from._id': docId }, { _id: 1 }).sort({ createdAt: -1 }).toArray(function(err, commits) {
          if (err) {
            return callback(err);
          }
          if (commits[0]) {
            ids.push(commits[0]._id);
          }
          return callback(null);
        });
      }, callback);
    }

    function fail(err) {
      console.error(err);
      return res.send({ status: 'error' });
    }
  });

  // Given a doc `id`, this route replies with
  // `{ locales: [ 'en', 'fr' ] }`, where the returned
  // locales are those for which the current user has
  // editing privileges for docs of the same type as `id`.

  self.route('post', 'editable-locales', function(req, res) {
    return self.apos.docs.find(req, { _id: req.body.id }).toObject(function(err, doc) {
      if (err) {
        console.error(err);
        return res.send({ status: 'error' });
      }
      if (!doc) {
        return res.send({ status: 'notfound' });
      }
      return res.send({
        status: 'ok',
        locales: self.getEditableLocales(req, doc)
      });
    });
  });

  self.route('post', 'review-modal', function(req, res) {

    if (!req.user) {
      // Confusion to the enemy
      return res.status(404).send('not found');
    }

    var id = self.apos.launder.id(req.body.id);
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

  self.route('post', 'batch-export-modal', function(req, res) {
    if (!req.user) {
      // Confusion to the enemy
      return res.status(404).send('not found');
    }
    // commit ids
    var ids = self.apos.launder.ids(req.body.ids);
    if (!ids.length) {
      return res.status(404).send('not found');
    }
    // Use the first doc as a representative example
    return self.findDocAndCommit(req, ids[0], function(err, doc, commit) {
      if (err) {
        console.error(err);
        return res.status(500).send('error');
      }
      if (!commit) {
        return res.send({ status: 'notfound' });
      }
      var nestedLocales = self.getEditableNestedLocales(req, doc);
      return res.send(self.render(req, 'batch-export-modal.html', { ids: ids, locale: self.liveify(doc.workflowLocale), nestedLocales: nestedLocales }));
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

  self.route('post', 'batch-force-export-modal', function(req, res) {
    if (!req.user) {
      // Confusion to the enemy
      return res.status(404).send('not found');
    }
    var ids = self.apos.launder.ids(req.body.ids);
    if (!ids.length) {
      return res.status(404).send('not found');
    }
    // Representative example
    return self.findDocs(req, { _id: ids[0] }).toObject(function(err, doc) {
      if (err) {
        console.error(err);
        return res.status(500).send('error');
      }
      if (!(doc && doc._edit)) {
        return res.status(404).send('notfound');
      }
      var nestedLocales = self.getEditableNestedLocales(req, doc);
      return res.send(self.render(req, 'batch-force-export-modal.html', { ids: ids, locale: self.liveify(doc.workflowLocale), nestedLocales: nestedLocales }));
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
      if (!draft.workflowLocale.match(/-draft$/)) {
        resolve.push(draft);
      }
      if (!live.workflowLocale.match(/-draft$/)) {
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
      slug: slug
    };
    if (_.has(self.locales, locale)) {
      req.locale = locale;
    }
    if (req.query.workflowCrossDomainSessionToken) {
      // Accept a cross-domain session identifier first;
      // it'll redirect back without this parameter
      return self.acceptCrossDomainSessionToken(req);
    }
    return self.apos.docs.find(req, criteria).published(null).toObject(function(err, doc) {
      if (err) {
        self.apos.utils.error(err);
        return res.status(500).send('error');
      }
      if (doc && doc._url) {
        // Last step is to use the workflowLocale query parameter to
        // disambiguate cases where locales have the same URL, which
        // seems pretty silly but can happen in dev
        return res.redirect(self.apos.urls.build(doc._url, { workflowLocale: locale }));
      } else {
        self.apos.utils.error('link-to-locale: No doc found for slug "' + req.query.slug + '" and locale "' + req.query.locale + '"');
        return res.status(404).send('not found');
      }
    });
  });

};
