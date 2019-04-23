let assert = require('assert');
let _ = require('@sailshq/lodash');

describe('Workflow dereplicate task', function() {

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
        'apostrophe-workflow': {
          alias: 'workflow',
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
                  name: 'us'
                },
                {
                  name: 'es'
                }
              ]
            }
          ]
          // Do replicate, to create the test case
        }
      },
      afterInit: function(callback) {
        assert(apos.workflow);
        return callback(null);
      },
      afterListen: function(err) {
        assert(!err);
        done();
      }
    });
  });

  it('newly inserted subpage gets replicated initially', function() {
    // Use a child locale so it is trash in all other locales at first
    let req = apos.tasks.getReq({ locale: 'es-draft' });
    return apos.pages.find(req, { slug: '/' }).toObject().then(function(home) {
      assert(home);
      return apos.pages.insert(req, home._id, { title: 'About', slug: '/about', type: 'testPage', published: true });
    }).then(function(subpage) {
      assert(subpage);
      assert(subpage.slug === '/about');
      assert(subpage.workflowGuid);
      return apos.docs.db.find({ workflowGuid: subpage.workflowGuid }).toArray();
    }).then(function(peers) {
      assert(peers.length === 8);
    });
  });

  it('run dereplication task without crashing', function() {
    return apos.tasks.invoke('apostrophe-workflow:dereplicate', [], {});
  });

  it('dump slugs', function() {
    return apos.docs.db.find({}, { slug: 1, workflowLocale: 1, workflowGuid: 1, trash: true }).toArray().then(function(docs) {
    });
  });

  it('newly inserted subpage is no longer replicated to extra locales', function() {
    return apos.docs.db.findOne({ slug: '/about' }).then(function(subpage) {
      assert(subpage);
      assert(subpage.slug === '/about');
      assert(subpage.workflowGuid);
      return apos.docs.db.find({ workflowGuid: subpage.workflowGuid }).toArray();
    }).then(function(peers) {
      assert.equal(peers.length, 2);
      assert(peers.find(function(peer) {
        return peer.workflowLocale === 'es';
      }));
      assert(peers.find(function(peer) {
        return peer.workflowLocale === 'es-draft';
      }));
    });
  });

  it('home page should still be replicated', function() {
    return apos.docs.db.find({ level: 0, slug: '/' }).toArray().then(function(homes) {
      assert(homes);
      assert(homes.length === 8);
      const homeLocales = _.pluck(homes, 'workflowLocale');
      assert(!Object.keys(apos.workflow.locales).find(function(locale) {
        return (!(homeLocales.indexOf(locale) !== -1));
      }));
    });
  });

  it('global doc page should still be replicated', function() {
    return apos.docs.db.find({ type: 'apostrophe-global' }).toArray().then(function(globals) {
      assert(globals);
      assert(globals.length === 8);
      const globalLocales = _.pluck(globals, 'workflowLocale');
      assert(!Object.keys(apos.workflow.locales).find(function(locale) {
        return (!(globalLocales.indexOf(locale) !== -1));
      }));
    });
  });

});
