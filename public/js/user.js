console.log('invoked');

apos.define('apostrophe-workflow', {

  extend: 'apostrophe-context',

  afterConstruct: function(self) {
    self.enableWorkflowMode();
    self.enableSubmit();
    self.enableModal();
  },

  construct: function(self, options) {

    self.enableWorkflowMode = function() {

      // Initially hidden because it takes a while to initialize all the modules
      // and during that time, clicks would be lost. -Tom
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
    
    self.enableSubmit = function() {
      $('body').on('click', '[data-apos-workflow-submit]', function() {
        var ids = [];
        $('[data-apos-area]').each(function() {
          var $area = $(this);
          var id = $area.attr('data-doc-id');
          if (id) {
            ids.push(id);
          }
        });
        ids = _.uniq(ids);
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
    
    self.enableModal = function() {
      apos.adminBar.link(self.__meta.name, function() {
        self.launchModal();
      });
    };
    
    self.launchModal = function() {
      return apos.create(self.__meta.name + '-modal', _.assign({ manager: self }, options));
    };

  }
});
