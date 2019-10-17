var assert = require('assert');
var Promise = require('bluebird');

describe('Workflow Reorganize with replicate:false', function() {

  let apos;

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
        products: {},
        'apostrophe-workflow': {
          locales: [
            {
              name: 'default',
              children: [
                {
                  name: 'en'
                },
                {
                  name: 'fr'
                },
                {
                  name: 'es'
                }
              ]
            }
          ],
          replicateAcrossLocales: false
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

  it('insert page1 and page2 as peers initially', function() {
    const req = apos.tasks.getReq({ locale: 'default-draft' });
    return Promise.try(function() {
      return apos.pages.find(req, { slug: '/' }).children({ depth: 2 }).toObject();
    }).then(function(home) {
      return apos.pages.insert(req, home, {
        title: 'page1',
        slug: '/page1',
        type: 'testPage',
        published: true,
        trash: false
      }).then(function() {
        return home;
      });
    }).then(function(home) {
      return apos.pages.insert(req, home, {
        title: 'page2',
        slug: '/page2',
        type: 'testPage',
        published: true,
        trash: false
      });
    });
  });

  it('page1 and page2 are peers in default-draft locale', function() {
    return page1AndPage2ArePeers('default-draft');
  });

  it('page1 and page2 are peers in default locale', function() {
    return page1AndPage2ArePeers('default');
  });

  it('should be able to move page2 under page1 in default-draft', function() {
    const req = apos.tasks.getReq({ locale: 'default-draft' });
    return Promise.try(function() {
      return apos.pages.find(req, { slug: '/' }).children({ depth: 2 }).toObject();
    }).then(function(home) {
      const page1 = home._children[0];
      const page2 = home._children[1];
      // req, moved, target, relationship
      return apos.pages.move(req, page2._id, page1._id, 'inside');
    }).then(function() {
      return page2IsNestedUnderPage1('default-draft');
    });
  });

  it('meanwhile in live locale, page2 should still be a peer', function() {
    return page1AndPage2ArePeers('default');
  });

  it('should be able to commit page1', function() {
    const req = apos.tasks.getReq({ locale: 'default-draft' });
    const workflow = apos.modules['apostrophe-workflow'];
    return Promise.try(function() {
      return apos.pages.find(req, { slug: '/' }).children({ depth: 2 }).toObject();
    }).then(function(home) {
      const page1 = home._children[0];
      return Promise.promisify(workflow.commitLatest)(req, page1._id);
    });
  });

  it('should be able to commit page2', function() {
    const req = apos.tasks.getReq({ locale: 'default-draft' });
    const workflow = apos.modules['apostrophe-workflow'];
    return Promise.try(function() {
      return apos.pages.find(req, { slug: '/' }).children({ depth: 2 }).toObject();
    }).then(function(home) {
      const page2 = home._children[0]._children[0];
      return Promise.promisify(workflow.commitLatest)(req, page2._id);
    });
  });

  it('now in live locale page2 should be nested under page1', function() {
    return page2IsNestedUnderPage1('default');
  });

  it('meanwhile in fr-draft page2 does not exist yet', function() {
    return page2DoesNotExist('fr-draft');
  });

  it('export both commits to fr-draft locale', function() {
    const workflow = apos.modules['apostrophe-workflow'];
    const exporter = Promise.promisify(workflow.export);
    let commits;
    const req = apos.tasks.getReq({ locale: 'default-draft' });
    return Promise.try(function() {
      return workflow.db.find().sort({ createdAt: 1 }).toArray();
    }).then(function(_commits) {
      commits = _commits;
      return exporter(req, commits[0]._id, [ 'fr' ]);
    }).then(function() {
      return exporter(req, commits[1]._id, [ 'fr' ]);
    });
  });

  it('after exports page2 is a child of page1 in fr-draft', function() {
    return page2IsNestedUnderPage1('fr-draft');
  });

  it('... and in fr (live)', function() {
    return page2IsNestedUnderPage1('fr');
  });

  it('... and still nonexistent in the unrelated en-draft', function() {
    return page2DoesNotExist('en-draft');
  });

  it('can force export page1 and page2 to en-draft', function() {
    const req = apos.tasks.getReq({ locale: 'default-draft' });
    const workflow = apos.modules['apostrophe-workflow'];
    const forceExport = Promise.promisify(workflow.forceExport);
    let home;
    return Promise.try(function() {
      return apos.pages.find(req, { slug: '/' }).children({ depth: 2 }).toObject();
    }).then(function(_home) {
      home = _home;
      return forceExport(req, home._children[0]._id, [ 'en' ]);
    }).then(function() {
      return forceExport(req, home._children[0]._children[0]._id, [ 'en' ]);
    });
  });

  it('after force exports page2 is a child of page1 in en-draft', function() {
    return page2IsNestedUnderPage1('en-draft');
  });

  it('... and still nonexistent in the unrelated es-draft', function() {
    return page2DoesNotExist('es-draft');
  });

  it('can force export page2 and page1 to es-draft, in that order (reversed)', function() {
    const req = apos.tasks.getReq({ locale: 'default-draft' });
    const workflow = apos.modules['apostrophe-workflow'];
    const forceExport = Promise.promisify(workflow.forceExport);
    let home;
    return Promise.try(function() {
      return apos.pages.find(req, { slug: '/' }).children({ depth: 2 }).toObject();
    }).then(function(_home) {
      home = _home;
      return forceExport(req, home._children[0]._children[0]._id, [ 'es' ]);
    }).then(function() {
      return forceExport(req, home._children[0]._id, [ 'es' ]);
    });
  });

  it('after force exports page1 and page2 are peers, in reverse order, in es-draft because the parent was not available when the child first arrived', function() {
    return page1AndPage2ArePeersReversed('es-draft');
  });

  function page1AndPage2ArePeers(locale) {
    return Promise.try(function() {
      return apos.docs.db.find({ workflowLocale: locale }).toArray();
    }).then(function(docs) {
      return apos.pages.find(apos.tasks.getReq({ locale: locale }), { slug: '/' }).children({ depth: 2, trash: null }).toObject();
    }).then(function(home) {
      assert(home);
      const page1 = home._children[0];
      const page2 = home._children[1];
      assert(page1.title === 'page1');
      assert(page1.path === '/page1');
      assert(page1.level === 1);
      assert(page2.title === 'page2');
      assert(page2.path === '/page2');
      assert(page2.level === 1);
    });
  }

  function page1AndPage2ArePeersReversed(locale) {
    return Promise.try(function() {
      return apos.docs.db.find({ workflowLocale: locale }).toArray();
    }).then(function(docs) {
      return apos.pages.find(apos.tasks.getReq({ locale: locale }), { slug: '/' }).children({ depth: 2, trash: null }).toObject();
    }).then(function(home) {
      assert(home);
      const page2 = home._children[0];
      const page1 = home._children[1];
      assert(page1.title === 'page1');
      assert(page1.path === '/page1');
      assert(page1.level === 1);
      assert(page2.title === 'page2');
      assert(page2.path === '/page2');
      assert(page2.level === 1);
    });
  }

  function page2IsNestedUnderPage1(locale) {
    return Promise.try(function() {
      return apos.pages.find(apos.tasks.getReq({ locale: locale }), { slug: '/' }).children({ depth: 2, trash: null }).toObject();
    }).then(function(home) {
      const page1 = home._children[0];
      assert(page1.title === 'page1');
      assert(page1.path === '/page1');
      assert(page1.level === 1);
      const page2 = page1._children[0];
      assert(page2.title === 'page2');
      assert(page2.path === '/page1/page2');
      assert(page2.level === 2);
    });
  }

  function page2DoesNotExist(locale) {
    return Promise.try(function() {
      return apos.pages.find(apos.tasks.getReq({ locale: locale }), { title: 'page2' }).toObject();
    }).then(function(page) {
      if (page) {
        throw new Error('should not exist in the ' + locale + ' locale');
      }
    });
  }
});
