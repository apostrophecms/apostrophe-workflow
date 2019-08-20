var _ = require('@sailshq/lodash');

module.exports = {
  // A virtual "piece type" only used to display a universal manage modal
  // for documents that are commit-ready. No "modified-document" piece is ever
  // really inserted into the database. -Tom
  extend: 'apostrophe-pieces',
  name: 'workflow-document',
  label: 'Document',
  pluralLabel: 'Documents',
  sort: {
    updatedAt: -1
  },
  beforeConstruct: function(self, options) {
    options.addFilters = [
      {
        name: 'modified'
      },
      {
        name: 'submitted'
      },
      {
        name: 'type'
      }
    ].concat(options.addFilters || []);
    options.addFields = [
      {
        name: 'type',
        type: 'select',
        // Patched after all types are known
        choices: []
      }
    ].concat(options.addFields || []);
    // To prevent warnings about unarranged fields. We do not actually
    // edit this virtual, read-only piece type
    options.arrangeFields = [
      {
        name: 'type',
        fields: [ 'type' ]
      }
    ].concat(options.arrangeFields || []);
    // We do not have fully configurable columns for this custom type,
    // but we configure these two so the sorts work
    options.defaultColumns = [
      {
        name: 'updatedAt',
        label: 'Last Edit',
        sort: {
          'updatedAt': -1
        }
      },
      {
        name: 'workflowLastCommitted',
        label: 'Last Commit',
        sort: {
          'workflowLastCommitted.at': -1
        }
      }
    ];
  },
  construct: function(self, options) {
    var superComposeFilters = self.composeFilters;
    self.options.batchOperations = _.filter(self.options.batchOperations, function(operation) {
      // Only operations that make sense here should come through
      return _.includes([ 'submit', 'commit', 'force-export', 'revert-to-live' ], operation.name);
    });
    self.composeFilters = function() {
      // Move trash filter to end of list
      self.options.addFilters = _.filter(self.options.addFilters || [], function(filter) {
        return (filter.name !== 'trash');
      }).concat(_.filter(self.options.addFilters || [], { name: 'trash' }));
      superComposeFilters();
    };
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
    self.addToAdminBar = function() {
      self.apos.adminBar.add(self.__meta.name, 'Manage');
      const group = _.find(self.apos.adminBar.groups, { label: 'Workflow' });
      if (group) {
        group.items.push(self.__meta.name);
      }
    };
    // Since this is an overview of many doc types, all that is required
    // is that you be able to potentially edit at least one doc type that
    // is subject to workflow
    self.requireEditor = function(req, res, next) {
      if (!_.find(Object.keys(self.apos.docs.managers), function(name) {
        return self.apos.modules['apostrophe-workflow'].includeType(name) && self.apos.permissions.can(req, 'edit-' + name);
      })) {
        return self.apiResponse(res, 'forbidden');
      }
      return next();
    };
  }
};
