const assert = require('assert');
const _ = require('@sailshq/lodash');
const Promise = require('bluebird');

describe('Workflow replication of related docs for new locales: initial locales', function() {

  let apos;

  this.timeout(20000);

  after(function(done) {
    // Do not remove database yet, later blocks explore consequences of a restart
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
    // We copy from es to es-mx only (parent to child)
    const req = apos.tasks.getReq({ locale: 'es-draft' });
    const products = _.range(0, 10).map(function(n) {
      return {
        title: 'product ' + n
      };
    });
    const _ids = [];
    return Promise.mapSeries(products, function(product, i) {
      return apos.products.insert(req, product).then(function(product) {
        _ids.push(product._id);
      });
    }).then(function() {
      return Promise.mapSeries(_ids.slice(0, 4), function(_id, i) {
        return apos.docs.db.update({
          _id: _id
        }, {
          $set: {
            relatedId: _ids[i + 1]
          }
        });
      });
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

describe('Workflow replication of related docs for new locales: expanded locales and check of relationships', function() {

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

  it('home page should be replicated everywhere', function() {
    return apos.docs.db.find({ level: 0, slug: '/' }).toArray().then(function(homes) {
      assert(homes);
      assert(homes.length === 10);
      const homeLocales = _.pluck(homes, 'workflowLocale');
      assert(!Object.keys(apos.workflow.locales).find(function(locale) {
        return (!(homeLocales.indexOf(locale) !== -1));
      }));
    });
  });

  // it('check', function() {
  //   return apos.docs.db.find({ type: 'product' }).toArray().then(function(products) {
  //     console.log(products);
  //   });
  // });

  let firstProduct;

  it('first product should be replicated to new locale due to relationship with homepage', function() {
    return apos.docs.db.find({ title: 'product 0', workflowLocale: { $in: [ 'es-mx', 'es-mx-draft' ] } }).toArray().then(function(products) {
      assert(products);
      assert(products.length === 2);
      firstProduct = _.find(products, { workflowLocale: 'es-mx-draft' });
      assert(firstProduct);
    });
  });

  it('homepage of new locale should correctly reference first product in new locale', function() {
    return Promise.try(function() {
      return apos.docs.db.findOne({ level: 0, slug: '/', workflowLocale: 'es-mx-draft' });
    }).then(function(home) {
      assert(home);
      console.log(home);
      return home;
    }).then(function(home) {
      return apos.docs.db.findOne({ _id: home.relatedId }).then(function(doc) {
        console.log(doc && doc.workflowLocale);
        assert(home.relatedId === firstProduct._id);
      });
    });
  });

  it('fifth product should be replicated to new locale due to recursive relationship with homepage', function() {
    return apos.docs.db.find({ title: 'product 4', workflowLocale: { $in: [ 'es-mx', 'es-mx-draft' ] } }).toArray().then(function(products) {
      assert(products);
      assert(products.length === 2);
    });
  });

  it('products in new locale should correctly reference each other', function() {
    return apos.docs.db.find({ type: /^product/, workflowLocale: 'es-mx-draft'  }).sort({ slug: 1 }).toArray().then(function(products) {
      assert(products);
      assert(products.length === 10);
      for (let i = 0; (i < 10); i++) {
        if (i < 4) {
          assert(products[i].relatedId === products[i + 1]._id);
        } else {
          assert(!products[i].relatedId);
        }
      }
    });
  });

  it('sixth product should NOT be replicated because it lacks a recursive relationship with homepage', function() {
    return apos.docs.db.find({ title: 'product 5', workflowLocale: { $in: [ 'es-mx', 'es-mx-draft' ] } }).toArray().then(function(products) {
      assert(products);
      assert(products.length === 0);
    });
  });

  it('global doc page should be replicated everywhere', function() {
    return apos.docs.db.find({ type: 'apostrophe-global' }).toArray().then(function(globals) {
      assert(globals);
      assert(globals.length === 10);
      const globalLocales = _.pluck(globals, 'workflowLocale')
      assert(!Object.keys(apos.workflow.locales).find(function(locale) {
        return (!(globalLocales.indexOf(locale) !== -1));
      }));
    });
  });

  it('parked test page should be replicated to all locales', function() {
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
