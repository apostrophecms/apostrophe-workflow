apos.define('apostrophe-workflow', {

  extend: 'apostrophe-context',

  afterConstruct: function(self) {
    self.enableWorkflowMode();
    self.enableSubmit();
    self.enableCommit();
    self.enableManageModal();
  },

  construct: function(self, options) {

    self.enableWorkflowMode = function() {

      // Initially hidden because it takes a while to initialize all the modules
      // and during that time, clicks would be lost. Also we want to look for
      // editable areas on the page.

      if (!self.getEditableDocIds().length) {
        return;
      }

      $('body').find('[data-apos-workflow-menu]').show();

      $('body').on('click', '[data-apos-workflow-mode]', function() {
        
        var mode = $(this).attr('data-apos-workflow-mode');
        self.api('workflow-mode', { mode: mode }, function(result) {
          if (result.status === 'ok') {
            window.location.reload(true);
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
      apos.adminBar.link(self.__meta.name, function() {
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
    
    self.enablePreviewIframe = function(id) {
      self.api('diff', { id: id }, function(result) {
        if (result.status !== 'ok') {
          return fail();
        }
        console.log(result.diff);
        var keys = _.keys(result.diff);
        // https://github.com/benjamine/jsondiffpatch/blob/master/docs/deltas.md
        _.each(keys, function(key) {
          var $area = $('[data-doc-id="' + id + '"][data-dot-path="' + key + '"]');
          if (!$area.length) {
            return;
          }
          $area.addClass('apos-workflow-area-changed');
          var items = result.diff[key].items;
          if (items._t !== 'a') {
            console.log(key + ' is not an array patch');
            $area.find('[data-widget]').addClass('apos-workflow-widget-new');
            return;
          }
          _.each(items, function(widget, offset) {
            console.log(widget, offset);
            var matches = offset.match(/^_(\d+)$/);
            if (matches) {
              console.log('matches');
              // Moves and deletions are done with a reference to the old offset
              if (Array.isArray(widget)) {
                console.log('widget is array');
                if (widget[2] === 3) {
                  console.log('moved');
                  var id = widget[0]._id;
                  console.log(id, getWidget(id).length);
                  getWidget(id).addClass('apos-workflow-widget-moved');
                } else if (widget[2] === 0) {
                  var data = widget[0];
                  console.log('deleted');
                  
                  // TODO: more of what follows ought to be shared by
                  // the area editor and this module, probably by factoring
                  // it into a method of the areas module that is easy to call
                  // without being the area editor
                  //
                  // TODO: this would generate a lot of API requests if a lot
                  // of things were deleted, might be worth serializing them
                  // in an orderly fashion

                  var areaOptions = JSON.parse($area.attr('data-options'));
                  console.log('RENDERING');
                  return $.jsonCall(apos.areas.options.action + '/render-widget',
                    {
                      dataType: 'html'
                    },
                    {
                      data: data,
                      options: areaOptions.widgets[data.type] || {},
                      type: data.type
                    }, function(html) {
                      console.log('** RENDERED');
                      console.log(html);
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
                      console.log('emitting enhance event');
                      apos.emit('enhance', $newWidget);
                    }
                  );
                } else if (widget.length === 1) {
                  console.log('new');
                  // Insert
                  getWidget(id).addClass('apos-workflow-widget-new');
                }
              }
            } else if (offset.match(/^\d+$/)) {
              console.log('numeric offset');
              if (Array.isArray(widget)) {
                console.log('widget is array');
                if (widget.length === 1) {
                  // Insert
                  var id = widget[0]._id;
                  console.log('new 2');
                  getWidget(id).addClass('apos-workflow-widget-new');
                }
              } else if (typeof(widget) === 'object') {
                // Just a modification
                console.log('changed');
                console.log(widget);
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
    
  }
});
