var assert = require('assert');
var _ = require('@sailshq/lodash');
var Promise = require('bluebird');

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
        'products': {},
        'apostrophe-workflow': {}
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

  /// ///
  // SETUP
  /// ///

  it('should make sure all of the expected indexes are configured', function(done) {

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
    // TODO: passing default-draft as the locale property of req isn't
    // really how the frontend does it
    return apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), { slug: '/' }).toObject(function(err, home) {
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
    return apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), { slug: '/' }).workflowLocale('default').toObject(function(err, home) {
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

  it('should be able to use db to insert documents', function(done) {
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

    apos.docs.db.insert(testItems, function(err) {
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
          _.assign(_.clone(item), { workflowLocale: 'default-draft', workflowLocaleForPathIndex: 'default-draft', workflowGuid: 'wg' + item._id })
        ];
      }));
    }

  });

  /// ///
  // FINDING
  /// ///

  it('should have a find method on pages that returns a cursor', function() {
    var cursor = apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }));
    assert(cursor);
  });

  it('should be able to find the parked homepage', function(done) {
    var cursor = apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), { slug: '/' });

    cursor.toObject(function(err, page) {
      assert(!err);
      // There should be only 1 result.
      assert(page);
      // It should have a path of /
      assert(page.path === '/');
      assert(page.rank === 0);
      done();
    });
  });

  it('should be able to find just a single page', function(done) {
    var cursor = apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), { slug: '/child' });

    cursor.toObject(function(err, page) {
      assert(!err);
      // There should be only 1 result.
      assert(page);
      // It should have a path of /parent/child
      assert(page.path === '/parent/child');
      done();
    });
  });

  it('should be able to include the ancestors of a page', function(done) {
    var cursor = apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), { slug: '/child' });

    cursor.ancestors(true).toObject(function(err, page) {
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
    var cursor = apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), { slug: '/child' });

    cursor.ancestors({ depth: 1 }).toObject(function(err, page) {
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

  it('should be able to include the children of the ancestors of a page', function(done) {
    var cursor = apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), { slug: '/child' });

    cursor.ancestors({children: 1}).toObject(function(err, page) {
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

  /// ///
  // INSERTING
  /// ///
  it('is able to insert a new page', function(done) {
    var parentId = '1234';

    var newPage = {
      slug: '/new-page',
      published: true,
      type: 'testPage',
      title: 'New Page'
    };
    apos.pages.insert(apos.tasks.getReq({ locale: 'default-draft' }), parentId, newPage, function(err, page) {
      // did it return an error?
      assert(!err);
      // Is the path generally correct?
      assert.equal(page.path, '/parent/new-page');
      done();
    });
  });

  it('is able to insert a new page in the correct order', function(done) {
    var cursor = apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), { slug: '/new-page' });

    cursor.toObject(function(err, page) {
      assert(!err);
      assert.equal(page.rank, 2);
      assert(page.workflowLocale === 'default-draft');
      done();
    });
  });

  it('is able to insert a new page in the correct order in both locales', function(done) {
    var cursor = apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), { slug: '/new-page' }).workflowLocale('default').trash(null);

    cursor.toObject(function(err, page) {
      assert(!err);
      assert.equal(page.rank, 2);
      assert(page.workflowLocale === 'default');
      done();
    });
  });

  /// ///
  // MOVING
  /// ///

  it('is able to move root/parent/sibling/cousin after root/parent', function(done) {
    // 'Cousin' _id === 4312
    // 'Parent' _id === 1234
    apos.pages.move(apos.tasks.getReq({ locale: 'default-draft' }), '4312', '1234', 'after', function(err) {
      if (err) {
        console.log(err);
      }
      assert(!err);
      var cursor = apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), {_id: '4312'});
      cursor.toObject(function(err, page) {
        if (err) {
          console.log(err);
        }
        assert(!err);
        // Is the new path correct?
        assert.equal(page.path, '/cousin');
        // Is the rank correct?
        assert.equal(page.rank, 1);
        return done();
      });
    });

  });

  it('newly moved page is also in the right place in the other locale', function(done) {
    // 'Cousin' _id === 4312
    // 'Parent' _id === 1234
    apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), { path: '/cousin' }).workflowLocale('default').toObject(function(err, page) {
      if (err) {
        console.log(err);
      }
      assert(!err);
      // Is the new path correct?
      assert.equal(page.path, '/cousin');
      // Is the rank correct?
      assert.equal(page.rank, 1);
      // Is the locale filter working?
      assert.equal(page.workflowLocale, 'default');
      return done();
    });
  });

  it('is able to move root/cousin before root/parent/child', function(done) {
    // 'Cousin' _id === 4312
    // 'Child' _id === 2341
    apos.pages.move(apos.tasks.getReq({ locale: 'default-draft' }), '4312', '2341', 'before', function(err) {
      if (err) {
        console.log(err);
      }
      assert(!err);
      var cursor = apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), {_id: '4312'});
      cursor.toObject(function(err, page) {
        if (err) {
          console.log(err);
        }
        assert(!err);
        // Is the new path correct?
        assert.equal(page.path, '/parent/cousin');
        // Is the rank correct?
        assert.equal(page.rank, 0);
        return done();
      });
    });
  });

  it('is able to move root/parent/cousin inside root/parent/sibling', function(done) {
    // 'Cousin' _id === 4312
    // 'Sibling' _id === 4321
    apos.pages.move(apos.tasks.getReq({ locale: 'default-draft' }), '4312', '4321', 'inside', function(err) {
      if (err) {
        console.log(err);
      }
      assert(!err);
      var cursor = apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), {_id: '4312'});
      cursor.toObject(function(err, page) {
        if (err) {
          console.log(err);
        }
        assert(!err);
        // Is the new path correct?
        assert.equal(page.path, '/parent/sibling/cousin');
        // Is the rank correct?
        assert.equal(page.rank, 0);
        return done();
      });
    });

  });

  it('moving /parent into /another-parent should also move /parent/sibling', function(done) {
    apos.pages.move(apos.tasks.getReq({ locale: 'default-draft' }), '1234', '4333', 'inside', { debug: true }, function(err) {
      if (err) {
        console.log(err);
      }
      assert(!err);
      var cursor = apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), {_id: '4321'});
      cursor.toObject(function(err, page) {
        if (err) {
          console.log(err);
        }
        assert(!err);
        // Is the grandchild's path correct?
        assert.equal(page.path, '/another-parent/parent/sibling');
        return done();
      });
    });

  });

  it('moving /parent into /another-parent should also move /parent/sibling in the other locale', function(done) {
    var cursor = apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), { path: '/another-parent/parent/sibling' }).workflowLocale('default');
    cursor.toObject(function(err, page) {
      if (err) {
        console.log(err);
      }
      assert(!err);
      // Is the grandchild's path correct?
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
    assert(!apos.pages.isAncestorOf({
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

  it('is able to "move" parent to the trash', function(done) {
    apos.pages.moveToTrash(apos.tasks.getReq({ locale: 'default-draft' }), '1234', function(err) {
      if (err) {
        console.log(err);
      }
      assert(!err);
      var cursor = apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), {_id: '1234'});
      cursor.toObject(function(err, page) {
        if (err) {
          console.log(err);
        }
        assert(!err);
        assert(!page);
        apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), { _id: '1234' })
          .permission(false).trash(null).toObject(function(err, page) {
            assert(!err);
            assert(page.path, '/another-parent/parent');
            assert(page.trash);
            assert.equal(page.level, 2);
            return done();
          });
      });
    });
  });

  it('inserting a piece fires afterInsert handler for each locale version', function() {
    var req = apos.tasks.getReq();
    var manager = apos.docs.getManager('product');
    var product = manager.newInstance();
    product.title = 'Test Product';
    return Promise.try(function() {
      return manager.insert(req, product, {});
    }).then(function() {
      return apos.docs.db.find({ title: 'Test Product' }).toArray();
    }).then(function(replicas) {
      assert(replicas.length === 2);
      assert(replicas[0].afterInsertRan);
      assert(replicas[1].afterInsertRan);
      assert(replicas[0].workflowGuid === replicas[1].workflowGuid);
      assert(replicas[0].workflowLocale !== replicas[1].workflowLocale);
    });
  });

});
