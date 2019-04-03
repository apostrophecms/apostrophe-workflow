const _ = require('@sailshq/lodash');

module.exports = {
  afterConstruct: function(self) {

    const req = self.get('req');

    // We do not care what the document type is,
    // by default (although the type filter may be
    // used as an actual ui filter)
    self.type(null);

    // OK I lied, we care a lot, but specifically it must be a type
    // to which workflow applies

    const workflow = self.apos.modules['apostrophe-workflow'];

    const types = Object.keys(self.apos.docs.managers).filter(function(type) {
      // Type must be subject to workflow, and user must be able to
      // commit (edit the live locale). The trash type we're ignoring
      // is the legacy trashcan, not your trashed docs
      return (type !== 'trash') && workflow.includeType(type) && self.apos.permissions.can(Object.assign({}, req, { workflowLocale: workflow.liveify(req.locale) }), 'edit-' + type);
    });
    if (!types.length) {
      self.and({ _id: '__iNeverMatch' });
      return;
    }
    self.and({
      workflowLocale: { $exists: 1 },
      type: { $in: types }
    });
    self.permission('edit');
  },
  construct: function(self, options) {
    self.apos.schemas.addFilters(_.filter(self.options.module.schema, { name: 'type' }), {
      override: [ 'type' ]
    }, self);
    self.addFilter('modified', {
      def: null,
      finalize: function() {
        const modified = self.get('modified');
        if (modified === null) {
          return;
        }
        if (modified) {
          self.and({
            workflowModified: true
          });
        } else {
          self.and({
            workflowModified: { $ne: true }
          });
        }
      },
      safeFor: 'manage',
      launder: function(s) {
        return self.apos.launder.booleanOrNull(s);
      },
      choices: function(callback) {
        var choices = [
          {
            value: '0',
            label: 'No'
          },
          {
            value: '1',
            label: 'Yes'
          }
        ];
        return setImmediate(function() {
          return callback(null, choices);
        });
      }
    });
    self.addFilter('submitted', {
      def: null,
      finalize: function() {
        const submitted = self.get('submitted');
        if (submitted === null) {
          return;
        }
        if (submitted) {
          self.and({
            workflowSubmitted: { $exists: 1 }
          });
          return;
        }
        self.and({
          workflowSubmitted: { $exists: 0 }
        });
      },
      safeFor: 'manage',
      launder: function(s) {
        return self.apos.launder.booleanOrNull(s);
      },
      choices: function(callback) {
        var choices = [
          {
            value: '0',
            label: 'No'
          },
          {
            value: '1',
            label: 'Yes'
          }
        ];
        return setImmediate(function() {
          return callback(null, choices);
        });
      }
    });
  }
};
