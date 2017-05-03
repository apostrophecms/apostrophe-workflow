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
    
    self.getEditableDocIds = function() {
      var ids = [];
      $('[data-apos-area][data-apos-area-edit]').each(function() {
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
        self.api('submit', { ids: ids }, function(result) {
          if (result.status !== 'ok') {
            alert('An error occurred.');
          } else {
            alert('Your submission will be reviewed.');
          }
        }, function() {
          alert('An error occurred.');
        });
        return false;
      });
    };

    self.enableCommit = function() {
      $('body').on('click', '[data-apos-workflow-commit]', function() {
        return async.eachSeries(self.getEditableDocIds(), function(id, callback) {
          return self.launchCommitModal(id, callback);
        }, function() {
        });
        return false;
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
                  console.log('deleted');
                  var id = widget[0]._id;
                  var offset = matches[1];
                  // TODO render this widget dynamically and insert it, then...
                  // getWidget(id).addClass('apos-workflow-widget-deleted');
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
