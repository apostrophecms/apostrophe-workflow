var assert = require('assert');
var _ = require('@sailshq/lodash');
var Promise = require('bluebird');

describe('Workflow Core', function() {

  let apos;
  let page1;
  let page2;

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
        'apostrophe-workflow': {}
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


  // it('dump pages', function() {
  //   return apos.docs.db.find({ slug: /^\// }).toArray().then(function(pages) {
  //     console.log(pages);
  //   });
  // });

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

  function page1AndPage2ArePeers(locale) {
    return Promise.try(function() {
      return apos.docs.db.find({ workflowLocale: locale }).toArray();
    }).then(function(docs) {
      return apos.pages.find(apos.tasks.getReq({ locale: locale }), { slug: '/' }).children({ depth: 2, trash: null }).toObject();
    }).then(function(home) {
      assert(home);
      page1 = home._children[0];
      page2 = home._children[1];
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

});
