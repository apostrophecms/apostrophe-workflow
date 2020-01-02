var assert = require('assert');

describe('Workflow Core', function() {

  var apos;

  this.timeout(20000);

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
          park: [
            {
              slug: '/',
              published: true,
              _defaults: {
                title: 'Home',
                type: 'home'
              },
              _children: [
                {
                  slug: {
                    'us-en': '/products-en',
                    'fr': '/produits',
                    '_default': '/products'
                  },
                  _defaults: {
                    type: 'product-page',
                    title: 'Product'
                  },
                  published: true,
                  parkedId: 'products'
                }
              ]
            }
          ],
          types: [
            {
              name: 'home',
              label: 'Home'
            },
            {
              name: 'product-page',
              label: 'Product'
            }
          ]
        },
        'products': {},
        'product-pages': {},
        'apostrophe-workflow': {
          replicateAcrossLocales: false,
          prefixes: {
            'fr': '/fr',
            'us-es': '/es',
            'us-de': '/de'
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
                      name: 'us-de'
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

  it('should create parked pages with prefixes', function() {
    return apos.docs.db.find({ type: 'product-page', workflowLocale: 'fr' }).toArray().then(function(pages) {
      assert(pages && pages[0]);
      assert(pages[0].slug === '/fr/produits');
    });
  });
});
