var _ = require('@sailshq/lodash');
var async = require('async');

module.exports = {

  improve: 'apostrophe-pages',

  beforeConstruct: function(self, options) {

    options.addBatchOperations = [
      {
        name: 'submit',
        route: 'apostrophe-workflow:submit',
        label: 'Submit',
        buttonLabel: 'Submit'
      },
      {
        name: 'commit',
        route: 'apostrophe-workflow:batch-commit',
        label: 'Commit',
        buttonLabel: 'Commit'
      },
      {
        name: 'force-export',
        route: 'apostrophe-workflow:batch-force-export',
        label: 'Force Export',
        buttonLabel: 'Force Export'
      }
    ].concat(options.addBatchOperations || []);

  },

  construct: function(self, options) {

    var superGetPathIndexParams = self.getPathIndexParams;
    self.getPathIndexParams = function() {
      var params = superGetPathIndexParams();
      params.workflowLocaleForPathIndex = 1;
      return params;
    };

    var superRemoveTrailingSlugSlashes = self.removeTrailingSlugSlashes;
    self.removeTrailingSlugSlashes = function(req, slug) {
      if (arguments.length === 1) {
        // bc workaround
        slug = req;
        req = self.apos.tasks.getAnonReq();
      }
      var workflow = self.apos.modules['apostrophe-workflow'];
      if (!workflow.prefixes) {
        return superRemoveTrailingSlugSlashes(slug);
      }
      var locale = workflow.liveify(req.locale);
      if (_.has(workflow.prefixes, locale)) {
        var matches = slug.match(/^(\/[^/]+)(\/?)$/);
        if (matches && (workflow.prefixes[locale] === matches[1])) {
          // Something like /en/, leave it alone,
          // it's a localized homepage. However if the
          // trailing slash *after* the locale is missing,
          // add it and redirect
          if (matches[2] === '') {
            return slug + '/';
          } else {
            return slug;
          }
        }
      }
      return superRemoveTrailingSlugSlashes(slug);
    };

    var superPruneCurrentPageForBrowser = self.pruneCurrentPageForBrowser;
    self.pruneCurrentPageForBrowser = function(page) {
      var pruned = superPruneCurrentPageForBrowser(page);
      pruned.workflowLocale = page.workflowLocale;
      pruned.workflowGuid = page.workflowGuid;
      return pruned;
    };

    var superGetEditControls = self.getEditControls;
    self.getEditControls = function(req) {
      return upgradeControls(req, superGetEditControls(req), 'edit');
    };

    var superGetCreateControls = self.getCreateControls;
    self.getCreateControls = function(req) {
      return upgradeControls(req, superGetCreateControls(req), 'create');
    };

    function upgradeControls(req, controls, verb) {
      var workflow = self.apos.modules['apostrophe-workflow'];
      if (!workflow.includeType(self.name)) {
        // Not subject to workflow
        return controls;
      }
      var save = _.find(controls, { action: 'save' });
      if (save) {
        save.label = 'Save Draft';
      }
      controls.push({
        type: 'dropdown',
        label: 'Workflow',
        name: 'workflow',
        dropdownOptions: {
          direction: 'down'
        },
        items: [
          {
            label: 'Submit',
            action: 'workflow-submit'
          },
          {
            label: 'Commit',
            action: 'workflow-commit'
          }
        ].concat(
          (workflow.localized && (verb === 'edit'))
            ? [
              {
                label: 'History and Export',
                action: 'workflow-history'
              }
            ] : [
              {
                label: 'History',
                action: 'workflow-history'
              }
            ]
        ).concat(workflow.localized
          ? [
            {
              label: 'Force Export',
              action: 'workflow-force-export'
            }
          ] : []
        )
      });
      return controls;
    }

    var superMovePermissions = self.movePermissions;

    // "Based on `req`, `moved`, `data.oldParent` and `data.parent`, decide whether
    // this move should be permitted. If it should not be, report an error." The `apostrophe-pages`
    // module did this already, but we must consider the impact on all locales.

    self.movePermissions = function(req, moved, data, options, callback) {
      return superMovePermissions(req, moved, data, options, function(err) {
        if (err) {
          return callback(err);
        }
        if (!moved.workflowGuid) {
          // No localization for pages. That's unusual but allowed
          return callback(null);
        }
        // Grab the pages of interest across all locales other than the original (already checked).
        return self.apos.docs.find(req, {
          workflowGuid: { $in: [ moved.workflowGuid, data.oldParent.workflowGuid, data.parent.workflowGuid ] },
          workflowLocale: { $ne: moved.workflowLocale }
        }).joins(false).areas(false).workflowLocale(null).permission(false).published(null).trash(null).toArray(function(err, pages) {
          if (err) {
            return callback(err);
          }
          var error = null;
          var locales = {};
          _.each(pages, function(page) {
            var workflow = self.apos.modules['apostrophe-workflow'];
            if (!workflow.locales[page.workflowLocale]) {
              // Ignore orphaned locales (no longer in configuration),
              // do not crash if they are still in the db but not for
              // newer pages
              return;
            }
            if (!locales[page.workflowLocale]) {
              locales[page.workflowLocale] = {};
            }
            if (page.workflowGuid === moved.workflowGuid) {
              locales[page.workflowLocale].moved = page;
            }
            // Parent does not always change, else statement is not appropriate here
            if (page.workflowGuid === data.parent.workflowGuid) {
              locales[page.workflowLocale].parent = page;
            }
            if (page.workflowGuid === data.oldParent.workflowGuid) {
              locales[page.workflowLocale].oldParent = page;
            }
          });
          _.each(locales, function(locale, name) {
            // Repeat the permissions check for every locale
            if (!locale.moved._publish) {
              error = new Error('forbidden');
              return false;
            }
            if ((locale.oldParent._id !== locale.parent._id) && (!locale.parent._edit)) {
              error = new Error('forbidden');
              return false;
            }
          });
          return callback(error);
        });
      });
    };

    // On invocation of `apos.pages.move`, modify the criteria and filters
    // to ensure only the relevant locale is in play

    var superBeforeMove = self.beforeMove;
    self.beforeMove = function(req, moved, target, position, options, callback) {
      return superBeforeMove(req, moved, target, position, options, function(err) {
        if (err) {
          return callback(err);
        }
        if (moved.workflowLocale) {
          options.criteria = _.assign({}, options.criteria || {}, { workflowLocale: moved.workflowLocale });
          options.filters = _.assign({}, options.filters || {}, { workflowLocale: moved.workflowLocale });
        }
        return callback(null);
      });
    };

    // After a page is moved in one locale, record the action that
    // was taken so it can be repeated on a commit or export
    // without attempting to reconcile differences in where the
    // destination parent page happens to be at the start
    // of the operation.

    var superAfterMove = self.afterMove;
    self.afterMove = function(req, moved, info, callback) {
      return superAfterMove(req, moved, info, function(err) {
        if (err) {
          return callback(err);
        }
        return self.apos.docs.db.update({
          _id: moved._id
        }, {
          $set: {
            workflowMoved: {
              target: info.target.workflowGuid,
              position: info.position
            },
            workflowMovedIsNew: true
          }
        }, callback);
      });
    };

    // `implementParkAll` must be reimplemented to cover all of
    // the locales, and to first invoke the add-missing-locales and
    // add-locale-prefixes logic, if needed

    self.implementParkAll = function(callback) {
      if (
        (self.apos.argv._[0] === 'apostrophe-workflow:add-missing-locales') ||
        (self.apos.argv._[0] === 'apostrophe-workflow:add-locale-prefixes') ||
        (self.apos.argv._[0] === 'apostrophe-workflow:remove-numbered-parked-pages') ||
        (self.apos.argv._[0] === 'apostrophe-workflow:harmonize-workflow-guids-by-parked-id')) {
        // If we park pages in this scenario, we'll wind up with
        // duplicate pages in the new locales after the task
        // fills them in
        return setImmediate(callback);
      }

      var workflow = self.apos.modules['apostrophe-workflow'];

      return async.series([
        workflow.updatePerConfiguration,
        parkBody
      ], function(err) {
        return callback(err);
      });

      function parkBody(callback) {
        var workflow = self.apos.modules['apostrophe-workflow'];
        var locales = _.keys(workflow.locales);
        return async.eachSeries(locales, function(locale, callback) {
          var parked = _.cloneDeep(self.parked);
          if (workflow.prefixes) {
            fixPrefixes(parked, locale);
          }

          var req = self.apos.tasks.getReq();
          req.locale = locale;

          return async.eachSeries(parked, function(item, callback) {
            return self.implementParkOne(req, item, callback);
          }, callback);

          function fixPrefixes(parked, locale) {
            var prefix = workflow.prefixes[workflow.liveify(locale)];
            if (!prefix) {
              return;
            }
            _.each(parked, function(item) {
              if (item.slug === '/') {
                // Hint to the implementParkOne implementation that
                // this is still a homepage even if its slug is
                // no longer / due to locale prefixes
                item.level = 0;
              }
              if (item.parent) {
                item.parent = prefix + item.parent;
              } else if (item.level !== 0) {
                item.parent = prefix + '/';
              }
              item.slug = prefix + item.slug;
              fixPrefixes(item._children || [], locale);
            });
          }
        }, callback);
      }
    };

    var superGetBaseUrl = self.getBaseUrl;
    // Return the appropriate base URL for constructing absolute
    // URLs in the relevant locale, if the `hostnames` option is
    // in play for this locale, otherwise fall back to the
    // standard behavior
    self.getBaseUrl = function(req) {
      var workflow = self.apos.modules['apostrophe-workflow'];
      var live = workflow.liveify(req.locale || workflow.defaultLocale);
      if (!(workflow.hostnames && workflow.hostnames[live])) {
        return superGetBaseUrl(req);
      }
      var url = req.protocol + '://' + workflow.hostnames[live];
      // If the request URL was on a particular port, the
      // new URL should be on that port too. Helpful for
      // debugging locally
      var matches = (req.get('host') || '').match(/:(\d+$)/);
      var port;
      if (matches) {
        port = matches[1];
        if (((req.protocol === 'http') && (port !== '80')) ||
          ((req.protocol === 'https') && (port !== '443'))) {
          url += ':' + port;
        }
      }
      return url;
    };

  }

};
