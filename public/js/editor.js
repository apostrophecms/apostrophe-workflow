// Workflow mode switching and approval request button

function AposWorkflow() {
  var self = this;
  $(function() {
    apos.on('ready', function() {
      var mode = apos.data.workflow.mode;
      reflectMode(mode);
    });
    $('body').on('click', '[data-workflow-mode]', function() {
      var mode = $(this).attr('data-workflow-mode');
      $.jsonCall('/apos/workflow-mode', { mode: mode }, function(data) {
        if (data.status !== 'ok') {
          return alert('Server Error, Please Try Again');
        }
        apos.data.workflow.mode = mode;
        reflectMode(mode);
        // Refresh the actual content to show draft or public version
        apos.change('workflowMode');
      });
      $('[data-workflow-mode]').each(function() {
        $(this).removeClass('apos-active');
      });
      $(this).addClass('apos-active');
      return false;
    });
    $('body').on('click', '[data-workflow-approve-changes]', function() {
      if ($(this).hasClass('disabled')) {
        // cancel on disabled click
        return false;
      }
      var $areas = $('.apos-refreshable .apos-area,.apos-refreshable .apos-singleton');
      var slugs = _.map($areas, function(area) {
        return $(area).attr('data-slug');
      });
      _.each($areas, function(area) {
        var $area = $(area);
        // Locate auto-saving areas and tell them to save now
        // so we have consistency in what we publish
        if ($area.is('[data-save]')) {
          // Save synchronously so we know when we're done
          var editor = $area.data('editor');
          if (editor) {
            editor.saveIfNeeded(true);
          }
        }
      });
      $.jsonCall('/apos/workflow-approve-changes', { slugs: slugs }, function(data) {
        if (data.status !== 'ok') {
          apos.notification('Server Error, Please Try Again', {type: 'error'});
        }
        if (data.submitted && (!data.published)) {
          apos.notification('Your changes have been submitted to the moderators for approval.', {type: 'warn'});
        } else if (data.submitted) {
          apos.notification('Some of your changes will require approval. Others were made live.', {type: 'warn'});
          apos.change('workflowApproveCahanges');
        } else if (data.published) {
          apos.notification('Your changes were made live.', {type: 'success'});
          apos.change('workflowApproveCahanges');
        }
      });
      return false;
    });
    function reflectMode(mode) {
      if (mode === 'public') {
        $('[data-workflow-approve-changes]').addClass('disabled');
      } else {
        $('[data-workflow-approve-changes]').removeClass('disabled');
      }
      $('[data-workflow-mode]').removeClass('apos-active');
      $('[data-workflow-mode="' + mode + '"]').addClass('apos-active');
    }

    // Update # next to menu. Don't call this all over,
    // it'll invoke itself every 5 seconds anyway and we
    // don't want those loops to start piling up
    updateManagerMenuCount();

    function updateManagerMenuCount() {
      var $el = $('[data-workflow-manager-button]');
      if (!$el.length) {
        return;
      }
      var $count = $('[data-workflow-manager-count]');
      $.getJSON('/apos-workflow/load', {}, function(response) {
        $count.text(response.count);
        if (response.count === 0) {
          $count.addClass('disabled');
        } else {
          $count.removeClass('disabled');
        }
        setTimeout(updateManagerMenuCount, 5000);
      });
    }
  });
}

// Workflow manager dialog

function AposWorkflowManager() {
  var self = this;
  self.modal = function() {
    self.$el = apos.modalFromTemplate('.apos-workflow-manager', self);
  };

  // Invoked when the modal is ready
  self.init = function(callback) {
    self.$list = self.$el.find('[data-pages]');
    self.$template = self.$list.find('[data-item].apos-template');
    self.$template.remove();

    return self.load(callback);
  };

  self.load = function(callback) {
    $.getJSON('/apos-workflow/load', {}, function(response) {
      if (response.status !== 'ok') {
        alert('An error occurred. Please try again.');
        return callback('error');
      }
      self.$list.html(response.html);
      self.$el.find('[data-some]').toggle(!!response.count);
      self.$el.find('[data-none]').toggle(!response.count);

      // Auto-refresh 5 seconds after the last successful load finished
      setTimeout(function() {
        self.load(function() {});
      }, 5000);
      return callback(null);
    });
  };

  self.setup = function() {
    $('[data-workflow-manager-button]').click(function() {
      self.modal();
      return false;
    });
    if (!(apos.data && apos.data.aposPages.page && apos.data.aposPages.page._publish)) {
      // When workflow is active and we don't have publish permission,
      // we can add new subpages but that's really about it. Don't
      // let mere editors do things for which we don't have
      // a workflow UI
      $('[data-new-page]').siblings().remove();
    }
    if (document.location.href.match(/\?workflowEditMode/)) {
      $('[data-workflow-mode="draft"]').click();
    }
  };

  $(function() {
    // Do this late so overrides have time to patch it
    apos.afterYield(function() {
      self.setup();
    });
  });
}
