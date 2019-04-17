var assert = require('assert');
var _ = require('@sailshq/lodash');

describe('Workflow Add Missing Locales Inheritance And Prefix Changes', function() {

  var apos, apos2, apos3, apos4;

  var existsIn = [ 'default', 'us' ];

  this.timeout(5000);

  after(function(done) {
    require('apostrophe/test-lib/util').destroy(apos, function() {
      require('apostrophe/test-lib/util').destroy(apos2, function() {
        require('apostrophe/test-lib/util').destroy(apos3, function() {
          require('apostrophe/test-lib/util').destroy(apos4, done);
        });
      });
    });
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
        _id: 'abc-' + locale,
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
    return apos.docs.db.findWithProjection({ title: 'test' }).toArray().then(function(docs) {
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

  it('can spin up second instance with same db but different prefixes and more locales', function(done) {
    apos2 = require('apostrophe')({
      testModule: true,

      modules: {
        'apostrophe-express': {
          port: 7999
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
          prefixes: {
            // Even private locales must be distinguishable by hostname and/or prefix
            'default': '/default',
            'us': '/us',
            'us-en': '/us-en',
            'us-es': '/us-es',
            'us-fr': '/us-fr'
            // We don't need prefixes for plain fr because
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
                    },
                    {
                      name: 'us-fr'
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
        assert(apos2.modules['apostrophe-workflow']);
        // Should NOT have an alias!
        assert(!apos2.workflow);
        return callback(null);
      },
      afterListen: function(err) {
        assert(!err);
        done();
      }
    });
  });

  // it('new locale appears, existing locales have updated prefixes', function() {
  //   return apos2.docs.db.findWithProjection({ title: 'test' }).toArray().then(function(docs) {
  //     assert(docs);
  //     assert(docs.length === 12);
  //     var fr = _.find(docs, { workflowLocale: 'fr' });
  //     assert(fr);
  //     assert(fr.origin === 'default');
  //     assert(fr.slug === '/test');
  //     var usEn = _.find(docs, { workflowLocale: 'us-en' });
  //     assert(usEn);
  //     assert(usEn.origin === 'us');
  //     assert.equal(usEn.slug, '/us-en/test');
  //     var usFr = _.find(docs, { workflowLocale: 'us-fr' });
  //     assert(usFr);
  //     assert(usFr.origin === 'us');
  //     assert(usFr.slug === '/us-fr/test');
  //   });
  // });

  // it('can spin up third instance where a prefix is removed', function(done) {
  //   apos3 = require('apostrophe')({
  //     testModule: true,

  //     modules: {
  //       'apostrophe-express': {
  //         port: 7998
  //       },
  //       'apostrophe-pages': {
  //         park: [],
  //         types: [
  //           {
  //             name: 'home',
  //             label: 'Home'
  //           },
  //           {
  //             name: 'testPage',
  //             label: 'Test Page'
  //           }
  //         ]
  //       },
  //       'apostrophe-workflow': {
  //         prefixes: {
  //           // Even private locales must be distinguishable by hostname and/or prefix
  //           'default': '/default',
  //           'us': '/us',
  //           'us-en': '/us-en',
  //           'us-es': '/us-es'
  //           // us-fr removed
  //           // We don't need prefixes for plain fr because
  //           // that hostname is not shared with other
  //           // locales
  //         },
  //         locales: [
  //           {
  //             name: 'default',
  //             label: 'Default',
  //             private: true,
  //             children: [
  //               {
  //                 name: 'fr'
  //               },
  //               {
  //                 name: 'us',
  //                 private: true,
  //                 children: [
  //                   {
  //                     name: 'us-en'
  //                   },
  //                   {
  //                     name: 'us-es'
  //                   },
  //                   {
  //                     name: 'us-fr'
  //                   }
  //                 ]
  //               }
  //             ]
  //           }
  //         ],
  //         defaultLocale: 'default'
  //       }
  //     },
  //     afterInit: function(callback) {
  //       assert(apos3.modules['apostrophe-workflow']);
  //       // Should NOT have an alias!
  //       assert(!apos3.workflow);
  //       return callback(null);
  //     },
  //     afterListen: function(err) {
  //       assert(!err);
  //       done();
  //     }
  //   });
  // });

  // it('prefix removed', function() {
  //   return apos3.docs.db.findWithProjection({ title: 'test' }).toArray().then(function(docs) {
  //     assert(docs);
  //     assert(docs.length === 12);
  //     var fr = _.find(docs, { workflowLocale: 'fr' });
  //     assert(fr);
  //     assert(fr.origin === 'default');
  //     assert(fr.slug === '/test');
  //     var usEn = _.find(docs, { workflowLocale: 'us-en' });
  //     assert(usEn);
  //     assert(usEn.origin === 'us');
  //     assert.equal(usEn.slug, '/us-en/test');
  //     var usFr = _.find(docs, { workflowLocale: 'us-fr' });
  //     assert(usFr);
  //     assert(usFr.origin === 'us');
  //     assert(usFr.slug === '/test');
  //   });
  // });

  // it('can spin up fourth instance with no prefix config', function(done) {
  //   apos4 = require('apostrophe')({
  //     testModule: true,

  //     modules: {
  //       'apostrophe-express': {
  //         port: 7997
  //       },
  //       'apostrophe-pages': {
  //         park: [],
  //         types: [
  //           {
  //             name: 'home',
  //             label: 'Home'
  //           },
  //           {
  //             name: 'testPage',
  //             label: 'Test Page'
  //           }
  //         ]
  //       },
  //       'apostrophe-workflow': {
  //         locales: [
  //           {
  //             name: 'default',
  //             label: 'Default',
  //             private: true,
  //             children: [
  //               {
  //                 name: 'fr'
  //               },
  //               {
  //                 name: 'us',
  //                 private: true,
  //                 children: [
  //                   {
  //                     name: 'us-en'
  //                   },
  //                   {
  //                     name: 'us-es'
  //                   },
  //                   {
  //                     name: 'us-fr'
  //                   }
  //                 ]
  //               }
  //             ]
  //           }
  //         ],
  //         defaultLocale: 'default'
  //       }
  //     },
  //     afterInit: function(callback) {
  //       assert(apos4.modules['apostrophe-workflow']);
  //       // Should NOT have an alias!
  //       assert(!apos4.workflow);
  //       return callback(null);
  //     },
  //     afterListen: function(err) {
  //       assert(!err);
  //       done();
  //     }
  //   });
  // });

  // it('prefix removed from everything', function() {
  //   return apos4.docs.db.findWithProjection({ title: 'test' }).toArray().then(function(docs) {
  //     assert(docs);
  //     assert(docs.length === 12);
  //     var fr = _.find(docs, { workflowLocale: 'fr' });
  //     assert(fr);
  //     assert(fr.origin === 'default');
  //     assert(fr.slug === '/test');
  //     var usEn = _.find(docs, { workflowLocale: 'us-en' });
  //     assert(usEn);
  //     assert(usEn.origin === 'us');
  //     assert.equal(usEn.slug, '/test');
  //     var usFr = _.find(docs, { workflowLocale: 'us-fr' });
  //     assert(usFr);
  //     assert(usFr.origin === 'us');
  //     assert(usFr.slug === '/test');
  //   });
  // });

});
