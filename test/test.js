var assert = require('assert');
var _ = require('lodash');
var async = require('async');
var request = require('request');
var fs = require('fs');

var t;
var apos;

// Set up a node_modules folder that can see the apostrophe module and this module,
// so Aposrophe can bootstrap normally from test/

if (!fs.existsSync(__dirname +'/node_modules')) {
  fs.mkdirSync(__dirname + '/node_modules');
  fs.symlinkSync(__dirname + '/..', __dirname +'/node_modules/apostrophe-workflow', 'dir');
  fs.symlinkSync(__dirname + '/../node_modules/apostrophe', __dirname +'/node_modules/apostrophe', 'dir');
}

function anonReq(apos) {
  return {
    res: {
      __: function(x) { return x; }
    },
    browserCall: apos.app.request.browserCall,
    getBrowserCalls: apos.app.request.getBrowserCalls,
    query: {},
    url: '/',
    locale: 'default-draft'
  };
}

function adminReq(apos) {
  return _.merge(anonReq(apos), {
    user: {
      _id: 'testuser',
      _permissions: {
        admin: true
      }
    },
    locale: 'default-draft'
  });
}

t = {
  req: { anon: anonReq, admin: adminReq }
};

describe('Workflow', function() {

  this.timeout(5000);

  after(function() {
    apos.db.dropDatabase();
  });

  //////
  // EXISTENCE
  //////

  it('should be a property of the apos object', function(done) {
    apos = require('apostrophe')({
      root: module,
      shortName: 'test',
      
      modules: {
        'apostrophe-express': {
          secret: 'xxx',
          port: 7900
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
        'apostrophe-workflow': {}
      },
      afterInit: function(callback) {
        assert(apos.modules['apostrophe-workflow']);
        // Should NOT have an alias!
        assert(!apos.workflow);
        apos.argv._ = [];
        return callback(null);
      },
      afterListen: function(err) {
        done();
      }
    });
  });


  //////
  // SETUP
  //////

  it('should make sure all of the expected indexes are configured', function(done){

    apos.docs.db.indexInformation(function(err, info) {
      assert(!err);
      var needed = [
        [ 'slug', 'workflowLocale' ],
        [ 'path', 'workflowLocaleForPathIndex' ],
        [ 'workflowGuid' ]
      ];
      var met = {};
      _.each(info, function(val, key) {
        var props = _.map(val, function(param) {
          return param[0];
        });
        _.each(needed, function(_props, i) {
          var missing = _.find(_props, function(prop) {
            return !_.contains(props, prop);
          });
          // None missing, no extras
          if ((!missing) && (_props.length === props.length)) {
            met[i] = true;
          }
        });
      });
      assert.equal(_.keys(met).length, needed.length);
      done();
    });
  });

  it('parked homepage exists in default-draft locale', function(done) {
    return apos.pages.find(t.req.anon(apos), { slug: '/' }).toObject(function(err, home) {
      assert(!err);
      assert(home);
      assert(home.slug === '/');
      assert(home.path === '/');
      assert(home.type === 'home');
      assert(home.parked);
      assert(home.published);
      assert(home.workflowLocale === 'default-draft');
      done();
    });
  });

  it('parked homepage exists in default locale', function(done) {
    return apos.pages.find(t.req.anon(apos), { slug: '/' }).workflowLocale('default').toObject(function(err, home) {
      assert(!err);
      assert(home);
      assert(home.slug === '/');
      assert(home.path === '/');
      assert(home.type === 'home');
      assert(home.parked);
      assert(home.published);
      assert(home.workflowLocale === 'default');
      done();
    });
  });

  it('parked trash can exists', function(done) {
    return apos.pages.find(t.req.admin(apos), { slug: '/trash' }).published(null).trash(null).toObject(function(err, trash) {
      assert(!err);
      assert(trash);
      assert(trash.slug === '/trash');
      assert(trash.path === '/trash');
      assert(trash.type === 'trash');
      assert(trash.parked);
      assert(!trash.published);
      // Verify that clonePermanent did its
      // job and removed properties not meant
      // to be stored in mongodb
      assert(!trash._children);
      done();
    });
  });

  it('should be able to use db to insert documents', function(done){
    var testItems = [
      { _id: '1234',
        type: 'testPage',
        slug: '/parent',
        published: true,
        path: '/parent',
        level: 1,
        rank: 0
      },
      {
        _id: '2341',
        type: 'testPage',
        slug: '/child',
        published: true,
        path: '/parent/child',
        level: 2,
        rank: 0
      },
      {
        _id: '4123',
        type: 'testPage',
        slug: '/grandchild',
        published: true,
        path: '/parent/child/grandchild',
        level: 3,
        rank: 0
      },
      {
        _id: '4321',
        type: 'testPage',
        slug: '/sibling',
        published: true,
        path: '/parent/sibling',
        level: 2,
        rank: 1

      },
      {
        _id: '4312',
        type: 'testPage',
        slug: '/cousin',
        published: true,
        path: '/parent/sibling/cousin',
        level: 3,
        rank: 0
      },
      {
        _id: '4333',
        type: 'testPage',
        slug: '/another-parent',
        published: true,
        path: '/another-parent',
        level: 1,
        rank: 0
      }
    ];
    
    testItems = localize(testItems);

    apos.docs.db.insert(testItems, function(err){
      if (err) {
        console.error(err);
      }
      assert(!err);
      done();
    });
    
    function localize(testItems) {
      return _.flatten(_.map(testItems, function(item) {
        return [
          _.assign(_.clone(item), { workflowLocale: 'default', workflowLocaleForPathIndex: 'default', workflowGuid: 'wg' + item._id, _id: item._id + 'live' }),
          _.assign(_.clone(item), { workflowLocale: 'default-draft', workflowLocaleForPathIndex: 'default-draft', workflowGuid: 'wg' + item._id }),
        ]
      }));
    }

  });


  //////
  // FINDING
  //////

  it('should have a find method on pages that returns a cursor', function(){
    var cursor = apos.pages.find(t.req.anon(apos));
    assert(cursor);
  });

  it('should be able to find the parked homepage', function(done){
    var cursor = apos.pages.find(t.req.anon(apos), { slug: '/' });

    cursor.toObject(function(err, page){
      assert(!err);
      // There should be only 1 result.
      assert(page);
      // It should have a path of /
      assert(page.path === '/');
      assert(page.rank === 0);
      done();
    });
  });


  it('should be able to find just a single page', function(done){
    var cursor = apos.pages.find(t.req.anon(apos), { slug: '/child' });

    cursor.toObject(function(err, page){
      assert(!err);
      // There should be only 1 result.
      assert(page);
      // It should have a path of /parent/child
      assert(page.path === '/parent/child');
      done();
    });
  });

  it('should be able to include the ancestors of a page', function(done){
    var cursor = apos.pages.find(t.req.anon(apos), { slug: '/child' });

    cursor.ancestors(true).toObject(function(err, page){
      assert(!err);
      // There should be only 1 result.
      assert(page);
      // There should be 2 ancestors.
      assert(page._ancestors.length === 2);
      // The first ancestor should be the homepage
      assert.equal(page._ancestors[0].path, '/');
      // The second ancestor should be 'parent'
      assert.equal(page._ancestors[1].path, '/parent');
      done();
    });
  });

  it('should be able to include just one ancestor of a page, i.e. the parent', function(done) {
    var cursor = apos.pages.find(t.req.anon(apos), { slug: '/child' });

    cursor.ancestors({ depth: 1 }).toObject(function(err, page){
      assert(!err);
      // There should be only 1 result.
      assert(page);
      // There should be 1 ancestor returned.
      assert(page._ancestors.length === 1);
      // The first ancestor returned should be 'parent'
      assert.equal(page._ancestors[0].path, '/parent');
      done();
    });
  });

  it('should be able to include the children of the ancestors of a page', function(done){
    var cursor = apos.pages.find(t.req.anon(apos), { slug: '/child' });

    cursor.ancestors({children: 1}).toObject(function(err, page){
      assert(!err);
      // There should be only 1 result.
      assert(page);
      // There should be 2 ancestors.
      assert(page._ancestors.length === 2);
      // The second ancestor should have children
      assert(page._ancestors[1]._children);
      // The first ancestor's child should have a path '/parent/child'
      assert.equal(page._ancestors[1]._children[0].path, '/parent/child');
      // The second ancestor's child should have a path '/parent/sibling'
      assert.equal(page._ancestors[1]._children[1].path, '/parent/sibling');
      done();
    });
  });


  //////
  // INSERTING
  //////
  it('is able to insert a new page', function(done) {
    var parentId = '1234';

    var newPage = {
      slug: '/new-page',
      published: true,
      type: 'testPage',
      title: 'New Page'
    };
    apos.pages.insert(t.req.admin(apos), parentId, newPage, function(err, page) {
      // did it return an error?
      assert(!err);
      //Is the path generally correct?
      assert.equal(page.path, '/parent/new-page');
      done();
    });
  });

  it('is able to insert a new page in the correct order', function(done) {
    var cursor = apos.pages.find(t.req.anon(apos), { slug: '/new-page' });

    cursor.toObject(function(err, page){
      assert.equal(page.rank, 2);
      assert(page.workflowLocale === 'default-draft');
      done();
    });
  });

  it('is able to insert a new page in the correct order in both locales', function(done) {
    var cursor = apos.pages.find(t.req.anon(apos), { slug: '/new-page' }).workflowLocale('default');

    cursor.toObject(function(err, page){
      assert.equal(page.rank, 2);
      assert(page.workflowLocale === 'default');
      done();
    });
  });

  //////
  // MOVING
  //////

  it('is able to move root/parent/sibling/cousin after root/parent', function(done) {
    // 'Cousin' _id === 4312
    // 'Parent' _id === 1234
    apos.pages.move(t.req.admin(apos), '4312', '1234', 'after', function(err) {
      if (err) {
        console.log(err);
      }
      assert(!err);
      var cursor = apos.pages.find(t.req.anon(apos), {_id: '4312'});
      cursor.toObject(function(err, page){
        if (err) {
          console.log(err);
        }
        assert(!err);
        //Is the new path correct?
        assert.equal(page.path, '/cousin');
        //Is the rank correct?
        assert.equal(page.rank, 1);
        return done();
      });
    });

  });

  it('newly moved page is also in the right place in the other locale', function(done) {
    // 'Cousin' _id === 4312
    // 'Parent' _id === 1234
    apos.pages.find(t.req.admin(apos), { path: '/cousin' }).workflowLocale('default').toObject(function(err, page){
      if (err) {
        console.log(err);
      }
      assert(!err);
      //Is the new path correct?
      assert.equal(page.path, '/cousin');
      //Is the rank correct?
      assert.equal(page.rank, 1);
      // Is the locale filter working?
      assert.equal(page.workflowLocale, 'default');
      return done();
    });
  });

  it('is able to move root/cousin before root/parent/child', function(done) {
    // 'Cousin' _id === 4312
    // 'Child' _id === 2341
    apos.pages.move(t.req.admin(apos), '4312', '2341', 'before', function(err) {
      if (err) {
        console.log(err);
      }
      assert(!err);
      var cursor = apos.pages.find(t.req.anon(apos), {_id: '4312'});
      cursor.toObject(function(err, page){
        if (err) {
          console.log(err);
        }
        assert(!err);
        //Is the new path correct?
        assert.equal(page.path, '/parent/cousin');
        //Is the rank correct?
        assert.equal(page.rank, 0);
        return done();
      });
    });
  });


  it('is able to move root/parent/cousin inside root/parent/sibling', function(done) {
    // 'Cousin' _id === 4312
    // 'Sibling' _id === 4321
    apos.pages.move(t.req.admin(apos), '4312', '4321', 'inside', function(err) {
      if (err) {
        console.log(err);
      }
      assert(!err);
      var cursor = apos.pages.find(t.req.anon(apos), {_id: '4312'});
      cursor.toObject(function(err, page){
        if (err) {
          console.log(err);
        }
        assert(!err);
        //Is the new path correct?
        assert.equal(page.path, '/parent/sibling/cousin');
        //Is the rank correct?
        assert.equal(page.rank, 0);
        return done();
      });
    });

  });

  it('moving /parent into /another-parent should also move /parent/sibling', function(done) {
    apos.pages.move(t.req.admin(apos), '1234', '4333', 'inside', { debug: true }, function(err) {
      if (err) {
        console.log(err);
      }
      assert(!err);
      var cursor = apos.pages.find(t.req.anon(apos), {_id: '4321'});
      cursor.toObject(function(err, page){
        if (err) {
          console.log(err);
        }
        assert(!err);
        //Is the grandchild's path correct?
        assert.equal(page.path, '/another-parent/parent/sibling');
        return done();
      });
    });

  });

  it('moving /parent into /another-parent should also move /parent/sibling in the other locale', function(done) {
    var cursor = apos.pages.find(t.req.anon(apos), { path: '/another-parent/parent/sibling' }).workflowLocale('default');
    cursor.toObject(function(err, page){
      if (err) {
        console.log(err);
      }
      assert(!err);
      //Is the grandchild's path correct?
      assert.equal(page.path, '/another-parent/parent/sibling');
      assert.equal(page.workflowLocale, 'default');
      return done();
    });
  });

  it('should detect that the home page is an ancestor of any page except itself', function() {
    assert(
      apos.pages.isAncestorOf({
          path: '/'
        }, {
          path: '/about'
        }
      )
    );
    assert(
      apos.pages.isAncestorOf({
          path: '/'
        }, {
          path: '/about/grandkid'
        }
      )
    );
    assert(!
      apos.pages.isAncestorOf({
          path: '/'
        }, {
          path: '/'
        }
      )
    );

  });

  it('should detect a tab as the ancestor of its great grandchild but not someone else\'s', function() {
    assert(
      apos.pages.isAncestorOf({
          path: '/about'
        }, {
          path: '/about/test/thing'
        }
      )
    );

    assert(
      !apos.pages.isAncestorOf({
          path: '/about'
        }, {
          path: '/wiggy/test/thing'
        }
      )
    );

  });

  it('is able to move parent to the trash', function(done) {
    apos.pages.moveToTrash(t.req.admin(apos), '1234', function(err) {
      if (err) {
        console.log(err);
      }
      assert(!err);
      var cursor = apos.pages.find(t.req.anon(apos), {_id: '1234'});
      cursor.toObject(function(err, page){
        if (err) {
          console.log(err);
        }
        assert(!err);
        assert(!page);
        var cursor2 = apos.pages.find(t.req.anon(apos), { _id: '1234' }).
          permission(false).trash(null).toObject(function(err, page) {
            assert.equal(page.path, '/trash/parent');
            assert(page.trash);
            assert.equal(page.level, 2);
            return done();
          }
        );
      });
    });
  });
});
