apos.define('apostrophe-schemas', {
  construct: function(self, options) {
    var superBeforePopulate = self.beforePopulate;
    self.beforePopulate = function($el, schema, object, callback) {
      if (!object.workflowLocale) {
        return next();
      }
      if (schema.length && schema[0].hints && schema[0].hints.workflowRecursing) {
        return next();
      }
      return apos.modules['apostrophe-workflow'].api('get-live',
        _.pick(object, 'workflowGuid', 'workflowLocale'),
        function(data) {
        if (data.status !== 'ok') {
          return fail();
        }
        // Give each field in the schema a read-only twin that is populated with
        // the live version of the same data, and provide UI for peeking at it to
        // see what's different.
        //
        // This is actually simpler than generating a crappy plaintext representation
        // of the same content. -Tom
        return async.eachSeries(schema, function(field, callback) {
          var $draft = self.findFieldset($el, field.name);
          // The visible live version for preview purposes
          var $live = $draft.clone();
          // A pristine copy for revert purposes
          var $livePristine = $draft.clone();
          // Nest the twin in an apos-field so that findFieldset for the original schema doesn't mistakenly descend into it
          var $wrapper = $('<div class="apos-field apos-workflow-live-field" data-apos-workflow-live-field data-name="workflow-live-' + field.name + '"></div>');
          $wrapper.append($live);
          $wrapper.append($('<div class="apos-workflow-live-field-mask"></div>'));
          $draft.after($wrapper);
          if (!_.isEqual(object[field.name], data.doc[field.name])) {
            $draft.addClass('apos-workflow-field-changed');
          }
          var $draftControls = $(
            '<span class="apos-workflow-field-controls">' +
              '<a href="#" class="apos-workflow-field-current" data-apos-workflow-draft>draft</a> | ' +
              '<a href="#" data-apos-workflow-live>live</a>' +
            '</span>'
          );
          $draft.find('label').prepend($draftControls);
          var $liveControls = $(
            '<span class="apos-workflow-field-controls">' +
              '<a href="#" data-apos-workflow-draft>draft</a> | ' +
              '<a href="#" class="apos-workflow-field-current" data-apos-workflow-live>live</a> <a href="#" data-apos-workflow-revert>revert</a>' +
            '</span>'
          );
          $live.find('label').prepend($liveControls);
          
          $draftControls.on('click', '[data-apos-workflow-live]:first', function() {
            $live.show();
            $draft.hide();
            return false;
          });

          $draftControls.on('click', '[data-apos-workflow-draft]:first', function() {
            // Already there
            return false;
          });

          $liveControls.on('click', '[data-apos-workflow-draft]:first', function() {
            $live.hide();
            $draft.show();
            return false;
          });

          $liveControls.on('click', '[data-apos-workflow-live]:first', function() {
            // Already there
            return false;
          });

          $liveControls.on('click', '[data-apos-workflow-revert]:first', function() {
            var $revert = $livePristine.clone();
            $draft.replaceWith($revert);
            $live.hide();
            apos.schemas.populate($el, [ field ], data.doc, callback);
            return false;
          });

          // Populate it via a schema of just that one field, so we don't reinvent any wheels but it still
          // fits into its separate place in the DOM. Use a hint property to avoid infinite recursion on this.
          // We use hints because the blessing mechanism on the server side ignores them.

          return apos.schemas.populate($wrapper, [ _.merge({ hints: { workflowRecursing: true } }, field) ], data.doc, callback);

        }, function(err) {
          if (err) {
            // Could be an inconsistent state, so treat it as a proper error
            alert('An error occurred. Please try again.');
            return callback(err);
          }
          return next();
        });
      }, function(err) {
        return fail();
      });
      function fail() {
        console.error('Nonfatal error: cannot fetch live version of draft doc.');
        return next();
      }
      function next() {
        return superBeforePopulate($el, schema, object, callback);
      }
    };
    var superAfterPopulate = self.afterPopulate;
    // Disable interaction with the content of a "live" (not draft) field, which is serving as a preview only. Since we
    // don't control the field populators, it's not perfect, but we disable everything that can be disabled, kill
    // mouse events, reject focus as much as we can and add a little opacity.
    self.afterPopulate = function($el, schema, object, callback) {
      // Make sure people can't edit the preview of the live version of the field
      $el.find('[data-apos-workflow-live-field] *').each(function() {
        if (typeof this.disabled != "undefined") {
          this.disabled = true;
        }
      });
      // But allow the toggles to be clicked
      $el.find('[data-apos-workflow-live-field] label:first, [data-apos-workflow-live-field] label:first *').each(function() {
        if (typeof this.disabled != "undefined") {
          this.disabled = false;
        }
      });
      // Try to give away the focus if it arrives via keyboard on an anchor element
      $el.on('focus', '[data-apos-workflow-live-field] a', function() {
        if ($(this).closest('label').length) {
          return;
        }
        $(this).closest('.apos-field').parent().next().find('a,input,select').first().focus();
        return false;
      });
      return superAfterPopulate($el, schema, object, callback);
    };
  }
});
