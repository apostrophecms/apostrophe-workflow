var assert = require('assert');
var _ = require('@sailshq/lodash');
var async = require('async');

describe('Workflow Subdomains and Prefixes', function() {

  var apos;

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
        'apostrophe-express': {
          csrf: {
            disableAnonSession: true
          }
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
          hostnames: {
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
                }
              ]
            }
          ],
          defaultLocale: 'default',
          defaultLocalesByHostname: {
            'tt.com': 'tt-one'
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
    var req = apos.tasks.getAnonReq();
    req.absoluteUrl = url;
    var parsed = require('url').parse(req.absoluteUrl);
    req.url = parsed.path;
    req.session = {};
    req.get = function(propName) {
      return {
        Host: parsed.host
      }[propName];
    };

    var workflow = apos.modules['apostrophe-workflow'];
    assert(workflow);
    var middleware = workflow.expressMiddleware.middleware;

    middleware(req, req.res, function() {
      assert(req.locale && (!req.session.locale));
      after(req);
    });
  }

  it('can find a hostname-determined locale via middleware', function(done) {
    tryMiddleware('http://exemple.fr', function(req) {
      assert(req.locale === 'fr');
      done();
    });
  });

  it('can find a jointly-determined locale via middleware - case 1', function(done) {
    tryMiddleware('http://example.com/es', function(req) {
      assert(req.locale === 'us-es');
      done();
    });
  });

  it('can find a jointly-determined locale via middleware - case 2', function (done) {
    tryMiddleware('http://example.es/co', function (req) {
      assert(req.locale === 'es-CO');
      done();
    });
  });

  it('can detect a root-level locale via middleware - case 1', function(done) {
    tryMiddleware('http://example.com', function(req) {
      assert(req.locale === 'us-en');
      done();
    });
  });

  it('can detect a root-level locale via middleware - case 2', function (done) {
    tryMiddleware('http://example.com/some-url', function (req) {
      assert(req.locale === 'us-en');
      done();
    });
  });

  it('does not misinterpret an API URL as cause for a locale change', function (done) {
    tryMiddleware('http://example.com/modules/apostrophe-workflow/test', function (req) {
      assert(req.locale === 'default');
      done();
    });
  });

  it('does not misinterpret a bad asset URL as cause for a locale change', function (done) {
    tryMiddleware('http://example.com/asset.png', function (req) {
      assert(req.locale === 'default');
      done();
    });
  });

  it('can detect a root-level locale via middleware - case 3', function (done) {
    tryMiddleware('http://example.es', function (req) {
      assert(req.locale === 'es');
      done();
    });
  });

  it('can detect a root-level locale via middleware - case 4', function (done) {
    tryMiddleware('http://example.es/some-url', function (req) {
      assert(req.locale === 'es');
      done();
    });
  });

  it('can differentiate between locales which differ by hostname, but share a prefix - case 1', function (done) {
    tryMiddleware('http://example.com/de', function (req) {
      assert(req.locale === 'us-de');
      done();
    });
  });

  it('can differentiate between locales which differ by hostname, but share a prefix - case 2', function (done) {
    tryMiddleware('http://example.de/de', function (req) {
      assert(req.locale === 'de-de');
      done();
    });
  });

  it('can default the locale reasonably', function(done) {
    tryMiddleware('http://whoknows.com/whatever', function(req) {
      assert(req.locale === 'default');
      done();
    });
  });

  it('can patch a draft with a modification to a widget', function(done) {
    var to = {
      body: {
        type: 'area',
        items: [
          {
            type: 'apostrophe-rich-text',
            content: 'One',
            _id: '1'
          },
          {
            type: 'apostrophe-rich-text',
            content: 'Two',
            _id: '2'
          },
          {
            type: 'apostrophe-rich-text',
            content: 'Three',
            _id: '3'
          }
        ]
      }
    };
    var from = _.cloneDeep(to);
    from.body.items[1].content = 'Modified';
    var draft = _.cloneDeep(to);
    draft.body.items[0].content = 'Localized One';
    apos.modules['apostrophe-workflow'].applyPatch(to, from, draft, function(err) {
      assert(draft.body.items[0].content === 'Localized One');
      assert(draft.body.items[1].content === 'Modified');
      assert(draft.body.items[2].content === 'Three');
      assert(!err);
      done();
    });
  });

  it('can apply a patch that moves a widget without altering it', function(done) {
    var to = {
      body: {
        type: 'area',
        items: [
          {
            type: 'apostrophe-rich-text',
            content: 'One',
            _id: '1'
          },
          {
            type: 'apostrophe-rich-text',
            content: 'Two',
            _id: '2'
          },
          {
            type: 'apostrophe-rich-text',
            content: 'Three',
            _id: '3'
          }
        ]
      }
    };
    var from = _.cloneDeep(to);
    var tmp = from.body.items[1];
    from.body.items[1] = from.body.items[0];
    from.body.items[0] = tmp;
    var draft = _.cloneDeep(to);
    draft.body.items[0].content = 'Localized One';
    draft.body.items[1].content = 'Localized Two';
    draft.body.items[2].content = 'Localized Three';
    apos.modules['apostrophe-workflow'].applyPatch(to, from, draft, function(err) {
      assert(draft.body.items[0].content === 'Localized Two');
      assert(draft.body.items[1].content === 'Localized One');
      assert(draft.body.items[2].content === 'Localized Three');
      assert(!err);
      done();
    });
  });

  it('order comes out right in patch when swapping just two', function(done) {
    var to = {
      body: {
        type: 'area',
        items: [
          {
            type: 'apostrophe-rich-text',
            content: 'One',
            _id: '1'
          },
          {
            type: 'apostrophe-rich-text',
            content: 'Two',
            _id: '2'
          }
        ]
      }
    };
    var from = _.cloneDeep(to);
    var tmp = from.body.items[1];
    from.body.items[1] = from.body.items[0];
    from.body.items[0] = tmp;
    var draft = _.cloneDeep(to);
    draft.body.items[0].content = 'Localized One';
    draft.body.items[1].content = 'Localized Two';
    apos.modules['apostrophe-workflow'].applyPatch(to, from, draft, function(err) {
      assert(draft.body.items[0].content === 'Localized Two');
      assert(draft.body.items[1].content === 'Localized One');
      assert(!err);
      done();
    });
  });
  it('order comes out right in patch when adding a widget with subwidgets', function(done) {
    var from = {
      body: {
        type: 'area',
        items: [
          {
            type: 'singleton',
            _id: '1',
            items: [
              {
                type: 'apostrophe-rich-text',
                content: 'One',
                _id: '1a'
              },
              {
                type: 'apostrophe-rich-text',
                content: 'Two',
                _id: '1b'
              }
            ]
          }
        ]
      }
    };
    var to = _.cloneDeep(from);
    to.body.items[0].items = [];
    var draft = _.cloneDeep(to);
    apos.modules['apostrophe-workflow'].applyPatch(to, from, draft, function(err) {
      assert(draft.body.items[0].items[0].content === 'One');
      assert(draft.body.items[0].items[1].content === 'Two');
      assert(!err);
      done();
    });
  });

  it('order change at top level does not delete subwidgets', function(done) {
    var to = {
      body: {
        type: 'area',
        items: [
          {
            type: 'panel',
            _id: '1',
            'headline': {
              items: [
                {
                  _id: '1a',
                  type: 'apostrophe-rich-text',
                  content: 'Test Headline'
                }
              ]
            }
          },
          {
            type: 'apostrophe-rich-text',
            _id: '2',
            content: 'Two'
          },
          {
            type: 'apostrophe-rich-text',
            _id: '3',
            content: 'Three'
          }
        ]
      }
    };

    var from = _.cloneDeep(to);
    var draft = _.cloneDeep(to);
    draft.body.items[0].headline.items[0].content = 'Localized Headline';
    draft.body.items[1].content = 'Localized Two';
    draft.body.items[2].content = 'Localized Three';
    assert(draft.body.items[0].headline.items.length === 1);
    var tmp = from.body.items[1];
    from.body.items[1] = from.body.items[0];
    from.body.items[0] = tmp;
    apos.modules['apostrophe-workflow'].applyPatch(to, from, draft, function(err) {
      assert(!err);
      assert(draft.body.items[0].type === 'apostrophe-rich-text');
      assert(draft.body.items[0].content === 'Localized Two');
      assert(draft.body.items[1].type === 'panel');
      assert(draft.body.items[1].headline);
      assert(draft.body.items[1].headline.items.length === 1);
      assert(draft.body.items[1].headline.items[0].content === 'Localized Headline');
      assert(draft.body.items[2].type === 'apostrophe-rich-text');
      assert(draft.body.items[2].content === 'Localized Three');
      done();
    });
  });
  it('addition at top level works properly in the middle', function(done) {
    var to = {
      body: {
        type: 'area',
        items: [
          {
            type: 'panel',
            _id: '1',
            'headline': {
              items: [
                {
                  _id: '1a',
                  type: 'apostrophe-rich-text',
                  content: 'Test Headline'
                }
              ]
            }
          },
          {
            type: 'apostrophe-rich-text',
            _id: '2',
            content: 'Two'
          },
          {
            type: 'apostrophe-rich-text',
            _id: '3',
            content: 'Three'
          }
        ]
      }
    };

    var from = _.cloneDeep(to);
    var draft = _.cloneDeep(to);
    draft.body.items[0].headline.items[0].content = 'Localized Headline';
    draft.body.items[1].content = 'Localized Two';
    draft.body.items[2].content = 'Localized Three';
    assert(draft.body.items[0].headline.items.length === 1);
    var tmp = from.body.items[1];
    from.body.items[1] = from.body.items[0];
    from.body.items[0] = tmp;
    from.body.items.splice(1, 0, {
      type: 'apostrophe-rich-text',
      _id: '11',
      content: 'Added'
    });
    apos.modules['apostrophe-workflow'].applyPatch(to, from, draft, function(err) {
      assert(!err);
      assert(draft.body.items[0].type === 'apostrophe-rich-text');
      assert(draft.body.items[0].content === 'Localized Two');
      assert(draft.body.items[1].type === 'apostrophe-rich-text');
      assert(draft.body.items[1].content === 'Added');
      assert(draft.body.items[2].type === 'panel');
      assert(draft.body.items[2].headline);
      assert(draft.body.items[2].headline.items.length === 1);
      assert(draft.body.items[2].headline.items[0].content === 'Localized Headline');
      assert(draft.body.items[3].type === 'apostrophe-rich-text');
      assert(draft.body.items[3].content === 'Localized Three');
      done();
    });
  });
  it('append produces the right order with 2 items', function(done) {
    var to = {
      body: {
        type: 'area',
        items: [
          {
            type: 'apostrophe-rich-text',
            _id: '1',
            content: 'one'
          },
          {
            type: 'apostrophe-rich-text',
            _id: '2',
            content: 'two'
          },
          {
            type: 'apostrophe-rich-text',
            _id: '3',
            content: 'three'
          }
        ]
      }
    };
    var from = _.cloneDeep(to);
    from.body.items = from.body.items.concat([
      {
        type: 'apostrophe-rich-text',
        _id: '4',
        content: 'four'
      },
      {
        type: 'apostrophe-rich-text',
        _id: '5',
        content: 'five'
      }
    ]);
    var draft = _.cloneDeep(to);
    apos.modules['apostrophe-workflow'].applyPatch(to, from, draft, function(err) {
      assert(!err);
      assert(draft.body.items.length === 5);
      var i;
      for (i = 0; (i < 5); i++) {
        assert(draft.body.items[i]._id === (i + 1).toString());
      }
      done();
    });
  });

  it('getCriteriaAcrossLocales throws exception if doc has no workflowGuid', function() {
    var w = apos.modules['apostrophe-workflow'];
    var req = apos.tasks.getReq();
    var error;
    try {
      return w.getCriteriaAcrossLocales(req, {
        _id: 'foo',
        type: 'bar'
      }, [ 'en', 'fr' ], {});
    } catch (e) {
      error = e;
    }
    assert(error);
  });

  it('getCriteriaAcrossLocales produces nice response with workflowGuid', function() {
    var w = apos.modules['apostrophe-workflow'];
    var req = apos.tasks.getReq();
    var error;
    var criteria;
    try {
      criteria = w.getCriteriaAcrossLocales(req, {
        _id: 'foo',
        type: 'bar',
        workflowGuid: 'baz'
      }, [ 'fr', 'us' ], {});
    } catch (e) {
      error = e;
    }
    assert(!error);
    assert(criteria);
    assert(criteria.$and);
    assert(criteria.$and.length === 2);
    assert(criteria.$and[0].workflowGuid === 'baz');
    var $in = criteria.$and[0].workflowLocale.$in;
    assert($in);
    assert($in[0] === 'fr');
    assert($in[1] === 'us');
    assert(!$in[2]);
  });

  it('getCriteriaAcrossLocales respects mode === "both"', function() {
    var w = apos.modules['apostrophe-workflow'];
    var req = apos.tasks.getReq();
    var error;
    var criteria;
    try {
      criteria = w.getCriteriaAcrossLocales(req, {
        _id: 'foo',
        type: 'bar',
        workflowGuid: 'baz'
      }, [ 'fr', 'us' ], { mode: 'both' });
    } catch (e) {
      error = e;
    }
    assert(!error);
    assert(criteria);
    assert(criteria.$and);
    assert(criteria.$and.length === 2);
    assert(criteria.$and[0].workflowGuid === 'baz');
    var $in = criteria.$and[0].workflowLocale.$in;
    assert($in);
    assert($in[0] === 'fr');
    assert($in[1] === 'us');
    assert($in[2] === 'fr-draft');
    assert($in[3] === 'us-draft');
    assert(!$in[4]);
  });

  it('getCriteriaAcrossLocales respects mode === "draft"', function() {
    var w = apos.modules['apostrophe-workflow'];
    var req = apos.tasks.getReq();
    var error;
    var criteria;
    try {
      criteria = w.getCriteriaAcrossLocales(req, {
        _id: 'foo',
        type: 'bar',
        workflowGuid: 'baz'
      }, [ 'fr', 'us' ], { mode: 'draft' });
    } catch (e) {
      error = e;
    }
    assert(!error);
    assert(criteria);
    assert(criteria.$and);
    assert(criteria.$and.length === 2);
    assert(criteria.$and[0].workflowGuid === 'baz');
    var $in = criteria.$and[0].workflowLocale.$in;
    assert($in);
    assert($in[0] === 'fr-draft');
    assert($in[1] === 'us-draft');
    assert(!$in[2]);
  });

  it('getCriteriaAcrossLocales respects mode === "live"', function() {
    var w = apos.modules['apostrophe-workflow'];
    var req = apos.tasks.getReq();
    var error;
    var criteria;
    try {
      criteria = w.getCriteriaAcrossLocales(req, {
        _id: 'foo',
        type: 'bar',
        workflowGuid: 'baz'
      }, [ 'fr-draft', 'us' ], { mode: 'live' });
    } catch (e) {
      error = e;
    }
    assert(!error);
    assert(criteria);
    assert(criteria.$and);
    assert(criteria.$and.length === 2);
    assert(criteria.$and[0].workflowGuid === 'baz');
    var $in = criteria.$and[0].workflowLocale.$in;
    assert($in);
    assert($in[0] === 'fr');
    assert($in[1] === 'us');
    assert(!$in[2]);
  });

  it('getCriteriaAcrossLocales respects locales === "all"', function() {
    var w = apos.modules['apostrophe-workflow'];
    var req = apos.tasks.getReq();
    var error;
    var criteria;
    try {
      criteria = w.getCriteriaAcrossLocales(req, {
        _id: 'foo',
        type: 'bar',
        workflowGuid: 'baz'
      }, 'all', {});
    } catch (e) {
      error = e;
    }
    assert(!error);
    assert(criteria);
    assert(criteria.$and);
    assert(criteria.$and.length === 2);
    assert(criteria.$and[0].workflowGuid === 'baz');
    var $in = criteria.$and[0].workflowLocale.$in;
    assert($in);
    var locales = [
      'default',
      'default-draft',
      'fr',
      'fr-draft',
      'us',
      'us-draft',
      'us-en',
      'us-en-draft',
      'us-es',
      'us-es-draft',
      'us-de',
      'us-de-draft',
      'es',
      'es-draft',
      'es-CO',
      'es-CO-draft',
      'es-MX',
      'es-MX-draft',
      'de',
      'de-draft',
      'de-de',
      'de-de-draft',
      'tt-one',
      'tt-one-draft',
      'tt-two',
      'tt-two-draft',
      'tt-three',
      'tt-three-draft'
    ];
    assert(_.isEqual(locales, $in));
  });

  it('getCriteriaAcrossLocales respects permissions', function() {
    var w = apos.modules['apostrophe-workflow'];
    var req = apos.tasks.getAnonReq();
    var error;
    var criteria;
    try {
      criteria = w.getCriteriaAcrossLocales(req, {
        _id: 'foo',
        type: 'bar',
        workflowGuid: 'baz'
      }, 'all', {});
    } catch (e) {
      error = e;
    }
    assert(!error);
    assert(criteria);
    assert(criteria.$and);
    assert(criteria.$and.length === 2);
    assert(criteria.$and[0].workflowGuid === 'baz');
    // We are looking for the stub criteria the permissions module uses when
    // it sees that an anon user should never be able to do something
    assert(criteria.$and[1]._id === '__iNeverMatch');
  });

  it('setPropertiesAcrossLocales works', function(done) {
    var w = apos.modules['apostrophe-workflow'];
    var req = apos.tasks.getReq();
    var home;
    return async.series([
      fetch,
      set,
      fetchResults,
      fetchUnrelated
    ], function(err) {
      assert(!err);
      done();
    });
    function fetch(callback) {
      return apos.pages.find(req, { type: 'home' }).toObject(function(err, _home) {
        assert(!err);
        assert(_home);
        home = _home;
        return callback(null);
      });
    }
    function set(callback) {
      return w.setPropertiesAcrossLocales(req, home, { age: 50 }, [ 'us', 'fr' ], {}, function(err) {
        assert(!err);
        return callback(null);
      });
    }
    function fetchResults(callback) {
      return apos.docs.db.findWithProjection({ workflowGuid: home.workflowGuid }).toArray(function(err, docs) {
        assert(!err);
        var us = _.find(docs, { workflowLocale: 'us' });
        assert(us);
        assert(us.age === 50);
        var fr = _.find(docs, { workflowLocale: 'fr' });
        assert(fr);
        assert(fr.age === 50);
        var usDraft = _.find(docs, { workflowLocale: 'us-draft' });
        assert(usDraft);
        assert(usDraft.age !== 50);
        return callback(null);
      });
    }
    function fetchUnrelated(callback) {
      // Make sure that pages other than the desired page were unaffected
      return apos.docs.db.findWithProjection({ workflowGuid: { $ne: home.workflowGuid, $exists: 1 } }).toArray(function(err, docs) {
        assert(!err);
        var us = _.find(docs, { workflowLocale: 'us' });
        assert(us);
        assert(us.age !== 50);
        return callback(null);
      });
    }
  });

  it('anon can fetch public fr home page', function(done) {
    return apos.pages.find(apos.tasks.getAnonReq({ locale: 'fr' }), { slug: '/' }).toObject(function(err, page) {
      assert(!err);
      assert(page);
      assert(page.workflowLocale === 'fr');
      done();
    });
  });

  it('anon cannot fetch private default home page', function(done) {
    return apos.pages.find(apos.tasks.getAnonReq({ locale: 'default' }), { slug: '/default' }).toObject(function(err, page) {
      assert(!err);
      assert(!page);
      done();
    });
  });

  it('user with private-locales permission can fetch private default home page', function(done) {
    var req = apos.tasks.getAnonReq({
      locale: 'default',
      user: {
        _permissions: {
          'private-locales': true
        }
      }
    });
    return apos.pages.find(req, { slug: '/default/' }).toObject(function(err, page) {
      assert(!err);
      assert(page);
      assert(page.workflowLocale === 'default');
      done();
    });
  });

  it('guessLocale produces sensible results', function() {
    var req = apos.tasks.getAnonReq({
      locale: false,
      get: function() {
        return 'irrelevant.com';
      }
    });
    apos.modules['apostrophe-workflow'].guessLocale(req);
    assert(req.locale === 'default');
    req = apos.tasks.getAnonReq({
      locale: false,
      get: function() {
        return 'tt.com';
      }
    });
    apos.modules['apostrophe-workflow'].guessLocale(req);
    assert(req.locale === 'tt-one');
  });

});
