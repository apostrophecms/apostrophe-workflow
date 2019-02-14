var _ = require('lodash');

module.exports = {
  // A virtual "piece type" only used to display a universal manage modal
  // for documents that are commit-ready. No "committable" is ever
  // inserted into the database. -Tom
  extend: 'apostrophe-pieces',
  name: 'committable',
  label: 'Document',
  pluralLabel: 'Modified',
  sort: {
    updatedAt: -1
  },
  beforeConstruct: function(self, options) {
    options.addFilters = [
      {
        name: 'type'
      }
    ].concat(options.addFilters || []);
    // This "field" exists to power the above filter,
    // even though we don't edit it anywhere in this
    // virtual piece type
    options.addFields = [
      {
        name: 'type',
        type: 'select',
        // Patched after all types are known
        choices: []
      }
    ].concat(options.addFields || []);
  },
  construct: function(self, options) {
    self.getManagerControls = function(req) {
      // Committables are not real things and cannot be "added"
      return [
        {
          type: 'minor',
          label: 'Finished',
          action: 'cancel'
        }
      ];
    };
    // Clarify that this is not a real piece type to be written to the db, it is
    // an interface to "manage" all piece types with just workflow operations
    self.addGenerateTask = function() {};
    self.insert = function() {
      throw 'This is a virtual piece type never stored to the db';
    };
    self.update = function() {
      throw 'This is a virtual piece type never stored to the db';
    };
    self.on('apostrophe:modulesReady', 'populateTypes', function() {
      const field = _.find(self.schema, { name: 'type' });
      const types = Object.keys(self.apos.docs.managers);
      field.choices = types.map(function(type) {
        const manager = self.apos.docs.getManager(type);
        let label;
        if (self.apos.instanceOf(manager, 'apostrophe-custom-pages')) {
          const def = _.find(self.apos.pages.options.types, { name: type });
          if (def) {
            label = def.label;
          }
        }
        return {
          value: type,
          label: label || manager.pluralLabel || manager.label || type
        };
      });
    });
  }
};

