apos.define('apostrophe-workflow', {

  extend: 'apostrophe-context',

  afterConstruct: function(self) {
    self.enableWorkflowMode();
    self.enableSubmit();
    self.enableCommit();
    self.enableHistory();
    self.enableExport();
    self.enableReview();
    self.enableManageModal();
    self.addPermissionsFieldType();
    self.enableLocalePickerModal();
  },

  construct: function(self, options) {

    self.locales = options.locales;

    self.enableWorkflowMode = function() {

      // Initially hidden because it takes a while to initialize all the modules
      // and during that time, clicks would be lost. Also we want to look for
      // editable areas on the page.

      if (!self.getEditableDocIds().length) {
        return;
      }

      $('body').find('[data-apos-workflow-menu]').css({'display': 'inline-block'});

      $('body').on('click', '[data-apos-workflow-mode]', function() {
        
        var mode = $(this).attr('data-apos-workflow-mode');
        self.api('workflow-mode', { workflowGuid: self.options.contextGuid, mode: mode }, function(result) {
          if (result.status === 'ok') {
            window.location.href = result.url;
          }
        });
      });
    };

    // Get the ids of the docs related to the areas in the rendered HTML that are editable, or would be
    // if we were not in live mode.

    self.getEditableDocIds = function() {
      var ids = [];
      $('[data-apos-area][data-apos-area-edit],[data-apos-area][data-apos-area-disabled-editing]').each(function() {
        var $area = $(this);
        var id = $area.attr('data-doc-id');
        if (id) {
          ids.push(id);
        }
      });
      ids = _.uniq(ids);
      return ids;
    };
    
    self.enableSubmit = function() {
      $('body').on('click', '[data-apos-workflow-submit]', function() {
        var ids = self.getEditableDocIds();
        self.submit(ids);
        return false;
      });
    };

    self.enableCommit = function() {
      $('body').on('click', '[data-apos-workflow-commit]', function() {
        self.commit(self.getEditableDocIds());
        return false;
      });
    };
    
    self.enableHistory = function() {
      apos.ui.link('apos-workflow-history', null, function($el, id) {
        return apos.create('apostrophe-workflow-history-modal', 
          _.assign({
            manager: self,
            body: { id: id }
          }, options)
        );
      });
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
      self.api('submit', { ids: ids }, function(result) {
        if (result.status !== 'ok') {
          alert('An error occurred submitting the document for approval.');
          return callback && callback('error');
        } else {
          alert('Your submission will be reviewed.');
          return callback && callback(null);
        }
      }, function() {
        alert('An error occurred.');
        return callback && callback('error');
      });
    }
    
    // Present commit modals for all ids in the array, one after another
    self.commit = function(ids, callback) {
      return async.eachSeries(ids, function(id, callback) {
        return self.launchCommitModal(id, callback);
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
    
    self.launchCommitModal = function(id, callback) {
      return apos.create(self.__meta.name + '-commit-modal', _.assign({
        manager: self,
        body: { id: id },
        after: callback
      }, options));
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
            $area.find('[data-apos-widget]').addClass('apos-workflow-widget-new');
            return;
          }
          var items = result.diff[key].items;
          if (items._t !== 'a') {
            $area.find('[data-apos-widget]').addClass('apos-workflow-widget-new');
            return;
          }
          _.each(items, function(widget, offset) {
            var matches = offset.match(/^_(\d+)$/);
            if (matches) {
              // Moves and deletions are done with a reference to the old offset
              if (Array.isArray(widget)) {
                if (widget[2] === 3) {
                  var id = widget[0]._id;
                  getWidget(id).addClass('apos-workflow-widget-moved');
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
                      $newWidget.addClass('apos-workflow-widget-deleted');
                      apos.emit('enhance', $newWidget);
                    }
                  );
                } else if (widget.length === 1) {
                  // Insert
                  getWidget(id).addClass('apos-workflow-widget-new');
                }
              }
            } else if (offset.match(/^\d+$/)) {
              if (Array.isArray(widget)) {
                if (widget.length === 1) {
                  // Insert
                  var id = widget[0]._id;
                  getWidget(id).addClass('apos-workflow-widget-new');
                }
              } else if (typeof(widget) === 'object') {
                // Just a modification
                var id = widget._id;
                $area.findSafe('[data-apos-widget-id]', '[data-apos-area]').eq(parseInt(offset)).addClass('apos-workflow-widget-changed');
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
        alert('An error occurred displaying the difference between the documents.');
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
