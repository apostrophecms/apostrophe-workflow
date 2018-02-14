var _ = require('lodash');
var async = require('async');

module.exports = function(self, options) {
  self.enableAddMissingLocalesTask = function() {
    self.apos.tasks.add(self.__meta.name, 'add-missing-locales',
      'Run this task after adding new locales or setting up the module for the first time.',
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

  self.addMissingLocalesTask = function(apos, argv, callback) {
    var req = self.apos.tasks.getReq();

    return async.series([
      fixIndexes,
      noLocales,
      missingSomeLocales,
      resolve,
      fixPermissions
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
          return index.key && index.key.path && (!index.key.workflowLocaleForPathIndex);
        });
        if (!existing) {
          return callback(null);
        }
        return self.apos.docs.db.dropIndex(existing.name, callback);
      }
    }

    function noLocales(callback) {
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

    function missingSomeLocales(callback) {
      return self.apos.migrations.eachDoc({ workflowLocale: self.defaultLocale }, 5, function(doc, callback) {
        if (!self.includeType(doc.type)) {
          return setImmediate(callback);
        }
        doc.workflowResolveDeferred = true;
        return self.docAfterSave(req, doc, { permissions: false }, function(err) {
          return callback(err);
        });
      }, callback);
    }

    function resolve(callback) {
      return self.resolveDeferredRelationships(callback);
    }

    function fixPermissions(callback) {
      var fields = [ 'viewUsersIds', 'viewGroupsIds',
        'editUsersIds', 'editGroupsIds',
        'viewUsersRelationships', 'viewGroupsRelationships',
        'editUsersRelationships', 'editGroupsRelationships'
      ];
      return async.eachSeries(fields, function(field, callback) {
        var criteria = {};
        criteria[field] = { $type: 10 };
        var $set = {};
        $set[field] = [];
        self.apos.docs.db.update(criteria, {
          $set: $set
        }, {
          multi: true
        }, callback);
      }, callback);
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
    var req = self.apos.tasks.getReq();
    return self.apos.migrations.eachDoc({ slug: /^\// }, function(page, callback) {
      if (!self.includeType(page.type)) {
        return setImmediate(callback);
      }
      return self.apos.pages.update(req, page, { permissions: false }, callback);
    }, callback);
  };

  self.removeNumberedParkedPagesTask = function(apos, argv, callback) {
    return self.apos.docs.db.remove({
      parked: { $exists: 1 },
      slug: /^\/.*\d+$/
    }, callback);
  };

};
