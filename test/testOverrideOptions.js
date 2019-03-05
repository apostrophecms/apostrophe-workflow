const assert = require('assert');
const request = require('request-promise');
const _ = require('@sailshq/lodash');

describe('Override Options', function() {
  this.timeout(5000);
  let apos;

  after(function(done) {
    require('apostrophe/test-lib/util').destroy(apos, done);
  });

  it('should be a property of the apos object', function(done) {
    apos = require('apostrophe')({
      testModule: true,

      modules: {
        'apostrophe-express': {
          port: 7900
        },
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
          locales: [
            {
              name: 'en',
              children: [
                {
                  name: 'fr'
                },
                {
                  name: 'de'
                }
              ]
            }
          ],
          defaultLocale: 'en',
          alias: 'workflow' // for testing only!
        },
        'apostrophe-global': {
          addFields: [
            {
              type: 'boolean',
              name: 'disableExportAfterCommit',
              label: 'Disable Export After Commit',
              def: true
            }
          ],
          overrideOptions: {
            editable: {
              'apos.apostrophe-workflow.disableExportAfterCommit': 'disableExportAfterCommit'
            }
          }
        },
        'apostrophe-override-options': {},
        // For every request act as if an admin were logged in already
        'always-admin': {
          construct: function(self, options) {
            self.expressMiddleware = function(req, res, next) {
              const adminReq = self.apos.tasks.getReq();
              req.user = adminReq.user;
              return next();
            };
          }
        }
      },
      afterInit: function(callback) {
        assert(apos.modules['apostrophe-workflow']);
        return callback(null);
      },
      afterListen: function(err) {
        assert(!err);
        done();
      }
    });
  });

  it('verify disableExportAfterCommit === true for all global docs', function() {
    return apos.docs.db.find({ type: 'apostrophe-global' }).toArray().then(function(docs) {
      return (docs.length === 6) && (!_.find(docs, function(doc) { return doc.disableExportAfterCommit !== true; }));
    });
  });

  it('verify simulated admin login and on all requests', () => {
    return request('http://localhost:7900').then((html) => {
      assert(html.match(/logout/));
      assert(html.match(/"exportAfterCommit":false/));
    });
  });

});
