var assert = require('assert');
var api = require('../lib/api');
var async = require('async');
var _ = require('lodash');
var testDocIds = [];
var pageInitial;

  it('should be a property of the apos object', function(done) {
    apos = require('apostrophe')({
      testModule: true,

      modules: {
        'apostrophe-pages': {
          park: [],
          types: [
            {
              name: 'home',
              label: 'Home'
            },
            {
              name: 'testPage',
              label: 'Test Page'
            }
          ]
        },
        'apostrophe-workflow': {
          settings: {
            locales: ['default'],
            defaultLocale: 'default',
            alias: 'worflow' // for testing only!
          }
        },
        'products': {
          extend: 'apostrophe-pieces',
          name: 'product',
          alias: 'products'
        }
      },
      afterInit: function(callback) {
        assert(apos.modules['apostrophe-workflow']);
        return callback(null);
      },
      afterListen: function(err) {
        if (err) {
          console.log("Existrs", err);
        }

        assert(!err);
        done();
      }
    });
  });

  it('Test add draft product to db as draft', () => {
    var req = apos.tasks.getReq({locale: 'default-draft'});
    return apos.products.insert(req, {title: 'initial title'})
      .then(doc => {
        console.log("DOC", doc)
        assert(doc.type === 'product');
        assert(doc.workflowGuid);
        assert(doc.workflowLocale === 'default-draft');
      });
  });

