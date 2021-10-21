var assert = require('assert');
var async = require('async');
var revertId;
var _ = require('@sailshq/lodash');

describe('Workflow API', function() {
  this.timeout(20000);
  var apos;

  after(function(done) {
    require('apostrophe/test-lib/util').destroy(apos, done);
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
        assert(!err);
        done();
      }
    });
  });

  it('Test add draft product to db as draft', () => {
    var req = apos.tasks.getReq();
    var product = apos.products.newInstance();
    product.title = 'initial title';
    product.tags = [];
    return apos.products.insert(req, product)
      .then(doc => {
        assert(doc.type === 'product');
        assert(doc.workflowGuid);
        assert(doc.workflowLocale === 'default-draft');
      });
  });

  // block repeats
  it('Commit a change', (done) => {
    var req = apos.tasks.getReq({locale: 'default-draft'});

    async.waterfall([getProductDraft, updateProductDraft, commitUpdate], (err, res) => {
      assert(!err);
      assert(typeof res === 'string', 'response should be an id');
      done();
    });

    function getProductDraft(callback) {
      apos.products.find(req).toArray().then(docs => {
        assert(docs[0]);
        return callback(null, docs[0]);
      })
        .catch(e => {
          return callback(e);
        });
    }

    function updateProductDraft(product, callback) {
      product.title = 'new title';
      apos.products.update(req, product, (err, res) => {
        return callback(err, res);
      });
    }

    function commitUpdate(product, callback) {
      apos.workflow.commitLatest(req, product._id, (err, res) => {
        revertId = res;
        return callback(err, res);
      });
    }
  });

  it('Check for live document after commit', done => {
    const req = apos.tasks.getReq();
    apos.products.find(req).toArray().then(docs => {
      assert(docs[0].title === 'new title');
      assert(!docs[0].trash);
      done();
    });
  });
  // end block repeats

  // block repeats
  it('Commmit a change', (done) => {
    var req = apos.tasks.getReq({locale: 'default-draft'});

    async.waterfall([getProductDraft, updateProductDraft, commitUpdate], (err, res) => {

      assert(!err);
      assert(typeof res === 'string', 'response should be an id');
      done();
    });

    function getProductDraft(callback) {
      apos.products.find(req).toArray().then(docs => {
        assert(docs[0]);
        return callback(null, docs[0]);
      })
        .catch(e => {
          return callback(e);
        });
    }

    function updateProductDraft(product, callback) {
      product.title = 'new title 2';
      apos.products.update(req, product, (err, res) => {
        return callback(err, res);
      });
    }

    function commitUpdate(product, callback) {
      apos.workflow.commitLatest(req, product._id, (err, res) => {
        return callback(err, res);
      });
    }
    // end block repeats
  });

  it('Check for live document after commit', done => {
    const req = apos.tasks.getReq();
    apos.products.find(req).toArray().then(docs => {
      assert(docs[0].title === 'new title 2');
      assert(!docs[0].trash);
      // Verifies base case for the next group of tests. -Tom
      assert(Array.isArray(docs[0].tags));
      done();
    });
  });

  it('Commit a change that deletes a property', (done) => {
    var req = apos.tasks.getReq({locale: 'default-draft'});

    async.waterfall([getProductDraft, updateProductDraft, commitUpdate], (err, res) => {

      assert(!err);
      assert(typeof res === 'string', 'response should be an id');
      done();
    });

    function getProductDraft(callback) {
      apos.products.find(req).toArray().then(docs => {
        assert(docs[0]);
        return callback(null, docs[0]);
      })
        .catch(e => {
          return callback(e);
        });
    }

    function updateProductDraft(product, callback) {
      delete product.tags;
      apos.products.update(req, product, (err, res) => {
        return callback(err, res);
      });
    }

    function commitUpdate(product, callback) {
      apos.workflow.commitLatest(req, product._id, (err, res) => {
        return callback(err, res);
      });
    }
    // end block repeats
  });

  it('Check for live document after commit: no more tags property', done => {
    const req = apos.tasks.getReq();
    apos.products.find(req).toArray().then(docs => {
      assert(docs[0].title === 'new title 2');
      assert(!docs[0].trash);
      assert(!_.has(docs[0], 'tags'));
      done();
    });
  });

  it('Test revert', done => {
    const req = apos.tasks.getReq();
    assert(revertId);

    async.waterfall([revert, check], (err, docs) => {
      assert(!err);
      assert(docs[0].title === 'new title');
      assert(!docs[0].trash);
      done();
    });

    function revert (callback) {
      apos.workflow.revert(req, revertId, (err, res) => {
        assert(!err);
        callback(err);
      });
    }

    function check (callback) {
      var req = apos.tasks.getReq({locale: 'default-draft'});
      apos.products.find(req).toArray().then(docs => {
        callback(null, docs);
      }).catch(callback);
    }
  });

  it('Test revert to live', done => {
    const req = apos.tasks.getReq({ locale: 'default-draft' });

    async.waterfall([ getProduct, revertToLive, check ], (err, docs) => {
      assert(!err);
      assert(docs[0].title === 'new title 2');
      assert(!docs[0].trash);
      done();
    });

    function getProduct (callback) {
      apos.products.find(req).toObject(callback);
    }

    function revertToLive (product, callback) {
      apos.workflow.revertToLive(req, product._id, (err, res) => {
        assert(!err);
        callback(err);
      });
    }

    function check (callback) {
      var req = apos.tasks.getReq({locale: 'default-draft'});
      apos.products.find(req).toArray(callback);
    }
  });

  it('1 doc committable after a modification to product, 0 after commit', done => {
    const req = apos.tasks.getReq({ locale: 'default-draft' });
    var product;
    async.series([ getProductDraft, updateProductDraft, _.partial(checkCommittable, 1, 'new title 3'), commit, _.partial(checkCommittable, 0, false) ], function(err) {
      assert(!err);
      done();
    });

    function getProductDraft(callback) {
      apos.products.find(req).toObject(function(err, _product) {
        product = _product;
        return callback(err);
      });
    }

    function updateProductDraft(callback) {
      product.title = 'new title 3';
      apos.products.update(req, product, callback);
    }

    function commit(callback) {
      apos.workflow.commitLatest(req, product._id, callback);
    }

    function checkCommittable(n, title0, callback) {
      apos.products.find(req, { workflowModified: true }).toArray(function(err, docs) {
        assert(!err);
        assert(docs.length === n);
        if ((n > 0) && title0) {
          assert(docs[0].title === title0);
        }
        return callback(null);
      });
    }

  });

});
