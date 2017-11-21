var assert = require('assert');
var _ = require('lodash');
var async = require('async');
var request = require('request');
var fs = require('fs');

describe('Workflow Core', function() {

  var apos;

  this.timeout(5000);

  after(function() {
    apos.db.dropDatabase();
  });

  //////
  // EXISTENCE
  //////

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
        'apostrophe-workflow': {}
      },
      afterInit: function(callback) {
        assert(apos.modules['apostrophe-workflow']);
        // Should NOT have an alias!
        assert(!apos.workflow);
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
    var cursor = apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }));
    assert(cursor);
  });

  it('should be able to find the parked homepage', function(done){
    var cursor = apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), { slug: '/' });

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
    var cursor = apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), { slug: '/child' });

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
    var cursor = apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), { slug: '/child' });

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
    var cursor = apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), { slug: '/child' });

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
    var cursor = apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), { slug: '/child' });

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
    apos.pages.insert(apos.tasks.getReq({ locale: 'default-draft' }), parentId, newPage, function(err, page) {
      // did it return an error?
      assert(!err);
      //Is the path generally correct?
      assert.equal(page.path, '/parent/new-page');
      done();
    });
  });

  it('is able to insert a new page in the correct order', function(done) {
    var cursor = apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), { slug: '/new-page' });

    cursor.toObject(function(err, page){
      assert.equal(page.rank, 2);
      assert(page.workflowLocale === 'default-draft');
      done();
    });
  });

  it('is able to insert a new page in the correct order in both locales', function(done) {
    var cursor = apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), { slug: '/new-page' }).workflowLocale('default').trash(null);

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
    apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), { path: '/cousin' }).workflowLocale('default').toObject(function(err, page){
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
    apos.pages.move(apos.tasks.getReq({ locale: 'default-draft' }), '4312', '2341', 'before', function(err) {
      if (err) {
        console.log(err);
      }
      assert(!err);
      var cursor = apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), {_id: '4312'});
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
    apos.pages.move(apos.tasks.getReq({ locale: 'default-draft' }), '4312', '4321', 'inside', function(err) {
      if (err) {
        console.log(err);
      }
      assert(!err);
      var cursor = apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), {_id: '4312'});
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
    apos.pages.move(apos.tasks.getReq({ locale: 'default-draft' }), '1234', '4333', 'inside', { debug: true }, function(err) {
      if (err) {
        console.log(err);
      }
      assert(!err);
      var cursor = apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), {_id: '4321'});
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
    var cursor = apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), { path: '/another-parent/parent/sibling' }).workflowLocale('default');
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

  it('is able to "move" parent to the trash', function(done) {
    apos.pages.moveToTrash(apos.tasks.getReq({ locale: 'default-draft' }), '1234', function(err) {
      if (err) {
        console.log(err);
      }
      assert(!err);
      var cursor = apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), {_id: '1234'});
      cursor.toObject(function(err, page){
        if (err) {
          console.log(err);
        }
        assert(!err);
        assert(!page);
        var cursor2 = apos.pages.find(apos.tasks.getReq({ locale: 'default-draft' }), { _id: '1234' }).
          permission(false).trash(null).toObject(function(err, page) {
            assert(page.path, '/another-parent/parent');
            assert(page.trash);
            assert.equal(page.level, 2);
            return done();
          }
        );
      });
    });
  });
});

describe('Workflow Subdomains and Prefixes', function() {

  var apos;

  this.timeout(5000);

  after(function() {
    apos.db.dropDatabase();
  });

  //////
  // EXISTENCE
  //////

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
        'apostrophe-workflow': {
          hostnames: {
            'fr': 'exemple.fr',
            'default': 'example.com',
            'us': 'example.com',
            'us-en': 'example.com',
            'us-es': 'example.com'
          },
          prefixes: {
            // Even private locales must be distinguishable by hostname and/or prefix
            'default': '/default',
            'us': '/us',

            'us-en': '/en',
            'us-es': '/es',
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
      after(req);
    });
  }
  
  it('can find a hostname-determined locale via middleware', function(done) {
    tryMiddleware('http://exemple.fr', function(req) {
      assert(req.locale === 'fr');
      done();
    });
  });

  it('can find a jointly-determined locale via middleware', function(done) {
    tryMiddleware('http://example.com/es', function(req) {
      assert(req.locale === 'us-es');
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
            _id: '1',
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
          },
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
            _id: '1',
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
          },
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
            _id: '1',
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
                _id: '1a',
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
          },
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
          },
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
      'us-es-draft'
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
    assert(criteria.$and[1]._iNeverMatch === true);
  });
  
  it('setPropertiesAcrossLocales works', function(done) {
    var results;
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
      return apos.docs.db.find({ workflowGuid: home.workflowGuid }).toArray(function(err, docs) {
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
      return apos.docs.db.find({ workflowGuid: { $ne: home.workflowGuid, $exists: 1 } }).toArray(function(err, docs) {
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

});
