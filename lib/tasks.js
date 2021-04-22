const _ = require('@sailshq/lodash');
const async = require('async');
const jsonDiff = require('json-diff').diffString;
const Promise = require('bluebird');

// Direct use of `console` makes sense here because
// we're implementing an interaction at the CLI.
// -Tom

/* eslint-disable no-console */

module.exports = function(self, options) {
  self.enableAddMissingLocalesTask = function() {
    self.apos.tasks.add(self.__meta.name, 'add-missing-locales',
      'Generally no longer necessary to run yourself, as it will run automatically as you add locales. Run this task after adding new locales or setting up the module for the first time. If you are using the replicateAcrossLocales: false option, you may wish to specify --replicate-related-documents=locale-x,locale-y,locale-z as when you do so documents related to the parked pages and global document are copied from the parent locale. However this, too, happens automatically on the first normal startup or migration run of Apostrophe with new locales.',
      self.addMissingLocalesTask
    );
  };

  self.enableAddLocalePrefixesTask = function() {
    self.apos.tasks.add(self.__meta.name, 'add-locale-prefixes',
      'Run this task after turning on "prefixes: true" on an existing site.',
      self.addLocalePrefixesTask
    );
  };

  self.enableRemoveNumberedParkedPagesTask = function() {
    self.apos.tasks.add(self.__meta.name, 'remove-numbered-parked-pages',
      'One-time fix for very early users of this module who have duplicate parked pages due to an early oversight in the code. Use of this task is NOT recommended or necessary for new projects.',
      self.removeNumberedParkedPagesTask
    );
  };

  self.enableResolveJoinIdsTask = function() {
    self.apos.tasks.add(self.__meta.name, 'resolve-join-ids',
      'One-time fix for join ids not pointing to the right locale',
      self.resolveJoinIdsTask
    );
  };

  self.enableHarmonizeWorkflowGuidsByParkedIdTask = function() {
    self.apos.tasks.add(self.__meta.name, 'harmonize-workflow-guids-by-parked-id',
      'One-time fix for legacy workflow guids for the same parkedId not being consistent',
      self.harmonizeWorkflowGuidsByParkedIdTask
    );
  };

  self.enableDiffDraftAndLiveTask = function() {
    self.addTask('diff-draft-and-live',
      'Display a diff of the differences between the draft and live versions\n' +
      'of the document specified by draft _id as the first argument.',
      self.diffDraftAndLiveTask
    );
  };

  self.enableReplicateLocaleTask = function() {
    self.addTask('replicate-locale',
      'Call with --from=locale1 --to=locale2. locale1, which must already have content,\n' +
      'is replicated to locale2, DELETING ALL EXISTING CONTENT in locale2.\n' +
      'This is occasionally a helpful convenience for new locales when the\n' +
      'replicateAcrossLocales option is set to false but you wish to make an\n' +
      'exception for a particular new locale.\n\n' +
      'If you did significant work in locale2 prior to deciding to replace it with\n' +
      'a copy of locale1, and there are already attachments referenced by locale2,\n' +
      'you should run the apostrophe-attachments:recompute-all-doc-references task\n' +
      'after this task. If you have not done any work yet in locale2 this is not\n' +
      'necessary, so it is not done by default.',
      self.replicateLocaleTask
    );
  };

  // Run the given function inside the apostrophe-pages:parked lock, which
  // in the presence of workflow is the general purpose lock for major
  // overhauls of aposDocs. The function must take a callback.

  self.withLock = function(fn, callback) {
    return self.apos.locks.withLock('apostrophe-pages:parked', fn, callback);
  };

  self.addMissingLocalesTask = function(apos, argv, callback) {
    var req = self.apos.tasks.getReq();
    return self.withLock(fix, callback);
    function fix(callback) {
      self.apos.utils.info('add-missing-locales in progress');
      return async.series([
        fixIndexes,
        noLocales,
        replicateRelatedDocuments,
        missingSomeLocalesDraft,
        missingSomeLocalesLive,
        resolve
      ], function(err) {
        if (err) {
          return callback(err);
        }
        self.apos.utils.info('add-missing-locales completed');
        return callback(null);
      });
    }

    function fixIndexes(callback) {
      self.apos.utils.info('Fixing indexes...');
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
        var existing = _.find(old, function(index) {
          return index.key && index.key.slug && (!index.key.workflowLocale);
        });
        if (!existing) {
          return callback(null);
        }
        return self.apos.docs.db.dropIndex(existing.name, callback);
      }
      function dropOldPath(callback) {
        var existing = _.find(old, function(index) {
          if (!index.unique) {
            return;
          }
          return index.key && index.key.path && (!index.key.workflowLocale) && (!index.key.workflowLocaleForPathIndex);
        });
        if (!existing) {
          return callback(null);
        }
        return self.apos.docs.db.dropIndex(existing.name, callback);
      }
    }

    function replicateRelatedDocuments(callback) {
      const replicateRelatedDocumentsTo = argv['replicate-related-documents'] ? argv['replicate-related-documents'].split(',') : [];
      return self.replicateRelatedDocuments(replicateRelatedDocumentsTo).then(function() {
        // Avoid unconsumed promise warning
        callback(null);
        return null;
      }).catch(callback);
    }

    function noLocales(callback) {
      self.apos.utils.info('Fixing documents with no locales...');
      return self.apos.migrations.eachDoc({ workflowLocale: { $exists: 0 } }, 5, function(doc, callback) {
        if (!self.includeType(doc.type)) {
          return setImmediate(callback);
        }
        doc.workflowLocale = self.defaultLocale;
        doc.workflowResolveDeferred = true;
        self.ensureWorkflowLocaleForPathIndex(doc);
        doc.workflowGuid = self.apos.utils.generateId();
        return self.apos.docs.update(req, doc, { workflowMissingLocalesLive: argv.live ? true : 'liveOnly' }, callback);
      }, callback);
    }

    function missingSomeLocalesDraft(callback) {
      self.apos.utils.info('Fixing documents missing some locales in draft...');
      return self.addMissingLocales(req, { workflowMissingLocalesSubset: 'draft' }, callback);

    }

    function missingSomeLocalesLive(callback) {
      self.apos.utils.info('Fixing documents missing some locales in live...');
      return self.addMissingLocales(req, { workflowMissingLocalesSubset: 'live' }, callback);

    }

    function resolve(callback) {
      self.apos.utils.info('Resolving deferred join relationships efficiently...');
      return self.resolveDeferredRelationships(callback);
    }

  };

  self.resolveJoinIdsTask = function(apos, argv, callback) {

    return async.series([
      update,
      resolve
    ], function(err) {
      return callback(err);
    });

    function update(callback) {
      return self.apos.docs.db.update({
        workflowLocale: { $exists: 1 }
      }, {
        $set: {
          workflowResolveDeferred: true
        }
      },
      {
        multi: true
      },
      callback);
    }

    function resolve(callback) {
      return self.resolveDeferredRelationships(callback);
    }

  };

  self.addLocalePrefixesTask = function(apos, argv, callback) {
    return self.updateLocalePrefixes(callback);
  };

  self.removeNumberedParkedPagesTask = function(apos, argv, callback) {
    return self.apos.docs.db.remove({
      parked: { $exists: 1 },
      slug: /^\/.*\d+$/
    }, callback);
  };

  self.harmonizeWorkflowGuidsByParkedIdTask = function(apos, argv, callback) {
    var pages;
    return async.series([ crossCorrectPass, find, update ], callback);

    // First pass: for some workflowGuids, only some of the locales
    // have a parkedId, due to various catch-22's. Give them all a
    // parkedId.
    function crossCorrectPass(callback) {
      return async.series([ find, correct ], callback);
      function find(callback) {
        return self.apos.docs.db.findWithProjection({ parkedId: { $exists: 1 } }).toArray(function(err, _pages) {
          if (err) {
            return callback(err);
          }
          pages = _pages;
          return callback(null);
        });
      }
      function correct(callback) {
        var parkedIdsByWorkflowGuid = {};
        _.each(pages, function(page) {
          parkedIdsByWorkflowGuid[page.workflowGuid] = page.parkedId;
        });
        return async.eachSeries(_.keys(parkedIdsByWorkflowGuid), function(workflowGuid, callback) {
          return self.apos.docs.db.update({
            workflowGuid: workflowGuid
          }, {
            $set: {
              parkedId: parkedIdsByWorkflowGuid[workflowGuid]
            }
          }, {
            multi: true
          }, callback);
        }, callback);
      }
    }
    // Second pass: for all of the parked ids, make sure the workflowGuids
    // are the same. Where they are not the same map to the most common one.
    function find(callback) {
      return self.apos.docs.db.findWithProjection({ parkedId: { $exists: 1 } }).toArray(function(err, _pages) {
        if (err) {
          return callback(err);
        }
        pages = _pages;
        return callback(null);
      });
    }
    function update(callback) {
      var parkedIds = _.uniq(_.map(pages, 'parkedId'));
      var updates = [];
      var losers = [];
      _.each(parkedIds, function(parkedId) {
        var relevant = _.filter(pages, { parkedId: parkedId });
        var byGuid = _.groupBy(relevant, 'workflowGuid');
        if (_.keys(byGuid).length <= 1) {
          return;
        }
        var guids = _.uniq(_.map(relevant, 'workflowGuid'));
        guids.sort(function(a, b) {
          if (byGuid[a].length < byGuid[b].length) {
            return 1;
          } else if (byGuid[a].length > byGuid[b].length) {
            // We want the most popular guid to be [0]
            return -1;
          } else {
            return 0;
          }
        });
        var winner = guids[0];
        self.apos.utils.warn('Multiple workflowGuids for parkedId ' + parkedId + ', correcting to ' + winner);
        // If a given locale already appears with this parkedId
        // for the winning parkedId, then we can't merge this one
        // in
        var winnerLocales = _.map(_.filter(pages, { workflowGuid: winner }), 'workflowLocale');
        losers = losers.concat(_.map(_.filter(pages, function(page) {
          return ((page.parkedId === parkedId) && (page.workflowGuid !== winner) && _.includes(winnerLocales, page.workflowLocale));
        }), '_id'));
        updates.push([
          {
            workflowGuid: {
              $in: guids.slice(1)
            },
            parkedId: parkedId
          }, {
            $set: {
              workflowGuid: winner
            }
          }
        ]);
      });
      return async.series([
        removeLosers, execUpdates
      ], callback);
      function removeLosers(callback) {
        if (!losers.length) {
          return callback(null);
        }
        self.apos.utils.warn('Can only keep one per locale/guid combination, removing: ', losers);
        return self.apos.docs.db.remove({ _id: { $in: losers } }, callback);
      }
      function execUpdates(callback) {
        return async.eachSeries(updates, function(update, callback) {
          return self.apos.docs.db.update(update[0], update[1], { multi: true }, callback);
        }, callback);
      }
    }
  };

  self.diffDraftAndLiveTask = function(apos, argv, callback) {
    var req;
    var draft;
    var modified;
    var diffDraft;
    var diffLive;
    if (!argv._[1]) {
      throw 'Specify the _id of a draft document as the sole argument after the task name.';
    }
    return async.series([
      determineLocale,
      isModified,
      diff
    ], callback);

    function determineLocale(callback) {
      return self.apos.docs.db.findOne({ _id: argv._[1] }, function(err, _draft) {
        if (err) {
          return callback(err);
        }
        if (!_draft) {
          return callback('not found');
        }
        draft = _draft;
        req = self.apos.tasks.getReq({ locale: draft.workflowLocale });
        return callback(null);
      });
    }

    function isModified(callback) {
      return self.isModified(req, draft, function(err, _modified, _diffDraft, _diffLive) {
        if (err) {
          return callback(err);
        }
        modified = _modified;
        diffDraft = _diffDraft;
        diffLive = _diffLive;
        return callback(null);
      });
    }

    function diff(callback) {
      if (!modified) {
        // eslint-disable-next-line no-console
        console.log('The draft and live documents are equivalent.');
        return callback(null);
      }
      // eslint-disable-next-line no-console
      console.log(jsonDiff(diffDraft, diffLive));
      return callback(null);
    }
  };

  self.dereplicateTask = function() {
    return self.apos.docs.db.aggregate([
      {
        $match: {
          workflowLocale: { $exists: 1 },
          trash: {
            $ne: true
          }
        }
      },
      {
        $group: {
          _id: "$workflowGuid",
          count: { $sum: 1 },
          workflowLocales: { $push: "$workflowLocale" }
        }
      },
      {
        $match: {
          count: {
            // Either it's valid in draft and trash in live for its original locale
            // or it's valid in both for its original locale. If it is trash in
            // every locale it doesn't fit the profile and we should leave it alone
            $gte: 1,
            $lte: 2
          }
        }
      }
    ]).toArray().then(function(orphans) {
      if (!orphans.length) {
        return;
      }
      var bulk = self.apos.docs.db.initializeUnorderedBulkOp();
      var count = 0;
      orphans.forEach(function(orphan) {
        var c = bulk.find({
          workflowGuid: orphan._id,
          workflowLocale: {
            $nin: [
              self.draftify(orphan.workflowLocales[0]),
              self.liveify(orphan.workflowLocales[0])
            ]
          }
        });
        c.remove();
        count++;
      });
      if (!count) {
        // bulk.execute will throw an error if there are no updates
        return;
      }
      return bulk.execute();
    });
  };

  self.removeTask = function(apos, argv) {
    var locale = argv.locale;
    if (!locale) {
      if (self.localized) {
        throw 'Since you have configured locales, you MUST specify --locale to choose\nthe content that will NOT be permanently deleted when running this task.';
      }
      locale = 'default';
    }
    if (!(argv.draft || argv.live)) {
      throw 'You MUST specify either --draft or --live to determine which content will\nbe kept. All other content will be PERMANENTLY DELETED.';
    }
    var keep = locale + (argv.draft ? '-draft' : '');
    return Promise.try(function() {
      console.log('Making sure the content you have chosen to keep exists...');
      return self.apos.docs.db.count({
        workflowLocale: keep
      });
    }).then(function(count) {
      if (!count) {
        throw 'There is no content with workflowLocale set to ' + keep + '.\nYou seem to have chosen a\nnonexistent locale. Exiting.';
      }
      console.log('Deleting content not chosen to keep...');
      return self.apos.docs.db.remove({
        $and: [
          {
            workflowLocale: {
              $exists: 1
            }
          },
          {
            workflowLocale: {
              $ne: keep
            }
          }
        ]
      });
    }).then(function() {
      console.log('Removing workflow properties from content kept...');
      return self.apos.docs.db.update({}, {
        $unset: {
          workflowLocale: 1,
          workflowGuid: 1,
          workflowModified: 1,
          workflowLocaleForPathIndex: 1,
          workflowMoved: 1,
          workflowMovedIsNew: 1
        }
      }, {
        multi: true
      });
    }).then(function() {
      console.log('Removing the commits collection...');
      return self.db.drop();
    }).then(function() {
      console.log('Removing the facts collection...');
      return self.facts.drop();
    }).then(function() {
      console.log('Completed.\n\nYOU MUST REMOVE apostrophe-workflow FROM app.js BEFORE\nYOU LAUNCH THE SITE OR RUN ANY MORE TASKS.\nOtherwise workflow will come back.');
      // mongo connection seems to get stuck open, maybe because we dropped
      // collections, so node will not exit on its own
      process.exit(0);
    });
  };

  self.addTask('recompute-modified', 'Recompute the workflowModified flag for every doc. Not needed unless you have\nperformed modifications directly with the MongoDB APIs, bypassing Apostrophe,\nand you need workflow to see those modifications as changes. In future, consider\nsetting workflowModified to true via your own code rather than relying on this\ntime-consuming task.', function(apos, argv) {
    return self.recomputeModified();
  });

  self.addTask('dereplicate', 'Dereplicate docs. Used when transitioning to the "replicateAcrossLocales: false"\noption, which should be turned on before running this task. This task looks for docs\nthat are in the trash in all but two locales (live and draft of the\nsame user-facing locale), and removes them from the locales where they\nare in the trash. THIS DELETES CONTENT FROM THE DATABASE.', function(apos, argv) {
    return self.dereplicateTask();
  });

  self.addTask('remove', 'Remove workflow. You MUST specify the locale to keep (unless you do not have locales configured) with --locale. You MUST specify whether to keep draft content (--draft) or live content (--live). Everything else is DELETED FOREVER.\n\nAfter running this task you MUST IMMEDIATELY REMOVE apostrophe-workflow\nfrom your app.js file, or it will just come back.', function(apos, argv) {
    self.removeTask(apos, argv);
  });

  self.replicateLocaleTask = async (apos, argv) => {

    const docAfterSave = require('util').promisify(self.docAfterSave);
    const replicate = function(req, doc) {
      return docAfterSave(req, doc, {
        workflowMissingLocalesLocales: [ to, self.draftify(to) ],
        workflowResolveDeferred: true,
        workflowMissingLocalesLive: true
      });
    };
    const resolveDeferredRelationships = require('util').promisify(self.resolveDeferredRelationships);

    const from = argv.from;
    const to = argv.to;
    if (!(from && to)) {
      throw 'You must pass the --from and --to options and specify a locale for each value.';
    }
    if (!self.locales[from]) {
      throw `${from} is not a locale name.`;
    }
    if (!self.locales[to]) {
      throw `${to} is not a locale name.`;
    }
    await self.apos.docs.db.remove({
      workflowLocale: {
        $in: [ to, self.draftify(to) ]
      }
    });
    const _ids = (await self.apos.docs.db.find({
      workflowLocale: from
    }, {
      _id: 1
    }).sort({ level: 1, rank: 1 }).toArray()).map(doc => doc._id);
    const req = self.apos.tasks.getReq();
    const meter = self.apos.migrations.progressStart({
      getTotal: function(callback) {
        return callback(null, _ids.length);
      }
    });
    for (const _id of _ids) {
      const doc = await self.apos.docs.db.findOne({ _id });
      await replicate(req, doc);
      meter.step();
    }
    meter.end();

    console.log('Resolving relationships...');
    await self.apos.docs.db.update({
      workflowLocale: {
        $in: [ to, self.draftify(to) ]
      }
    }, {
      $set: {
        workflowResolveDeferred: true
      }
    },
    {
      multi: true
    });

    await resolveDeferredRelationships();
    console.log('... Done.');
  };

  self.cleanPagesTreeTask = function() {
    self.addTask('clean-pages-tree',
      `Cleans your pages tree in the case the live one differs with the draft one,
      The live tree will be modified based on the draft one.`,
      self.cleanPagesTree
    );
  };

  self.cleanPagesTree = async function() {
    const req = self.apos.tasks.getReq();

    const locales = Object.keys(self.apos.workflow.locales)
      .filter((locale) => !locale.includes('-draft'));

    const pageManager = self.apos.modules['apostrophe-any-page-manager'];

    const pages = await pageManager.find(req).toArray();

    console.log('pages ===> ', require('util').inspect(pages, { colors: true, depth: 1 }));

    // for (const locale of locales) {
    //   const pages = await self.apos.docs.find(req, {workflowLocale: `${locale}-draft`}).toArray();
    //   console.log('locale ===> ', locale);

    //   console.log('pages.length ===> ', pages.length);

    // }

    // console.log('self.apos.pages ===> ', require('util').inspect(self.apos.pages, { colors: true, depth: 0 }));
  };
};
