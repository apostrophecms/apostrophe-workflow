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
    self.addPermissionsFieldType();
    self.enableLocalePickerModal();
    self.enableForceExport();
    self.enableForceExportWidget();
  },

  construct: function(self, options) {

    self.locales = options.locales;
    self.locale = options.locale;
    self.liveLocale = self.locale.replace(/\-draft$/, '');

    self.enableExpand = function () {
      $('body').on('click', '[data-apos-expand-trigger]', function(e) {
        e.preventDefault();
        var $this = $(this);
        $this.parent('[data-apos-expand]').toggleClass('apos-expand-list-container--open');
      })
    }

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
    };
    
    self.updateWorkflowControls = function() {
      var $menu = $('body').find('[data-apos-workflow-menu]');
      var $submit = $menu.find('[data-apos-workflow-submit]');
      var $commit = $menu.find('[data-apos-workflow-commit]');
      var $state = $menu.find('[data-apos-workflow-mode]').closest('[data-apos-dropdown]');
      return self.getEditable({ related: true }, function(err, result) {
        if (err) {
          return hide();
        }
        setClass($menu, 'apos-workflow-editable', result.modified.length || result.unmodified.length);
        setClass($menu, 'apos-workflow-modified', !!result.modified.length);
        setClass($menu, 'apos-workflow-committable', !!result.committable.length);
        setClass($menu, 'apos-workflow-unsubmitted', !!result.unsubmitted.length);
        setTimeout(self.updateWorkflowControls, 1000);
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
        if (result.status == 'ok') {
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
        return self.getEditable({ related: true }, function(err, result) {
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
          return self.getEditable({ related: true }, function(err, result) {
            if (!err) {
              self.commit(_.intersection(result.committable, result.modified));
            }
          });
        }
        return false;
      });
    };
    
    self.enableHistory = function() {
      apos.ui.link('apos-workflow-history', null, function($el, id) {
        self.history(id);
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
        return apos.create('apostrophe-workflow-export-modal', 
          _.assign({
            manager: self,
            body: { id: id }
          }, options)
        );
      });
    };

    self.enableForceExport = function() {
      apos.ui.link('apos-workflow-force-export', null, function($el, id) {
        self.forceExport(id);
      });
    };
    
    self.forceExport = function(id) {
      return apos.areas.saveAllIfNeeded(function() {
        return apos.create('apostrophe-workflow-force-export-modal', 
          _.assign({
            manager: self,
            body: { id: id }
          }, options)
        );
      });
    };

    self.enableForceExportWidget = function() {
      apos.ui.link('apos-workflow-force-export-widget', null, function($el) {
        var widgetId = $el.closest('[data-apos-widget-id]').attr('data-apos-widget-id');
        var docId = $el.closest('[data-doc-id]').attr('data-doc-id');
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
        return apos.notify('No modifications to submit.', { type: 'warn' });
      }
      self.api('submit', { ids: ids }, function(result) {
        if (result.status !== 'ok') {
          apos.notify('An error occurred submitting the document for approval.', { type: 'error' });
          return callback && callback('error');
        } else {
          apos.notify('Your submission will be reviewed.', { type: 'success' });
          return callback && callback(null);
        }
      }, function() {
        apos.notify('An error occurred.', { type: 'error' });
        return callback && callback('error');
      });
    }
    
    self.dismiss = function(id) {
      self.api('dismiss', { id: id }, function(result) {
        if (result.status === 'ok') {
          $('[data-apos-workflow-dismiss="' + id + '"]').closest('[data-apos-workflow-submission]').hide();
        }
      });
    };
    
    // Present commit modals for all ids in the array, one after another
    self.commit = function(ids, callback) {
      if (!ids.length) {
        return apos.notify('No modifications to commit.', { type: 'warn' });
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
        return self.launchCommitModal({ id: id, index: i, total: ids.length, lead: (leadId == id) }, callback);
      }, function(err) {
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
        var keys = _.keys(result.diff);
        var id = result.id;
        // https://github.com/benjamine/jsondiffpatch/blob/master/docs/deltas.md
        _.each(keys, function(key) {
          var $area = $('[data-doc-id="' + id + '"][data-dot-path="' + key + '"]');
          if (!$area.length) {
            return;
          }
          $area.addClass('apos-workflow-area-changed');
          if (_.isArray(result.diff[key])) {
            // The entire area is new
            $area.find('[data-apos-widget]').addClass('apos-workflow-widget-diff apos-workflow-widget-diff--new');
            return;
          }
          var items = result.diff[key].items;
          if (items._t !== 'a') {
            $area.find('[data-apos-widget]').addClass('apos-workflow-widget-diff apos-workflow-widget-diff--new');
            return;
          }
          _.each(items, function(widget, offset) {
            var matches = offset.match(/^_(\d+)$/);
            if (matches) {
              // Moves and deletions are done with a reference to the old offset
              if (Array.isArray(widget)) {
                if (widget[2] === 3) {
                  var id = widget[0]._id;
                  getWidget(id).addClass('apos-workflow-widget-diff apos-workflow-widget-diff--moved');
                } else if (widget[2] === 0) {
                  var data = widget[0];
                  
                  // TODO: more of what follows ought to be shared by
                  // the area editor and this module, probably by factoring
                  // it into a method of the areas module that is easy to call
                  // without being the area editor
                  //
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
                      var offset = matches[1];
                      var $before = $area.findSafe('[data-apos-widget-wrapper]', '[data-apos-area]').eq(offset);
                      if ($before.length) {
                        $before.before($newWidget);
                      } else {
                        $area.append($newWidget);
                      }
                      $newWidget.addClass('apos-workflow-widget-diff apos-workflow-widget-diff--deleted');
                      apos.emit('enhance', $newWidget);
                    }
                  );
                } else if (widget.length === 1) {
                  // Insert
                  getWidget(id).addClass('apos-workflow-widget-diff apos-workflow-widget-diff--new');
                }
              }
            } else if (offset.match(/^\d+$/)) {
              if (Array.isArray(widget)) {
                if (widget.length === 1) {
                  // Insert
                  var id = widget[0]._id;
                  getWidget(id).addClass('apos-workflow-widget-diff apos-workflow-widget-diff--new');
                }
              } else if (typeof(widget) === 'object') {
                // Just a modification
                var id = widget._id;
                $area.findSafe('[data-apos-widget-id]', '[data-apos-area]').eq(parseInt(offset)).addClass('apos-workflow-widget-diff apos-workflow-widget-diff--changed');
              }
            }
          });
        });
        function getWidget(id) {
          return $('[data-apos-widget-id="' + id + '"]');
        }
      }, function() {
        return fail();
      });

      function fail() {
        apos.notify('An error occurred displaying the difference between the documents.', { type: 'error' });
      }
    };
    
    self.addPermissionsFieldType = function() {
      apos.schemas.addFieldType({
        name: 'apostrophe-workflow-permissions',
        populate: self.permissionsPopulate,
        convert: self.permissionsConvert
      });
    };
    
    self.findPermissionsCheckbox = function($fieldset, name, val) {
      return $fieldset.find('input[name="' + name + '"][value="' + val + '"]');
    };
    
    self.findPermissionsLocaleCheckbox = function($fieldset, name, val, locale) {
      return $fieldset.find('input[name="' + name + 'Locales[' + val + '][' + locale + ']"]');
    };

    self.permissionsPopulate = function(object, name, $field, $el, field, callback) {
      var $fieldset = apos.schemas.findFieldset($el, name);
      _.each(object[name] || [], function(val) {
        self.findPermissionsCheckbox($fieldset, name, val).prop('checked', true);
      });
      _.each(object[name + 'Locales'] || {}, function(locales, permission) {
        _.each(locales, function(locale, localeName) {
          self.findPermissionsLocaleCheckbox($fieldset, name, permission, localeName).prop('checked', true);
        });
      });
      reflect();
      $fieldset.on('change', 'input[type="checkbox"]', function() {
        reflect();
      });
      function reflect() {
        _.each(field.choices, function(choice) {
          var $choice = $fieldset.find('[data-apos-permission="' + choice.value + '"]');
          var $tree = $choice.find('.apos-workflow-locale-tree');
          if ($choice.find('[value="' + choice.value + '"]:checked').length) {
            $tree.show();
          } else {
            $tree.hide();
          }
        });
      }
      return setImmediate(callback);
    };

    self.permissionsConvert = function(data, name, $field, $el, field, callback) {
      var $fieldset = apos.schemas.findFieldset($el, name);
      data[name] = [];
      data[name + 'Locales'] = {};
      _.each(field.choices, function(choice) {
        if (self.findPermissionsCheckbox($fieldset, name, choice.value).prop('checked')) {
          data[name].push(choice.value);
          if (!data[name + 'Locales'][choice.value]) {
            data[name + 'Locales'][choice.value] = {};
          }
          _.each(field.locales, function(locale, localeName) {
            if (self.findPermissionsLocaleCheckbox($fieldset, name, choice.value, localeName).prop('checked')) {
              data[name + 'Locales'][choice.value][localeName] = true;
            }
          });
        }
      });
      return setImmediate(callback);
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
    
  }
});
