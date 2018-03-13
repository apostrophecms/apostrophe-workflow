apos.define('apostrophe-workflow', {

  extend: 'apostrophe-context',

  afterConstruct: function(self) {
    self.enableExpand();
    self.enableWorkflowControls();
    self.enableSubmit();
    self.enableDismiss();
    self.enableCommit();
    self.enableHistory();
    self.enableExport();
    self.enableReview();
    self.enableManageModal();
    self.enableLocalePickerModal();
    self.enableForceExport();
    self.enableForceExportWidget();
    self.enableCrossDomainSessionToken();
  },

  construct: function(self, options) {

    self.locales = options.locales;
    self.locale = options.locale;
    self.liveLocale = self.locale.replace(/-draft$/, '');

    self.enableExpand = function () {
      $('body').on('click', '[data-apos-expand-trigger]', function(e) {
        e.preventDefault();
        var $this = $(this);
        $this.parent('[data-apos-expand]').toggleClass('apos-expand-list-container--open');
      });
    };

    // If there are any editable doc ids on the page, including
    // things that would be editable if we were looking at the draft
    // rather than the live version, display the workflow mode toggle
    // and related controls

    self.enableWorkflowControls = function() {
      $('body').on('click', '[data-apos-workflow-mode]', function() {
        var mode = $(this).attr('data-apos-workflow-mode');
        self.api('workflow-mode', { workflowGuid: self.options.contextGuid, mode: mode }, function(result) {
          if (result.status === 'ok') {
            window.location.href = result.url;
          }
        });
      });
      self.updateWorkflowControls();
      apos.on('areaEdited', function() {
        self.updateWorkflowControls();
      });
      apos.on('workflowCommitted', function() {
        self.updateWorkflowControls();
      });
      apos.on('workflowSubmitted', function() {
        self.updateWorkflowControls();
      });
    };

    self.updateWorkflowControls = function() {
      var $menu = $('body').find('[data-apos-workflow-menu]');
      return self.getEditable({ related: true }, function(err, result) {
        if (err) {
          return;
        }
        setClass($menu, 'apos-workflow-editable', result.modified.length || result.unmodified.length);
        setClass($menu, 'apos-workflow-modified', !!result.modified.length);
        setClass($menu, 'apos-workflow-committable', !!result.committable.length);
        setClass($menu, 'apos-workflow-unsubmitted', !!result.unsubmitted.length);

        // Show/hide the widget level force export buttons based on whether
        // their doc is committable (it's preexisting and we have permission
        // to write to the live version of it)
        var $docs = $('[data-doc-id]');
        $docs.each(function() {
          var $doc = $(this);
          var id = $doc.attr('data-doc-id');
          if (!id) {
            $doc.removeClass('apos-workflow-committable');
          }
          if (_.contains(result.committable, id)) {
            $doc.addClass('apos-workflow-committable');
          } else {
            $doc.removeClass('apos-workflow-committable');
          }
        });

        function setClass($menu, c, flag) {
          if (flag) {
            $menu.addClass(c);
          } else {
            $menu.removeClass(c);
          }
        }
      });
    };

    // Get the ids of the docs related to the areas in the rendered HTML.

    self.getDocIds = function() {
      var ids = [];
      $('[data-apos-area]').each(function() {
        var $area = $(this);
        var id = $area.attr('data-doc-id');
        if (id) {
          ids.push(id);
        }
      });
      ids = _.uniq(ids);
      return ids;
    };

    // Obtain the doc ids presently on the page,
    // and filter the whole list to include only editable docs.
    // The callback receives `(null, result)` on success.
    // `result` has `modified`, `unmodified`, and `committable`
    // properties, which are arrays of ids of draft documents,
    // all of which are editable and may in some way appear
    // on the current page.
    //
    // If `options.related` is truthy then related documents,
    // i.e. related via joins or widgets, are also included.

    self.getEditable = function(options, callback) {
      var ids = self.getDocIds();
      return self.api('editable', _.assign({ ids: ids }, options), function(result) {
        if (result.status === 'ok') {
          return callback(null, result);
        } else {
          return callback(result.status);
        }
      }, function(error) {
        return callback(error);
      });
    };

    self.getRelatedUnexported = function(params, callback) {
      return self.api('related-unexported', params, function(result) {
        if (result.status === 'ok') {
          return callback(null, result);
        } else {
          return callback(result.status);
        }
      }, function(error) {
        return callback(error);
      });
    };

    self.enableSubmit = function() {
      $('body').on('click', '[data-apos-workflow-submit]', function() {
        apos.ui.globalBusy(true);
        self.getEditable({ related: true }, function(err, result) {
          apos.ui.globalBusy(false);
          if (!err) {
            self.submit(result.modified);
          }
        });
        return false;
      });
    };

    self.enableDismiss = function() {
      $('body').on('click', '[data-apos-workflow-dismiss]', function() {
        self.dismiss($(this).attr('data-apos-workflow-dismiss'));
        return false;
      });
    };

    self.enableCommit = function() {
      $('body').on('click', '[data-apos-workflow-commit]', function() {
        var id = $(this).attr('data-apos-workflow-commit');
        if (id) {
          self.commit([ id ]);
        } else {
          apos.ui.globalBusy(true);
          return self.getEditable({ related: true }, function(err, result) {
            apos.ui.globalBusy(false);
            if (!err) {
              self.commit(_.intersection(result.committable, result.modified));
            }
          });
        }
        return false;
      });
    };

    self.enableHistory = function(callback) {
      apos.ui.link('apos-workflow-history', null, function($el, id) {
        self.history(id, callback);
      });
    };

    self.history = function(id) {
      return apos.create('apostrophe-workflow-history-modal',
        _.assign({
          manager: self,
          body: { id: id }
        }, options)
      );
    };

    self.enableExport = function() {
      apos.ui.link('apos-workflow-export', null, function($el, id) {
        self.export(id);
      });
    };

    // id is a commit id, not a doc id

    self.export = function(id, callback) {
      return self.launchExportModal({ id: id }, callback);
    };

    // ids are commit ids, not doc ids

    self.batchExport = function(ids, callback) {
      return self.launchBatchExportModal({ ids: ids }, callback);
    };

    self.batchForceExportGetLocales = function(data, callback) {
      return self.launchBatchForceExportModal(data, callback);
    };

    self.launchExportModal = function(data, callback) {
      return apos.create('apostrophe-workflow-export-modal',
        _.assign({}, self.options, {
          manager: self,
          body: data,
          after: callback
        }, options)
      );
    };

    self.launchBatchExportModal = function(options, callback) {
      return apos.create('apostrophe-workflow-batch-export-modal',
        _.assign({}, self.options, {
          manager: self,
          body: options,
          after: callback
        }, options)
      );
    };

    self.launchBatchForceExportModal = function(options, callback) {
      return apos.create('apostrophe-workflow-batch-force-export-modal',
        _.assign({}, self.options, {
          manager: self,
          body: options,
          after: callback
        }, options)
      );
    };

    self.enableForceExport = function() {
      apos.ui.link('apos-workflow-force-export', null, function($el, id) {
        self.forceExport(id);
      });
    };

    self.forceExport = function(id, callback) {
      return apos.areas.saveAllIfNeeded(function() {
        return apos.create('apostrophe-workflow-force-export-modal',
          _.assign({
            manager: self,
            body: { id: id },
            after: callback
          }, options)
        );
      });
    };

    self.launchBatchForceExportModal = function(options, callback) {
      return apos.create('apostrophe-workflow-batch-force-export-modal',
        _.assign({}, self.options, {
          manager: self,
          body: options,
          after: callback
        }, options)
      );
    };

    self.enableForceExportWidget = function() {
      apos.ui.link('apos-workflow-force-export-widget', null, function($el) {
        var widgetId = $el.closest('[data-apos-widget-id]').attr('data-apos-widget-id');
        // Skip up to the enclosing area with a real doc id, not a virtual or widget one
        var docId = $el.closest('[data-doc-id^="c"]').attr('data-doc-id');
        return apos.areas.saveAllIfNeeded(function() {
          return apos.create('apostrophe-workflow-force-export-widget-modal',
            _.assign({
              manager: self,
              body: { id: docId, widgetId: widgetId }
            }, options)
          );
        });
      });
    };

    self.enableReview = function() {
      apos.ui.link('apos-workflow-review', null, function($el, id) {
        return apos.create('apostrophe-workflow-review-modal',
          _.assign({
            manager: self,
            body: { id: id }
          }, options)
        );
      });
    };

    // Submit the docs with the specified ids for approval and notify the user.
    self.submit = function(ids, callback) {
      if (!ids.length) {
        apos.notify('No modifications to submit.', { type: 'warn', dismiss: true });
        return callback && callback(null);
      }
      apos.ui.globalBusy(true);
      self.api('submit', { ids: ids }, function(result) {
        apos.ui.globalBusy(false);
        if (result.status !== 'ok') {
          apos.notify('An error occurred submitting the document for approval.', { type: 'error' });
          return callback && callback('error');
        } else {
          apos.emit('workflowSubmitted', ids);
          apos.notify('Your submission will be reviewed.', { type: 'success', dismiss: true });
          return callback && callback(null);
        }
      }, function() {
        apos.notify('An error occurred.', { type: 'error' });
        return callback && callback('error');
      });
    };

    self.dismiss = function(id) {
      apos.ui.globalBusy(true);
      self.api('dismiss', { id: id }, function(result) {
        apos.ui.globalBusy(false);
        if (result.status === 'ok') {
          $('[data-apos-workflow-dismiss="' + id + '"]').closest('[data-apos-workflow-submission]').hide();
        }
      });
    };

    // Present commit modals for all ids in the array, one after another
    self.commit = function(ids, callback) {
      self.nextExportHint = [];
      if (!ids.length) {
        return apos.notify('No modifications to commit.', { type: 'warn', dismiss: true });
      }
      var leadId = (apos.contextPiece && apos.contextPiece._id) || (apos.pages.page && apos.pages.page._id);
      if (!_.contains(ids, leadId)) {
        leadId = null;
      }
      if (leadId) {
        ids = _.filter(ids, function(id) {
          return id !== leadId;
        }).concat([ leadId ]);
      }
      var i = 0;
      return async.eachSeries(ids, function(id, callback) {
        i++;
        return self.launchCommitModal({ id: id, index: i, total: ids.length, lead: (leadId === id) }, callback);
      }, function(err) {
        if (!err) {
          apos.emit('workflowCommitted', ids);
        }
        return callback && callback(err);
      });
    };

    self.enableManageModal = function() {
      apos.adminBar.link(self.__meta.name + '-manage-modal', function() {
        self.launchManageModal();
      });
    };

    self.launchManageModal = function() {
      return apos.create(self.__meta.name + '-manage-modal', _.assign({ manager: self }, options));
    };

    self.launchCommitModal = function(options, callback) {
      return apos.create(self.__meta.name + '-commit-modal', _.assign({}, self.options, {
        manager: self,
        body: options,
        after: callback
      }));
    };

    self.launchLocalePickerModal = function() {
      return apos.create(self.__meta.name + '-locale-picker', _.assign({
        manager: self,
        body: { url: window.location.href }
      }));
    };

    self.enablePreviewIframe = function(options) {
      self.api('diff', options, function(result) {
        if (result.status !== 'ok') {
          return fail();
        }
        var id = result.id;
        _.each(result.diff, function(change) {
          var $widget = $('[data-apos-widget-id="' + change._id + '"]');
          if (!$widget.length) {
            if (change.change === 'removed') {
              removed(change);
            }
          } else {
            if (change.change === 'added') {
              $widget.addClass('apos-workflow-widget-diff apos-workflow-widget-diff--new');
            } else if (change.change === 'moved') {
              $widget.addClass('apos-workflow-widget-diff apos-workflow-widget-diff--moved');
            } else if (change.change === 'modified') {
              $widget.addClass('apos-workflow-widget-diff apos-workflow-widget-diff--changed');
            }
          }
        });

        function removed(change) {

          var $area = $('[data-doc-id="' + id + '"][data-dot-path="' + change.dotPath.replace(/\.items\.\d+$/, '') + '"]');

          var matches = change.dotPath.match(/\d+$/);
          if (!matches) {
            return;
          }
          var index = matches[0];

          if (!$area.length) {
            return;
          }

          var data = change.value;

          // TODO: this would generate a lot of API requests if a lot
          // of things were deleted, might be worth serializing them
          // in an orderly fashion

          var areaOptions = JSON.parse($area.attr('data-options'));
          return $.jsonCall(apos.areas.options.action + '/render-widget',
            {
              dataType: 'html'
            },
            {
              data: data,
              options: areaOptions.widgets[data.type] || {},
              type: data.type
            }, function(html) {
              // This rather intense code works around
              // various situations in which jquery is
              // picky about HTML
              var $newWidget = $($.parseHTML($.trim(html), null, true));
              var $before = $area.findSafe('[data-apos-widget-wrapper]', '[data-apos-area]').eq(index);
              if ($before.length) {
                $before.before($newWidget);
              } else {
                $area.append($newWidget);
              }
              $newWidget.addClass('apos-workflow-widget-diff apos-workflow-widget-diff--deleted');
              apos.emit('enhance', $newWidget);
            }
          );
        }
      }, function() {
        return fail();
      });

      function fail() {
        apos.notify('An error occurred displaying the difference between the documents.', { type: 'error' });
      }
    };

    self.enableLocalePickerModal = function() {
      apos.adminBar.link(self.__meta.name + '-locale-picker-modal', function() {
        self.launchLocalePickerModal();
      });
    };

    self.launchLocalePickerModal = function() {
      return apos.create(self.__meta.name + '-locale-picker-modal',
        _.assign({ manager: self, body: { workflowGuid: options.contextGuid } }, options)
      );
    };

    self.presentBatchExportResult = function(result) {
      var errors = 0;
      var success = 0;
      _.each(result, function(result, key) {
        if (result.errors.length) {
          errors++;
        }
        if (result.success.length) {
          success++;
        }
      });
      if (errors) {
        apos.notify('Errors were encountered for some locales while exporting %s of the documents.', errors, { type: 'error' });
      }
      if (success) {
        apos.notify('%s documents were successfully exported to one or more locales.', success, { type: 'success' });
      }
      if (!(errors || success)) {
        apos.notify('No documents were exported.');
      }
    };

    self.enableCrossDomainSessionToken = function() {
      $('body').on('click', 'a[data-apos-cross-domain-session-token]', function(event) {
        var $link = $(this);
        if (!self.options.hostnames) {
          return;
        }
        event.stopPropagation();
        event.preventDefault();
        var token = $link.attr('data-apos-cross-domain-session-token');
        var href = window.location.protocol + '//';
        href += self.options.hostnames[$link.attr('data-apos-locale')];
        href += ':' + window.location.port;
        href += $link.attr('href');
        if (href.indexOf('/') === -1) {
          href += '?';
        } else if (href.indexOf('=') !== -1) {
          href += '&';
        }
        href += 'workflowCrossDomainSessionToken=' + token;
        href += '&cb=' + Math.random().toString().replace('.', '');
        window.location.href = href;
      });
    };

  }
});
