var assert = require('assert');
debugger;

describe('Workflow Core', function() {
  this.timeout(5000);
  
  after(function() {
    apos.db.dropDatabase();
  });

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
          settings: {
            locales: ['default'],
            defaultLocale: 'default',
          },
          alias: 'workflow' // for testing only!
        },
        'products': {
          extend: 'apostrophe-pieces',
          name: 'product',
          alias: 'products'
        }
      },
      afterInit: function(callback) {
        assert(apos.modules['apostrophe-workflow']);
        return callback(null);
      },
      afterListen: function(err) {
        if (err) {
          console.log("Existrs", err);
        }

        assert(!err);
        done();
      }
    });
  });

  it('Test add draft product to db as draft', () => {
    const req = apos.tasks.getReq();
    return apos.products.insert(req, {
      title: 'initial title',
      published: true
    })
      .then(doc => {
        console.log("DOC", doc)
        assert(doc.type === 'product');
        assert(doc.workflowGuid);
        assert(doc.workflowLocale === 'default-draft');
      });
  });
  
  it('Export our product to default (live)', () => {
    console.log('test commit')
    var req = apos.tasks.getReq({locale: 'default-draft'});
    // load it from db again 
    apos.products.find(req).toArray().then( docs => {
      assert(docs[0]);
      apos.workflow.commitLatest(req, docs[0]._id, (err, res) => {
          console.log("EXPORT", res);
          if (err) {
            console.log(err);
          }
          assert(!err);
          assert(commitId);
          assert(draftTitle === 'initial title');
          console.log('first');
          done();
      });
    });
  });

  it('Check for live document after commit', done => {
    console.log('second');
    const req = apos.tasks.getReq({locale: 'default'});
    apos.products.find(req).toArray().then( docs => {
       console.log("FOUND", docs);
       done();
    });
  });
});

