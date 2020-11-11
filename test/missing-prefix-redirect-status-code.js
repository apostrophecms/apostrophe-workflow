var assert = require('assert');

describe('Missing prefix redirect status code', function() {

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
        'products': {},
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
          missingPrefixRedirectStatusCode: 301,
          hostnames: {
            'private': 'private.com',
            'fr': 'exemple.fr',
            'default': 'example.com',
            'us': 'example.com',
            'us-en': 'example.com',
            'us-es': 'example.com',
            'us-de': 'example.com',
            'es': 'example.es',
            'es-CO': 'example.es',
            'es-MX': 'example.es',
            'de': 'example.de',
            'de-de': 'example.de',
            'tt-one': 'tt.com',
            'tt-two': 'tt.com',
            'tt-three': 'tt.com'
          },
          prefixes: {
            // Even private locales must be distinguishable by hostname and/or prefix
            'default': '/default',
            'us': '/us-private',
            // we don't add a prefix for us-en since that locale
            // will reside at the root level and share the hostname
            // with us-es and us-de.
            'us-es': '/es',
            'us-de': '/de',
            'es-CO': '/co',
            'es-MX': '/mx',
            'de-de': '/de',
            'tt-one': '/one',
            'tt-two': '/two',
            'tt-three': '/three'
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
                    },
                    {
                      name: 'us-de'
                    }
                  ]
                },
                {
                  name: 'es',
                  children: [
                    {
                      name: 'es-CO'
                    },
                    {
                      name: 'es-MX'
                    }
                  ]
                },
                {
                  name: 'de',
                  children: [
                    {
                      name: 'de-de'
                    }
                  ]
                },
                {
                  name: 'tt-one'
                },
                {
                  name: 'tt-two'
                },
                {
                  name: 'tt-three'
                },
                {
                  name: 'private',
                  private: true
                },
                {
                  name: 'private2',
                  private: true
                }
              ]
            }
          ],
          defaultLocale: 'default',
          defaultLocalesByHostname: {
            'tt.com': 'tt-one',
            'private2.com': 'private2'
          }
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

  function tryMiddleware(url, after) {
    return tryMiddlewareBody(url, {}, after);
  }

  function tryMiddlewareBody(url, options, after) {
    var req;
    if (options.admin) {
      req = apos.tasks.getReq();
    } else {
      req = apos.tasks.getAnonReq();
    }
    req.absoluteUrl = url;
    var parsed = require('url').parse(req.absoluteUrl);
    req.url = parsed.path;
    req.session = {};
    req.get = function(propName) {
      return {
        Host: parsed.host
      }[propName];
    };
    req.res.redirect = function(status, url) {
      if (!url) {
        url = status;
        status = 302;
      }
      req.res.status = status;
      req.url = url;
      after(req);
    };

    var workflow = apos.modules['apostrophe-workflow'];
    assert(workflow);
    var middleware = workflow.expressMiddleware.middleware;

    middleware(req, req.res, function() {
      after(req);
    });
  }

  it('can find a defaultLocaleByHostname-determined locale via middleware with a custom status code', function(done) {
    tryMiddleware('http://tt.com', function(req) {
      assert(req.locale === 'tt-one');
      assert(req.url === '/one/');
      assert(req.res.status === 301);
      done();
    });
  });

});
