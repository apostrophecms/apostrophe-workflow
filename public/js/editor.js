// Workflow mode switching and approval request button

function AposWorkflow() {
  var self = this;
  $(function() {
    $('body').on('aposReady', function() {
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
      return false;
    });
    $('body').on('click', '[data-workflow-approve-changes]', function() {
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
          return alert('Server Error, Please Try Again');
        }
        if (data.submitted && (!data.published)) {
          alert('Your changes have been submitted to the moderators for approval.');
        } else if (data.submitted) {
          alert('Some of your changes will require approval. Others were made live.');
          apos.change('workflowApproveCahanges');
        } else if (data.published) {
          alert('Your changes were made live.');
          apos.change('workflowApproveCahanges');
        }
      });
      return false;
    });
    function reflectMode(mode) {
      $('[data-workflow-approve-changes]').toggle(mode === 'draft');
      $('[data-workflow-mode]').removeClass('apos-current');
      $('[data-workflow-mode="' + mode + '"]').addClass('apos-current');
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
    console.log(self.$el[0]);
    self.$list = self.$el.find('[data-pages]');
    console.log(self.$list[0]);
    self.$template = self.$list.find('[data-item].apos-template');
    self.$template.remove();

    return self.load(callback);
  };

  self.addItem = function(item) {
    console.log(self.$template[0]);
    var $newItem = apos.fromTemplate(self.$template);
    console.log($newItem[0]);
    self.$list.append($newItem);
    $newItem.attr('data-slug', item.slug);
    $newItem.attr('data-date', item.submitDraft);
    $newItem.attr('data-author', item.draftSubmittedBy);
    return $newItem;
  };

  self.load = function(callback) {
    $.getJSON('/apos-workflow/load', {}, function(response) {
      if (response.status !== 'ok') {
        alert('An error occurred. Please try again.');
        return callback('error');
      }
      self.$list.html('');
      self.$el.find('[data-some]').toggle(!!response.result.length);
      self.$el.find('[data-none]').toggle(!response.result.length);

      _.each(response.result, function(item) {
        self.addItem(item);
      });
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
  };

  $(function() {
    // Do this late so overrides have time to patch it
    apos.afterYield(function() {
      self.setup();
    });
  });
}
