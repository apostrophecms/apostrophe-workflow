// A modal for forcing export of a single widget to other locales

apos.define('apostrophe-workflow-force-export-modal', {

  extend: 'apostrophe-workflow-export-modal',

  source: 'force-export-modal',

  verb: 'force-export',

  construct: function(self, options) {
    self.exportRelatedUnexported = function(locales, callback) {
      if (!options.body.lead) {
        // Don't recurse through the entire site
        return callback(null);
      }
      return self.manager.getEditable({ ids: [ options.body.id ], related: true }, function(err, result) {
        if (err) {
          return;
        }
        var all = result.modified.concat(result.unmodified).filter(function(id) {
          return id !== options.body.id;
        });
        if (all.length) {
          apos.notify('You will also be invited to export related documents, such as images.', { dismiss: true });
        }
        return async.eachSeries(all, function(id, callback) {
          if (self.manager.commitAllRelated) {

          } else if (self.manager.skipAllRelated) {
            return setImmediate(callback);
          } else {
            return self.manager.forceExport(id, callback);
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
