var assert = require('assert');
var async = require('async');
debugger;

describe('Workflow Core', function() {
  this.timeout(5000);
  var apos;
  
  after(function() {
    /* apos.db.dropDatabase(); */
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
    var product = apos.products.newInstance();
    product.title = 'initial title';
    return apos.products.insert(req, product)
      .then(doc => {
        assert(doc.type === 'product');
        assert(doc.workflowGuid);
        assert(doc.workflowLocale === 'default-draft');
      });
  });
  
  it('Commmit a change', (done) => {
    var req = apos.tasks.getReq({locale: 'default-draft'});

    async.waterfall([getProductDraft, updateProductDraft, commitUpdate], (err, res) => {
      assert(!err);
      assert(typeof res === 'string', 'response should be an id');
      done();
    })
    
    function getProductDraft(cb) {
      apos.products.find(req).toArray().then( docs => {
        assert(docs[0]);
        return cb(null, docs[0]);
      })
      .catch(e => {
        return cb(e)
      });
    }

    function updateProductDraft(product, cb) {
      product.title = 'new title';
      apos.products.update(req, product, (err, res) => {
        return cb(err, res);
      });
    }

    function commitUpdate(product, cb) {
      apos.workflow.commitLatest(req, product._id, (err, res) => {
        return cb(err, res);
      });
    }
  });

  it('Check for live document after commit', done => {
    const req = apos.tasks.getReq({locale: 'default'});
    apos.products.find(req).trash(null).toArray().then(docs => {
      assert(docs[0].title === 'new title');
      assert(!docs[0].trash);
      done();
    });
  });
});
