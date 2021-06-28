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
    self.on('apostrophe:modulesReady', function() {
      self.autoCommitPageMoves = self.apos.modules['apostrophe-workflow']
        .options.autoCommitPageMoves || false;
    });

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
            },
            {
              label: 'Force Export Related',
              action: 'workflow-force-export-related'
            }
          ] : []
        )
      });
      return controls;
    }

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
    // If the autoCommitPageMoves option has been set, we move the live version
    // when we move the draft one, in order to avoid any page tree conflicts.

    var superAfterMove = self.afterMove;
    self.afterMove = function(req, moved, info, callback) {
      return superAfterMove(req, moved, info, function(err) {
        const isDraft = moved.workflowLocale.includes('-draft');

        if (err) {
          return callback(err);
        }
        return self.apos.docs.db.update({
          _id: moved._id
        }, {
          $set: {
            workflowModified: true,
            workflowMoved: {
              target: info.target.workflowGuid,
              position: info.position
            },
            ...isDraft && { workflowMovedIsNew: true }
          }
        }, (err) => {
          if (err || !isDraft || !self.autoCommitPageMoves) {
            return callback(err || null);
          }

          self.apos.workflow.getDraftAndLive(req, moved._id, {}, (err, draft, live) => {
            if (err) {
              return callback(err);
            }

            return self.apos.workflow.repeatMove(req, draft, live, callback);
          });
        });
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
            convertToLocalizedSlug(item, locale);
            return self.implementParkOne(req, item, callback);
          }, callback);

          function convertToLocalizedSlug (item, locale) {
            if (locale) {
              var liveLocale = workflow.liveify(locale);
              if (typeof item.slug === 'object') {
                if (!item.slug[liveLocale] && !item.slug._default) {
                  throw new Error('apostrophe-workflow: mising _default value in localized parked page');
                }
                item.slug = item.slug[liveLocale] || item.slug._default;
                if (item.parkedId && item.parkedId === 'home') {
                  throw new Error('apostrophe-workflow: the homepage cannot have a localized slug');
                }
              }

              if (item._children) {
                _.each(item._children, function(child) {
                  convertToLocalizedSlug(child, liveLocale);
                });
              }
            }
          }

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
              convertToLocalizedSlug(item, locale);
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

    var superGetInfoProjection = self.getInfoProjection;
    self.getInfoProjection = function(req, cursor) {
      var projection = superGetInfoProjection(req);
      projection = Object.assign(
        {
          workflowLocale: 1,
          workflowModified: 1,
          workflowSubmitted: 1,
          workflowLastCommitted: 1
        },
        projection
      );
      return projection;
    };

  }

};
