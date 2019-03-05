var assert = require('assert');
var apos, apos2;
var _ = require('@sailshq/lodash');

describe('test global def', function() {
  this.timeout(5000);
  after(function(done) {
    require('apostrophe/test-lib/util').destroy(apos, function() {
      require('apostrophe/test-lib/util').destroy(apos2, done);
    });
  });
  it('global should exist on the apos object', function(done) {
    apos = require('apostrophe')({
      testModule: true,
      shortName: 'test',
      modules: {
        'apostrophe-express': {
          secret: 'xxx',
          port: 7900
        },
        'apostrophe-global': {
          addFields: [
            {
              name: 'testString',
              type: 'string',
              def: 'populated def'
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
        }
      },
      afterInit: function(callback) {
        assert(apos.global);
        // In tests this will be the name of the test file,
        // so override that in order to get apostrophe to
        // listen normally and not try to run a task. -Tom
        apos.argv._ = [];
        return callback(null);
      },
      afterListen: function(err) {
        assert(!err);
        done();
      }
    });
  });

  it('should populate def values of schema properties across locales at insert time', function(done) {
    return apos.docs.db.find({ slug: 'global' }).toArray(function(err, docs) {
      assert(!err);
      assert(docs.length === 6);
      assert(!_.find(docs, function(doc) {
        return doc.testString !== 'populated def';
      }));
      done();
    });
  });

  it('global should exist on the second apos object', function(done) {
    apos2 = require('apostrophe')({
      testModule: true,
      // intentionally the same as previous
      shortName: 'test',
      modules: {
        'apostrophe-express': {
          secret: 'xxx',
          port: 7901
        },
        'apostrophe-global': {
          addFields: [
            {
              name: 'anotherString',
              type: 'string',
              def: 'populated anotherString def'
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
        }
      },
      afterInit: function(callback) {
        assert(apos2.global);
        // In tests this will be the name of the test file,
        // so override that in order to get apostrophe to
        // listen normally and not try to run a task. -Tom
        apos2.argv._ = [];
        return callback(null);
      },
      afterListen: function(err) {
        assert(!err);
        done();
      }
    });
  });

  it('should populate def values of schema properties at update time', function(done) {
    return apos.docs.db.find({ slug: 'global' }).toArray(function(err, docs) {
      assert(!err);
      assert(docs.length === 6);
      assert(!_.find(docs, function(doc) {
        return (doc.testString !== 'populated def') || (doc.anotherString !== 'populated anotherString def');
      }));
      done();
    });
  });
});
