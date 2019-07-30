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

  it('inserted subpage without relationships is only replicated draft/live', function() {
    let req = apos.tasks.getReq({ locale: 'es-draft' });
    let home, subpage, grandchild;
    return apos.pages.find(req, { slug: '/' }).toObject().then(function(_home) {
      home = _home;
      assert(home);
      return apos.pages.insert(req, home._id, { title: 'Simple Subpage', slug: '/simple-subpage', type: 'testPage', published: true });
    }).then(function(_subpage) {
      subpage = _subpage;
      assert(subpage);
      assert(subpage.slug === '/simple-subpage');
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

  it('newly inserted subtree is initially only replicated draft/live', function() {
    let req = apos.tasks.getReq({ locale: 'es-draft' });
    let home, subpage, grandchild;
    return apos.pages.find(req, { slug: '/' }).toObject().then(function(_home) {
      home = _home;
      assert(home);
      return apos.pages.insert(req, home._id, { title: 'About', slug: '/about', type: 'testPage', published: true });
    }).then(function(_subpage) {
      subpage = _subpage;
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
    }).then(function() {
      return apos.pages.insert(req, subpage._id, { title: 'People', slug: '/about/people', type: 'testPage', published: true });
    }).then(function(_grandchild) {
      grandchild = _grandchild;
      assert(grandchild);
      assert(grandchild.slug === '/about/people');
      assert(grandchild.level === 2);
      assert(grandchild.workflowGuid);
      return apos.docs.db.find({ workflowGuid: grandchild.workflowGuid }).toArray();
    }).then(function(peers) {
      assert(peers.length === 2);
      assert(peers.find(function(peer) {
        return peer.workflowLocale === apos.workflow.liveify(req.locale);
      }));
      assert(peers.find(function(peer) {
        return peer.workflowLocale === apos.workflow.draftify(req.locale);
      }));
    }).then(function() {
      return apos.docs.db.update({
        _id: home._id
      }, {
        $set: {
          // Deliberately swap the order as a stress test of the
          // tree structure's preservation upon replication
          coolPagesIds: [ grandchild._id, subpage._id ]
        }
      });
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

  it('home page should be replicated everywhere, never in trash', function() {
    return apos.docs.db.find({ level: 0, slug: '/', trash: { $ne: true } }).toArray().then(function(homes) {
      assert(homes);
      assert(homes.length === 10);
      const homeLocales = _.pluck(homes, 'workflowLocale');
      assert(!Object.keys(apos.workflow.locales).find(function(locale) {
        return (!(homeLocales.indexOf(locale) !== -1));
      }));
    });
  });

  let firstProduct;

  it('first product should be replicated to new locale due to relationship with homepage, not in trash', function() {
    return apos.docs.db.find({ title: 'product 0', trash: { $ne: true }, workflowLocale: { $in: [ 'es-mx', 'es-mx-draft' ] } }).toArray().then(function(products) {
      assert(products);
      assert(products.length === 2);
      firstProduct = _.find(products, { workflowLocale: 'es-mx-draft' });
      assert(firstProduct);
    });
  });

  it('homepage of new locale should correctly reference first product in new locale, not in trash', function() {
    return Promise.try(function() {
      return apos.docs.db.findOne({ level: 0, trash: { $ne: true }, slug: '/', workflowLocale: 'es-mx-draft' });
    }).then(function(home) {
      return apos.docs.db.findOne({ _id: home.relatedId }).then(function(doc) {
        assert(home.relatedId === firstProduct._id);
      });
    });
  });

  it('fifth product should be replicated to new locale due to recursive relationship with homepage, not in trash', function() {
    return apos.docs.db.find({ title: 'product 4', trash: { $ne: true }, workflowLocale: { $in: [ 'es-mx', 'es-mx-draft' ] } }).toArray().then(function(products) {
      assert(products);
      assert(products.length === 2);
    });
  });

  it('products in new locale should correctly reference each other, not in trash', function() {
    return apos.docs.db.find({ type: /^product/, trash: { $ne: true }, workflowLocale: 'es-mx-draft'  }).sort({ slug: 1 }).toArray().then(function(products) {
      assert(products);
      assert(products.length === 5);
      for (let i = 0; (i < 5); i++) {
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

  it('global doc page should be replicated everywhere, not in trash', function() {
    return apos.docs.db.find({ type: 'apostrophe-global', trash: { $ne: true } }).toArray().then(function(globals) {
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

  it('First normally inserted subpage exists but was not replicated to new locale', function() {
    return apos.docs.db.find({ slug: '/simple-subpage' }).toArray().then(function(docs) {
      // Only default and default-draft
      assert(docs.length === 2);
      assert(docs[0].level === 1);
      assert(docs[1].level === 1);
    });
  });

  it('Normally inserted subtree that is referenced by joins should be replicated to new locale at correct page tree level', function() {
    return apos.docs.db.find({ slug: '/about' }).toArray().then(function(docs) {
      assert(docs.length === 4);
      for (i = 0; (i < docs.length); i++) {
        assert(docs[i].level === 1);
      }
    }).then(function() {
      return apos.docs.db.find({ slug: '/about/people' }).toArray();
    }).then(function(docs) {
      assert(docs.length === 4);
      for (i = 0; (i < docs.length); i++) {
        assert(docs[i].level === 2);
      }
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
