var assert = require('assert');
var _ = require('@sailshq/lodash');

describe('Workflow Add Missing Locales Inheritance', function() {

  var apos;

  var existsIn = [ 'default', 'us' ];

  this.timeout(5000);

  after(function(done) {
    require('apostrophe/test-lib/util').destroy(apos, done);
  });

  /// ///
  // EXISTENCE
  /// ///

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
          prefixes: {
            // Even private locales must be distinguishable by hostname and/or prefix
            'default': '/default',
            'us': '/us',
            'us-en': '/en',
            'us-es': '/es'
            // We don't need prefixes for fr because
            // that hostname is not shared with other
            // locales
          },
          locales: [
            {
              name: 'default',
              label: 'Default',
              private: true,
              children: [
                {
                  name: 'fr'
                },
                {
                  name: 'us',
                  private: true,
                  children: [
                    {
                      name: 'us-en'
                    },
                    {
                      name: 'us-es'
                    }
                  ]
                }
              ]
            }
          ],
          defaultLocale: 'default'
        }
      },
      afterInit: function(callback) {
        assert(apos.modules['apostrophe-workflow']);
        // Should NOT have an alias!
        assert(!apos.workflow);
        return callback(null);
      },
      afterListen: function(err) {
        assert(!err);
        done();
      }
    });
  });

  it('can insert docs at a low level for test purposes', function() {
    existsIn = existsIn.concat(_.map(existsIn, function(locale) {
      return locale + '-draft';
    }));
    return apos.docs.db.insert(_.map(existsIn, function(locale) {
      return {
        workflowGuid: 'abc',
        workflowLocale: locale,
        type: 'testPage',
        origin: locale,
        title: 'test',
        slug: '/' + locale + '/test',
        path: '/' + locale + '/test'
      };
    }));
  });

  it('can execute add-missing-locales task', function(callback) {
    return apos.modules['apostrophe-workflow'].addMissingLocalesTask(apos, apos.argv, callback);
  });

  it('missing locales now have copies inherited from correct ancestors', function() {
    return apos.docs.db.find({ title: 'test' }).toArray().then(function(docs) {
      assert(docs);
      assert(docs.length === 10);
      var fr = _.find(docs, { workflowLocale: 'fr' });
      assert(fr);
      assert(fr.origin === 'default');
      var usEn = _.find(docs, { workflowLocale: 'us-en' });
      assert(usEn);
      assert(usEn.origin === 'us');
    });
  });

});
