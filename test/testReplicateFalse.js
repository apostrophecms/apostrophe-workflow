const assert = require('assert');
const _ = require('@sailshq/lodash');
const Promise = require('bluebird');

describe('Workflow with replicateAcrossLocales set to false: initial locales', function() {

  let apos;

  this.timeout(20000);

  after(function(done) {
    // Do not destroy database yet, second block explores what happens
    // when we add locales to it
    apos.destroy(function(err) {
      assert(!err);
      done();
    });
  });

  /// ///
  // EXISTENCE
  /// ///

  it('should be a property of the apos object', function(done) {
    var locales = [
      {
        name: 'default',
        label: 'Default',
        private: true,
        children: [
          {
            name: 'fr'
          },
          {
            name: 'us'
          },
          {
            name: 'es'
          }
        ]
      }
    ];
    return instantiate(locales, function(err, _apos) {
      assert(!err);
      apos = _apos;
      done();
    });
  });

  it('home page should be replicated', function() {
    return apos.docs.db.find({ level: 0, slug: '/' }).toArray().then(function(homes) {
      assert(homes);
      assert(homes.length === 8);
      const homeLocales = _.pluck(homes, 'workflowLocale');
      assert(!Object.keys(apos.workflow.locales).find(function(locale) {
        return (!(homeLocales.indexOf(locale) !== -1));
      }));
    });
  });

  it('global doc page should be replicated', function() {
    return apos.docs.db.find({ type: 'apostrophe-global' }).toArray().then(function(globals) {
      assert(globals);
      assert(globals.length === 8);
      const globalLocales = _.pluck(globals, 'workflowLocale');
      assert(!Object.keys(apos.workflow.locales).find(function(locale) {
        return (!(globalLocales.indexOf(locale) !== -1));
      }));
    });
  });

  it('parked test page should be replicated', function() {
    return apos.docs.db.find({ slug: '/parked-test-page' }).toArray().then(function(test) {
      assert(test);
      assert(test.length === 8);
      const testLocales = _.pluck(test, 'workflowLocale');
      assert(!Object.keys(apos.workflow.locales).find(function(locale) {
        return (!(testLocales.indexOf(locale) !== -1));
      }));
    });
  });

  it('newly inserted subpage is only replicated draft/live', function() {
    let req = apos.tasks.getReq();
    return apos.pages.find(req, { slug: '/' }).toObject().then(function(home) {
      assert(home);
      return apos.pages.insert(req, home._id, { title: 'About', slug: '/about', type: 'testPage', published: true });
    }).then(function(subpage) {
      assert(subpage);
      assert(subpage.slug === '/about');
      assert(subpage.workflowGuid);
      return apos.docs.db.find({ workflowGuid: subpage.workflowGuid }).toArray();
    }).then(function(peers) {
      assert(peers.length === 2);
      assert(peers.find(function(peer) {
        return peer.workflowLocale === apos.workflow.liveify(req.locale);
      }));
      assert(peers.find(function(peer) {
        return peer.workflowLocale === apos.workflow.draftify(req.locale);
      }));
    });
  });

  it('make sure locale of all docs can be distinguished easily for testing who replicated from whom', function() {
    return apos.docs.db.find({}).toArray().then(function(docs) {
      return Promise.mapSeries(docs, function(doc) {
        doc.title = doc.slug + ': original locale: ' + doc.workflowLocale;
        return apos.docs.db.update({ _id: doc._id }, doc);
      });
    });
  });

  it('insert test products and establish relationships', function() {
    const req = apos.tasks.getReq();
    const products = _.range(0, 10).map(function(n) {
      return {
        title: 'product ' + n
      };
    });
    let last = null;
    return Promise.mapSeries(products, function(product, i) {
      if (i < 5) {
        product.relatedId = last && last._id;
      }
      return apos.products.insert(req, product);
    }).then(function() {
      return apos.docs.db.find({ level: 0 }).toArray();
    }).then(function(homes) {
      return Promise.mapSeries(homes, function(home) {
        return Promise.try(function() {
          return apos.docs.db.findOne({ title: 'product 0' }, { workflowLocale: home.workflowLocale });
        }).then(function(product) {
          return apos.docs.db.update({
            _id: home._id
          }, {
            $set: {
              relatedId: product._id
            }
          });
        });
      });
    });
  });
});

describe('Workflow with replicateAcrossLocales set to false: expanded locales', function() {

  let apos;

  this.timeout(20000);

  after(function(done) {
    // This time destroy database
    require('apostrophe/test-lib/util').destroy(apos, done);
  });

  /// ///
  // EXISTENCE
  /// ///

  it('should be a property of the apos object', function(done) {
    var locales = [
      {
        name: 'default',
        label: 'Default',
        private: true,
        children: [
          {
            name: 'fr'
          },
          {
            name: 'us'
          },
          {
            name: 'es',
            children: [
              {
                name: 'es-mx'
              }
            ]
          }
        ]
      }
    ];
    return instantiate(locales, function(err, _apos) {
      assert(!err);
      apos = _apos;
      done();
    });
  });

  it('home page should be replicated', function() {
    return apos.docs.db.find({ level: 0, slug: '/' }).toArray().then(function(homes) {
      assert(homes);
      assert(homes.length === 10);
      const homeLocales = _.pluck(homes, 'workflowLocale');
      assert(!Object.keys(apos.workflow.locales).find(function(locale) {
        return (!(homeLocales.indexOf(locale) !== -1));
      }));
    });
  });

  it('global doc page should be replicated', function() {
    return apos.docs.db.find({ type: 'apostrophe-global' }).toArray().then(function(globals) {
      assert(globals);
      assert(globals.length === 10);
      const globalLocales = _.pluck(globals, 'workflowLocale');
      assert(!Object.keys(apos.workflow.locales).find(function(locale) {
        return (!(globalLocales.indexOf(locale) !== -1));
      }));
    });
  });

  it('parked test page should be replicated', function() {
    return apos.docs.db.find({ slug: '/parked-test-page' }).toArray().then(function(test) {
      assert(test);
      assert(test.length === 10);
      const testLocales = _.pluck(test, 'workflowLocale');
      assert(!Object.keys(apos.workflow.locales).find(function(locale) {
        return (!(testLocales.indexOf(locale) !== -1));
      }));
    });
  });

  it('es-mx-draft parked page should get content of es-draft, not default', function() {
    return apos.docs.db.find({ slug: '/parked-test-page', workflowLocale: 'es-mx-draft' }).toArray().then(function(pages) {
      assert(pages && pages[0]);
      assert(pages[0].title === '/parked-test-page: original locale: es-draft');
    });
  });

  it('Normally inserted subpage exists but was not replicated to new locale', function() {
    return apos.docs.db.find({ slug: '/about' }).toArray().then(function(docs) {
      // Only default and default-draft
      assert(docs.length === 2);
    });
  });

});

function instantiate(locales, callback) {
  var apos = require('apostrophe')({
    testModule: true,

    modules: {
      'apostrophe-custom-pages': {
        addFields: [
          {
            name: '_featured',
            type: 'joinByOne',
            withType: 'product'
          }
        ]
      },
      'apostrophe-pages': {
        park: [
          {
            type: 'testPage',
            slug: '/parked-test-page',
            parkedId: 'parked-test-page'
          }
        ],
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
      'products': {},
      'apostrophe-workflow': {
        alias: 'workflow',
        locales: locales,
        replicateAcrossLocales: false
      }
    },
    afterInit: function(callback) {
      assert(apos.workflow);
      return callback(null);
    },
    afterListen: function(err) {
      assert(!err);
      return callback(null, apos);
    }
  });
}
