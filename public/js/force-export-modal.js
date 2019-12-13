// A modal for forcing export of a single widget to other locales

apos.define('apostrophe-workflow-force-export-modal', {

  extend: 'apostrophe-workflow-export-modal',

  source: 'force-export-modal',

  verb: 'force-export',

  construct: function(self, options) {
    var superBeforeShow = self.beforeShow;
    self.beforeShow = function(callback) {
      superBeforeShow(function(err) {
        if (err) {
          return callback(err);
        }
        self.$el.find('[for="relatedExisting"]').hide();
        self.$el.on('change', '[name="related"]', function() {
          var value = $(this).prop('checked');
          if (!value) {
            self.$el.find('[for="relatedExisting"]').hide();
            return;
          }
          self.$el.find('[for="relatedExisting"]').show();
        });
        return callback(null);
      });
    };
    self.exportRelatedUnexported = function(locales, callback) {
      if (!options.body.lead) {
        // Don't recurse through the entire site
        return callback(null);
      }
      var related = self.$el.find('[name="related"]').prop('checked');
      var relatedExisting = self.$el.find('[name="relatedExisting"]').prop('checked');
      if (!related) {
        return callback(null);
      }

      var params = { ids: [ options.body.id ], related: true };
      if (!relatedExisting) {
        params.onlyIfNewIn = locales;
      }
      return self.manager.getEditable(params, function(err, result) {
        if (err) {
          return;
        }
        var all = result.modified.concat(result.unmodified).filter(function(id) {
          return id !== options.body.id;
        });
        return async.eachSeries(all, function(id, callback) {
          if (self.manager.commitAllRelated) {
            return self.api('force-export', {
              id: id,
              locales: locales,
              existing: relatedExisting
            }, function(info) {
              if (info.status !== 'ok') {
                return callback(info.status);
              }
              return callback(null);
            }, callback);
          } else if (self.manager.skipAllRelated) {
            return setImmediate(callback);
          } else {
            return apos.create('apostrophe-workflow-force-export-modal',
              _.assign(
                {},
                _.omit(options, [ 'source', 'verb' ]),
                {
                  body: {
                    id: id,
                    lead: false,
                    existing: relatedExisting
                  },
                  // This is throwing Types do not match in indicateCurrentModal
                  after: callback
                }
              )
            );
          }
        }, function(err) {
          return callback && callback(err);
        });
      });
    };
  }

  // The base class already sends everything in options.body so no
  // further modifications are needed on the front end so far

});
